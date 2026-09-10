import { NextResponse } from "next/server";
import { z } from "zod";
import { PricingError, priceCart } from "@/lib/pricing";
import { createRazorpayOrder, isRazorpayConfigured } from "@/lib/razorpay";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Turns a basket into a Razorpay order.
 *
 * Everything the browser sends is treated as a request, not a fact: it names
 * variants, quantities and maybe a code, and the server decides what all of
 * that costs. The figures written to the checkout row are the ones Razorpay is
 * asked to charge, and later the ones the order is created from.
 */

const bodySchema = z.object({
  lines: z
    .array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1) }))
    .min(1)
    .max(20),
  discountCode: z.string().trim().max(64).nullish(),
  email: z.string().trim().email("That email doesn't look right.").max(254),
  address: z.object({
    name: z.string().trim().min(1, "A name is required.").max(120),
    phone: z
      .string()
      .trim()
      .regex(/^[0-9+\-\s]{8,20}$/, "That phone number doesn't look right."),
    line1: z.string().trim().min(1, "An address is required.").max(200),
    line2: z.string().trim().max(200).optional().default(""),
    city: z.string().trim().min(1, "A city is required.").max(100),
    state: z.string().trim().min(1, "A state is required.").max(100),
    pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/, "That PIN code doesn't look right."),
    country: z.string().trim().max(100).optional().default("India"),
  }),
});

const RATE_LIMIT = 12;
const RATE_WINDOW_SECONDS = 60;

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return `checkout:${ip}`;
}

export async function POST(request: Request) {
  const db = createAdminClient();

  const { data: allowed } = await db.rpc("rate_limit_hit", {
    p_key: clientKey(request),
    p_limit: RATE_LIMIT,
    p_window_seconds: RATE_WINDOW_SECONDS,
  });

  if (allowed === false) {
    return NextResponse.json(
      { error: "Too many attempts just now. Please wait a moment." },
      { status: 429 }
    );
  }

  if (!isRazorpayConfigured()) {
    return NextResponse.json(
      { error: "Payments are not configured yet. Please try again shortly." },
      { status: 503 }
    );
  }

  let parsed;
  try {
    parsed = bodySchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Please check the form." },
      { status: 400 }
    );
  }

  const { lines, discountCode, email, address } = parsed.data;

  let cart;
  try {
    cart = await priceCart({ lines, discountCode, email });
  } catch (err) {
    if (err instanceof PricingError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("Pricing failed", err);
    return NextResponse.json({ error: "Could not price your basket." }, { status: 500 });
  }

  if (cart.totalPaise < 100) {
    return NextResponse.json({ error: "That total is too small to charge." }, { status: 400 });
  }

  // The checkout row exists before Razorpay is called, so a payment can always
  // be traced back to exactly what was quoted.
  const { data: checkout, error: checkoutError } = await db
    .from("checkouts")
    .insert({
      email: email.toLowerCase(),
      line_items: cart.lines.map((line) => ({
        variant_id: line.variantId,
        quantity: line.quantity,
        unit_price_paise: line.unitPricePaise,
      })),
      discount_code: cart.discountCode,
      subtotal_paise: cart.subtotalPaise,
      discount_paise: cart.discountPaise,
      shipping_paise: cart.shippingPaise,
      tax_paise: cart.taxPaise,
      total_paise: cart.totalPaise,
      shipping_address: { ...address, email: email.toLowerCase() },
      status: "active",
    })
    .select("id")
    .single();

  if (checkoutError || !checkout) {
    console.error("Could not create checkout", checkoutError);
    return NextResponse.json({ error: "Could not start checkout." }, { status: 500 });
  }

  let razorpayOrder;
  try {
    razorpayOrder = await createRazorpayOrder({
      amountPaise: cart.totalPaise,
      receipt: checkout.id,
      notes: { checkout_id: checkout.id, email: email.toLowerCase() },
    });
  } catch (err) {
    console.error("Razorpay order creation failed", err);
    await db.from("checkouts").update({ status: "abandoned" }).eq("id", checkout.id);
    return NextResponse.json({ error: "Could not reach the payment provider." }, { status: 502 });
  }

  await db
    .from("checkouts")
    .update({ razorpay_order_id: razorpayOrder.id })
    .eq("id", checkout.id);

  return NextResponse.json({
    checkoutId: checkout.id,
    razorpayOrderId: razorpayOrder.id,
    keyId: process.env.RAZORPAY_KEY_ID,
    amountPaise: cart.totalPaise,
    summary: {
      subtotalPaise: cart.subtotalPaise,
      discountPaise: cart.discountPaise,
      shippingPaise: cart.shippingPaise,
      totalPaise: cart.totalPaise,
      discountCode: cart.discountCode,
      discountMessage: cart.discountMessage,
    },
  });
}
