import { NextResponse } from "next/server";
import { z } from "zod";
import { PricingError, priceCart } from "@/lib/pricing";

/**
 * A read-only price for the basket, so the checkout page can show shipping and
 * a discount before anyone pays. Writes nothing and charges nothing — the same
 * pricing code runs again for real in POST /api/checkout.
 */

const bodySchema = z.object({
  lines: z
    .array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1) }))
    .min(1)
    .max(20),
  discountCode: z.string().trim().max(64).nullish(),
  email: z.string().trim().email().max(254).nullish(),
  state: z.string().trim().max(100).nullish(),
});

export async function POST(request: Request) {
  let parsed;
  try {
    parsed = bodySchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  if (!parsed.success) {
    return NextResponse.json({ error: "Please check your basket." }, { status: 400 });
  }

  try {
    const cart = await priceCart(parsed.data);
    return NextResponse.json({
      subtotalPaise: cart.subtotalPaise,
      discountPaise: cart.discountPaise,
      shippingPaise: cart.shippingPaise,
      totalPaise: cart.totalPaise,
      discountCode: cart.discountCode,
      discountMessage: cart.discountMessage,
      lines: cart.lines.map((line) => ({
        variantId: line.variantId,
        title: line.title,
        quantity: line.quantity,
        unitPricePaise: line.unitPricePaise,
        totalPaise: line.totalPaise,
      })),
    });
  } catch (err) {
    if (err instanceof PricingError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("Quote failed", err);
    return NextResponse.json({ error: "Could not price your basket." }, { status: 500 });
  }
}
