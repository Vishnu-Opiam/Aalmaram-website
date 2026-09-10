import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";

/** Same tokens as the hand-written templates in /emails, so the two families match. */
const MANUSCRIPT = "#f8f5f0";
const NIGHT = "#232f48";
const GOLD = "#c6a15b";
const MUTED = "#8a8577";
const DISPLAY = "'Playfair Display', Georgia, serif";
const BODY = "'Nunito', Helvetica, Arial, sans-serif";

export interface OrderConfirmationProps {
  orderNumber: string;
  name: string;
  items: { title: string; variantTitle: string; quantity: number; totalPaise: number }[];
  subtotalPaise: number;
  discountPaise: number;
  discountCode: string | null;
  shippingPaise: number;
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
  supportEmail: string;
}

const rupees = (paise: number) =>
  "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export default function OrderConfirmation({
  orderNumber,
  name,
  items,
  subtotalPaise,
  discountPaise,
  discountCode,
  shippingPaise,
  totalPaise,
  address,
  supportEmail,
}: OrderConfirmationProps) {
  return (
    <Html>
      <Head />
      <Preview>{`Order ${orderNumber} is confirmed — thank you.`}</Preview>
      <Body style={{ backgroundColor: MANUSCRIPT, margin: 0, padding: "32px 0" }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: "0 24px" }}>
          <Text
            style={{
              fontFamily: BODY,
              fontSize: 11,
              letterSpacing: "0.34em",
              color: MUTED,
              margin: 0,
            }}
          >
            AALMARAM
          </Text>

          <Heading
            style={{
              fontFamily: DISPLAY,
              fontSize: 30,
              color: NIGHT,
              fontWeight: 700,
              margin: "20px 0 0",
            }}
          >
            Thank you, {name || "friend"}.
          </Heading>

          <Text style={{ fontFamily: BODY, fontSize: 15, color: NIGHT, lineHeight: 1.7 }}>
            Your order <strong>{orderNumber}</strong> is confirmed and paid. We&rsquo;ll write again
            the moment it ships, with a tracking link.
          </Text>

          <Hr style={{ borderColor: "rgba(35,47,72,0.15)", margin: "28px 0" }} />

          <Section>
            {items.map((item, i) => (
              <Row key={i} style={{ marginBottom: 12 }}>
                <Column>
                  <Text
                    style={{
                      fontFamily: DISPLAY,
                      fontSize: 17,
                      fontStyle: "italic",
                      color: NIGHT,
                      margin: 0,
                    }}
                  >
                    {item.title}
                  </Text>
                  <Text style={{ fontFamily: BODY, fontSize: 12, color: MUTED, margin: "2px 0 0" }}>
                    {item.variantTitle} · ×{item.quantity}
                  </Text>
                </Column>
                <Column align="right">
                  <Text style={{ fontFamily: DISPLAY, fontSize: 16, color: NIGHT, margin: 0 }}>
                    {rupees(item.totalPaise)}
                  </Text>
                </Column>
              </Row>
            ))}
          </Section>

          <Hr style={{ borderColor: "rgba(35,47,72,0.15)", margin: "20px 0" }} />

          <Section>
            <SummaryRow label="Subtotal" value={rupees(subtotalPaise)} />
            {discountPaise > 0 && (
              <SummaryRow
                label={discountCode ? `Discount (${discountCode})` : "Discount"}
                value={`− ${rupees(discountPaise)}`}
              />
            )}
            <SummaryRow
              label="Shipping"
              value={shippingPaise === 0 ? "Free" : rupees(shippingPaise)}
            />
            <Row>
              <Column>
                <Text style={{ fontFamily: BODY, fontSize: 13, color: NIGHT, margin: "10px 0 0" }}>
                  <strong>Total paid</strong>
                </Text>
              </Column>
              <Column align="right">
                <Text
                  style={{
                    fontFamily: DISPLAY,
                    fontSize: 22,
                    color: NIGHT,
                    margin: "10px 0 0",
                  }}
                >
                  {rupees(totalPaise)}
                </Text>
              </Column>
            </Row>
          </Section>

          <Hr style={{ borderColor: "rgba(35,47,72,0.15)", margin: "28px 0" }} />

          <Text
            style={{
              fontFamily: BODY,
              fontSize: 10.5,
              letterSpacing: "0.26em",
              color: MUTED,
              margin: 0,
            }}
          >
            SHIPPING TO
          </Text>
          <Text style={{ fontFamily: BODY, fontSize: 14, color: NIGHT, lineHeight: 1.7 }}>
            {[
              address.name,
              address.line1,
              address.line2,
              [address.city, address.state].filter(Boolean).join(", "),
              address.pincode,
              address.country,
            ]
              .filter(Boolean)
              .map((line, i) => (
                <span key={i}>
                  {line}
                  <br />
                </span>
              ))}
          </Text>

          <Hr style={{ borderColor: "rgba(35,47,72,0.15)", margin: "28px 0" }} />

          <Text style={{ fontFamily: BODY, fontSize: 13, color: MUTED, lineHeight: 1.7 }}>
            Questions about this order? Simply reply, or write to{" "}
            <Link href={`mailto:${supportEmail}`} style={{ color: GOLD }}>
              {supportEmail}
            </Link>
            .
          </Text>
          <Text style={{ fontFamily: DISPLAY, fontSize: 15, fontStyle: "italic", color: NIGHT }}>
            Aalmaram · Books &amp; objects from Kerala
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <Row>
      <Column>
        <Text style={{ fontFamily: BODY, fontSize: 13, color: MUTED, margin: "4px 0" }}>
          {label}
        </Text>
      </Column>
      <Column align="right">
        <Text style={{ fontFamily: BODY, fontSize: 13, color: NIGHT, margin: "4px 0" }}>
          {value}
        </Text>
      </Column>
    </Row>
  );
}
