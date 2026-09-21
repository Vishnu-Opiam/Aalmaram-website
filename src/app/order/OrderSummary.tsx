import { formatPaise } from "@/lib/format";

/** The shape both order pages read. */
export const ORDER_SUMMARY_SELECT =
  "order_number, email, subtotal_paise, discount_paise, shipping_paise, tax_paise, total_paise, discount_code, shipping_address, placed_at, order_items ( title, variant_title, quantity, total_paise )";

export interface OrderSummaryData {
  subtotal_paise: number;
  discount_paise: number;
  shipping_paise: number;
  tax_paise: number;
  total_paise: number;
  discount_code: string | null;
  shipping_address: unknown;
  order_items: { title: string; variant_title: string; quantity: number; total_paise: number }[];
}

/** Lines, totals and address — shared by the post-checkout page and the emailed order link. */
export default function OrderSummary({ order }: { order: OrderSummaryData }) {
  const address = (order.shipping_address ?? {}) as Record<string, string>;

  return (
    <>
      <ul
        className="mt-12 divide-y"
        style={{ borderTop: "1px solid rgba(35,47,72,.12)", borderColor: "rgba(35,47,72,.12)" }}
      >
        {order.order_items.map((item, i) => (
          <li key={i} className="py-5 flex justify-between gap-6">
            <div>
              <div className="font-display italic text-[18px]">{item.title}</div>
              <div className="mt-1 text-[11.5px] tracking-[.2em] font-body font-light opacity-60">
                {item.variant_title.toUpperCase()} · ×{item.quantity}
              </div>
            </div>
            <div className="font-display text-[18px] whitespace-nowrap">
              {formatPaise(item.total_paise)}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-8 space-y-3 text-[14px] font-body">
        <Row label="Subtotal" value={formatPaise(order.subtotal_paise)} />
        {order.discount_paise > 0 && (
          <Row
            label={`Discount${order.discount_code ? ` (${order.discount_code})` : ""}`}
            value={`− ${formatPaise(order.discount_paise)}`}
          />
        )}
        <Row
          label="Shipping"
          value={order.shipping_paise === 0 ? "Free" : formatPaise(order.shipping_paise)}
        />
        {order.tax_paise > 0 && <Row label="Tax" value={formatPaise(order.tax_paise)} />}
        <div
          className="flex items-baseline justify-between pt-4"
          style={{ borderTop: "1px solid rgba(35,47,72,.15)" }}
        >
          <span className="text-[11px] tracking-[.28em] opacity-70">TOTAL PAID</span>
          <span className="font-display text-[26px]">{formatPaise(order.total_paise)}</span>
        </div>
      </div>

      <div className="mt-12">
        <div className="text-[10px] tracking-[.26em] font-body opacity-65">SHIPPING TO</div>
        <p className="mt-2 font-body font-light text-[14.5px] leading-relaxed">
          {[
            address.name,
            address.line1,
            address.line2,
            [address.city, address.state].filter(Boolean).join(", "),
            address.pincode,
          ]
            .filter(Boolean)
            .map((line, i) => (
              <span key={i}>
                {line}
                <br />
              </span>
            ))}
        </p>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="font-light opacity-75">{label}</span>
      <span>{value}</span>
    </div>
  );
}
