import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";

/**
 * The order receipt: a night-blue masthead with the gold wordmark, a parchment
 * page, and a night-blue foot. Tables and inline styles only — that is what
 * Gmail, Outlook and Apple Mail agree on.
 */
const NIGHT = "#232f48";
const GOLD = "#c6a15b";
const PARCHMENT = "#efdfbd";
const PAGE = "#e8d9b5";
const INK = "#232f48";
const BROWN = "#8a5a2b";
const MUTED = "#9a9c93";
const SPICE = "#d0692f";
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "Lato, 'Helvetica Neue', Helvetica, Arial, sans-serif";

export interface OrderConfirmationProps {
  orderNumber: string;
  name: string;
  /** ISO timestamp the order was placed. */
  placedAt: string;
  items: { title: string; variantTitle: string; quantity: number; totalPaise: number }[];
  subtotalPaise: number;
  discountPaise: number;
  discountCode: string | null;
  shippingPaise: number;
  taxPaise?: number;
  totalPaise: number;
  address: {
    name?: string;
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
  };
  /** Private link to the order page. */
  viewUrl?: string;
  supportEmail: string;
}

const rupees = (paise: number) =>
  "Rs. " +
  (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const goldRule = {
  height: 4,
  lineHeight: "4px",
  fontSize: 1,
  backgroundColor: GOLD,
  backgroundImage: `linear-gradient(90deg, ${GOLD} 0%, #f1dfb0 50%, ${GOLD} 100%)`,
};

export default function OrderConfirmation({
  orderNumber,
  name,
  placedAt,
  items,
  subtotalPaise,
  discountPaise,
  discountCode,
  shippingPaise,
  taxPaise = 0,
  totalPaise,
  address,
  viewUrl,
  supportEmail,
}: OrderConfirmationProps) {
  const firstName = name.trim().split(/\s+/)[0] || "friend";
  const date = new Date(placedAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
  const year = new Date(placedAt).getFullYear();
  const number = orderNumber.startsWith("#") ? orderNumber : `#${orderNumber}`;

  return (
    <Html lang="en">
      <Head />
      <Preview>{`Order ${number} is confirmed. Nanni, ${firstName}.`}</Preview>
      <Body style={{ backgroundColor: PAGE, margin: 0, padding: "32px 12px", fontFamily: SANS }}>
        <Container
          style={{
            maxWidth: 600,
            width: "100%",
            margin: "0 auto",
            backgroundColor: PARCHMENT,
            border: `1px solid ${NIGHT}`,
          }}
        >
          {/* Masthead */}
          <Section style={{ backgroundColor: NIGHT, padding: "40px 24px 34px", textAlign: "center" }}>
            <Text
              style={{
                fontFamily: SERIF,
                fontSize: 34,
                fontWeight: 700,
                color: GOLD,
                margin: 0,
                lineHeight: "40px",
                letterSpacing: "0.01em",
              }}
            >
              Aalmaram
            </Text>
            <Text
              style={{
                fontFamily: SANS,
                fontSize: 11,
                letterSpacing: "0.3em",
                color: "#a9b0c0",
                margin: "10px 0 0",
              }}
            >
              NANDU IN MUZIRIS
            </Text>
          </Section>
          <Section style={goldRule}>&nbsp;</Section>

          {/* Page */}
          <Section style={{ padding: "36px 40px 8px" }}>
            <Heading
              as="h1"
              style={{
                fontFamily: SERIF,
                fontSize: 32,
                lineHeight: "38px",
                fontWeight: 700,
                color: INK,
                margin: 0,
              }}
            >
              Your order is confirmed
            </Heading>
            <Text style={{ fontFamily: SANS, fontSize: 15, lineHeight: "24px", color: INK, margin: "16px 0 0" }}>
              Nanni, {firstName}. Your copy of our story is on its way into the world.
            </Text>
            <Text style={{ fontFamily: SANS, fontSize: 13, color: BROWN, margin: "18px 0 0" }}>
              Order {number} · {date}
            </Text>
          </Section>

          {/* Items */}
          <Section style={{ padding: "12px 40px 0" }}>
            {items.map((item, i) => (
              <Row key={i} style={{ borderBottom: `1px solid ${INK}` }}>
                <Column style={{ padding: "18px 0 14px", verticalAlign: "top" }}>
                  <Text style={{ fontFamily: SERIF, fontSize: 16, color: INK, margin: 0 }}>
                    {item.title}
                  </Text>
                  <Text style={{ fontFamily: SANS, fontSize: 11, color: MUTED, margin: "8px 0 0" }}>
                    {item.variantTitle && item.variantTitle !== "Default" ? `${item.variantTitle} · ` : ""}
                    Qty {item.quantity}
                  </Text>
                </Column>
                <Column align="right" style={{ padding: "18px 0 14px", verticalAlign: "middle", whiteSpace: "nowrap" }}>
                  <Text style={{ fontFamily: SANS, fontSize: 15, color: INK, margin: 0 }}>
                    {rupees(item.totalPaise)}
                  </Text>
                </Column>
              </Row>
            ))}
          </Section>

          {/* Totals */}
          <Section style={{ padding: "16px 40px 0" }}>
            <SummaryRow label="Subtotal" value={rupees(subtotalPaise)} />
            {discountPaise > 0 && (
              <SummaryRow
                label={discountCode ? `Discount (${discountCode})` : "Discount"}
                value={`− ${rupees(discountPaise)}`}
              />
            )}
            <SummaryRow label="Shipping" value={shippingPaise === 0 ? "Free" : rupees(shippingPaise)} />
            {taxPaise > 0 && <SummaryRow label="Tax" value={rupees(taxPaise)} />}
            <Row style={{ borderTop: `2px solid ${SPICE}` }}>
              <Column style={{ padding: "14px 0 0" }}>
                <Text style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 700, color: INK, margin: 0 }}>
                  Total
                </Text>
              </Column>
              <Column align="right" style={{ padding: "14px 0 0" }}>
                <Text style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 700, color: SPICE, margin: 0 }}>
                  {rupees(totalPaise)}
                </Text>
              </Column>
            </Row>
          </Section>

          {viewUrl && (
            <Section style={{ padding: "32px 40px 0", textAlign: "center" }}>
              <Button
                href={viewUrl}
                style={{
                  backgroundColor: NIGHT,
                  color: "#f4e9cf",
                  fontFamily: SANS,
                  fontSize: 14,
                  letterSpacing: "0.06em",
                  textDecoration: "underline",
                  padding: "15px 34px",
                }}
              >
                VIEW YOUR ORDER
              </Button>
            </Section>
          )}

          {/* Address */}
          <Section style={{ padding: "32px 40px 36px" }}>
            <Text
              style={{ fontFamily: SANS, fontSize: 11, letterSpacing: "0.2em", color: MUTED, margin: 0, fontWeight: 700 }}
            >
              SHIPPING TO
            </Text>
            <Text style={{ fontFamily: SANS, fontSize: 14, lineHeight: "24px", color: INK, margin: "10px 0 0" }}>
              {[
                address.name,
                address.line1,
                address.line2,
                [address.city, [address.state, address.pincode].filter(Boolean).join(" ")]
                  .filter(Boolean)
                  .join(", "),
                address.country || "India",
              ]
                .filter(Boolean)
                .map((line, i) => (
                  <span key={i}>
                    {line}
                    <br />
                  </span>
                ))}
            </Text>
          </Section>

          {/* Foot */}
          <Section style={goldRule}>&nbsp;</Section>
          <Section style={{ backgroundColor: NIGHT, padding: "28px 24px 26px", textAlign: "center" }}>
            <Text style={{ fontFamily: SANS, fontSize: 13, color: "#c9ccd4", margin: 0, lineHeight: "20px" }}>
              Questions? Reply to this email or write to{" "}
              <Link href={`mailto:${supportEmail}`} style={{ color: GOLD, textDecoration: "underline" }}>
                {supportEmail}
              </Link>
              .
            </Text>
            <Text style={{ fontFamily: SERIF, fontSize: 12, color: "#6f778a", margin: "12px 0 0" }}>
              © {year} Aalmaram
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <Row>
      <Column>
        <Text style={{ fontFamily: SANS, fontSize: 14, color: INK, margin: "0 0 8px" }}>{label}</Text>
      </Column>
      <Column align="right">
        <Text style={{ fontFamily: SANS, fontSize: 14, color: INK, margin: "0 0 8px" }}>{value}</Text>
      </Column>
    </Row>
  );
}
