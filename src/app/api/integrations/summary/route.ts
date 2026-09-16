import { NextResponse } from "next/server";
import { isN8nAuthorised } from "@/lib/cron";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/integrations/summary?days=7
 *
 * The store's numbers for n8n's weekly digest (Flow 5), which used to ask
 * Shopify. Authenticated with the `x-aalmaram-token` header. The same figures
 * as the admin dashboard, from the same function.
 */

export const dynamic = "force-dynamic";

type Period = { orders: number; gross_paise: number; refunded_paise: number; units: number };

export async function GET(request: Request) {
  if (!isN8nAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const raw = new URL(request.url).searchParams.get("days") ?? "7";
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 1 || days > 366) {
    return NextResponse.json({ error: "days must be a whole number from 1 to 366" }, { status: 400 });
  }

  const { data, error } = await createAdminClient().rpc("store_analytics", { p_days: days });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const a = data as {
    from: string;
    to: string;
    current: Period;
    previous: Period;
    top_products: unknown[];
    low_stock: unknown[];
  };

  return NextResponse.json({
    days,
    from: a.from,
    to: a.to,
    orders: a.current.orders,
    units: a.current.units,
    gross_revenue_paise: a.current.gross_paise,
    refunded_paise: a.current.refunded_paise,
    net_revenue_paise: a.current.gross_paise - a.current.refunded_paise,
    previous: {
      orders: a.previous.orders,
      net_revenue_paise: a.previous.gross_paise - a.previous.refunded_paise,
    },
    top_products: a.top_products,
    low_stock: a.low_stock,
  });
}
