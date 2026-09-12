import {
  Body,
  Button,
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

export interface ShippingConfirmationProps {
  orderNumber: string;
  name: string;
  items: { title: string; variantTitle: string; quantity: number }[];
  courierName: string;
  awbCode: string;
  trackingUrl: string;
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

export default function ShippingConfirmation({
  orderNumber,
  name,
  items,
  courierName,
  awbCode,
  trackingUrl,
  address,
  supportEmail,
}: ShippingConfirmationProps) {
  return (
    <Html>
      <Head />
      <Preview>{`Order ${orderNumber} is on its way.`}</Preview>
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
            It&rsquo;s on its way, {name || "friend"}.
          </Heading>

          <Text style={{ fontFamily: BODY, fontSize: 15, color: NIGHT, lineHeight: 1.7 }}>
            Order <strong>{orderNumber}</strong> has left us with {courierName || "the courier"}.
            You can follow it the whole way.
          </Text>

          <Section style={{ margin: "28px 0" }}>
            <Button
              href={trackingUrl}
              style={{
                backgroundColor: NIGHT,
                color: MANUSCRIPT,
                fontFamily: BODY,
                fontSize: 12,
                letterSpacing: "0.24em",
                padding: "14px 28px",
                borderRadius: 2,
                textDecoration: "none",
              }}
            >
              TRACK THIS PARCEL
            </Button>
          </Section>

          <Text style={{ fontFamily: BODY, fontSize: 13, color: MUTED, margin: 0 }}>
            Tracking number <span style={{ color: NIGHT }}>{awbCode}</span>
            {courierName ? ` · ${courierName}` : ""}
          </Text>

          <Hr style={{ borderColor: "rgba(35,47,72,0.15)", margin: "28px 0" }} />

          <Section>
            {items.map((item, i) => (
              <Row key={i} style={{ marginBottom: 10 }}>
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
                    {item.variantTitle && item.variantTitle !== "Default"
                      ? `${item.variantTitle} · ×${item.quantity}`
                      : `×${item.quantity}`}
                  </Text>
                </Column>
              </Row>
            ))}
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
            GOING TO
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
            Anything at all about this parcel — simply reply, or write to{" "}
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
