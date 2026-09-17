import { NextResponse } from "next/server";
import { isCronAuthorised } from "@/lib/cron";
import { isEmailConfigured, sendAbandonedCheckout } from "@/lib/email";
import { siteUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * One recovery email per checkout left at the payment step (PLAN §4).
 *
 * A checkout row exists only once the buyer pressed Pay, so every one of these
 * got as far as the Razorpay window. Due an hour after that, and never after two
 * days, never twice, never to someone who has since bought something, and not
 * at all while Settings → Features has it switched off. Guarded by CRON_SECRET.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  if (!isCronAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const db = createAdminClient();
  const { data: features } = await db.from("settings").select("value").eq("key", "features").maybeSingle();
  if ((features?.value as { abandoned_checkout_email?: boolean } | null)?.abandoned_checkout_email === false) {
    return NextResponse.json({ skipped: "switched off in Settings" });
  }

  // Claiming stamps the rows. Without email configured, don't burn them.
  if (!isEmailConfigured()) {
    return NextResponse.json({ skipped: "RESEND_API_KEY is not set" });
  }

  const { data: due, error } = await db.rpc("claim_abandoned_checkouts", {
    p_after_minutes: 60,
    p_within_hours: 48,
    p_limit: 20,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: { checkout_id: string; sent: boolean; error?: string }[] = [];
  for (const checkout of due ?? []) {
    const lines = ((checkout.line_items ?? []) as { variant_id?: string; quantity?: number }[]).filter(
      (l) => typeof l.variant_id === "string"
    );
    const { data: variants } = await db
      .from("product_variants")
      .select("id, products ( title, status )")
      .in(
        "id",
        lines.map((l) => l.variant_id as string)
      );

    const items = lines.flatMap((line) => {
      const product = variants?.find((v) => v.id === line.variant_id)?.products;
      return product && product.status === "active" ? [{ title: product.title, quantity: line.quantity ?? 1 }] : [];
    });

    // Nothing left that can be bought: a reminder would lead nowhere.
    if (items.length === 0 || !checkout.email) {
      results.push({ checkout_id: checkout.id, sent: false, error: "nothing in it is still for sale" });
      continue;
    }

    const address = (checkout.shipping_address ?? {}) as { name?: string };
    const firstName = (address.name ?? "").trim().split(/\s+/)[0] ?? "";
    const result = await sendAbandonedCheckout(checkout.email, {
      name: firstName,
      items,
      recoverUrl: `${siteUrl()}/checkout?recover=${checkout.id}`,
    });
    if (!result.sent) console.error(`Abandoned-checkout email for ${checkout.id} failed: ${result.error}`);
    results.push({ checkout_id: checkout.id, ...result });
  }

  return NextResponse.json({
    claimed: results.length,
    sent: results.filter((r) => r.sent).length,
    results,
  });
}
