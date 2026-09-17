import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

/** Same tokens as the other transactional emails. */
const MANUSCRIPT = "#f8f5f0";
const NIGHT = "#232f48";
const GOLD = "#c6a15b";
const MUTED = "#8a8577";
const DISPLAY = "'Playfair Display', Georgia, serif";
const BODY = "'Nunito', Helvetica, Arial, sans-serif";

export interface AbandonedCheckoutProps {
  name: string;
  items: { title: string; quantity: number }[];
  recoverUrl: string;
  supportEmail: string;
}

/** One gentle note, once, about a basket left at the payment step. */
export default function AbandonedCheckout({ name, items, recoverUrl, supportEmail }: AbandonedCheckoutProps) {
  const first = items[0]?.title ?? "your books";
  return (
    <Html>
      <Head />
      <Preview>{`${first} is still waiting for you.`}</Preview>
      <Body style={{ backgroundColor: MANUSCRIPT, margin: 0, padding: "32px 0" }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: "0 24px" }}>
          <Text style={{ fontFamily: BODY, fontSize: 11, letterSpacing: "0.34em", color: MUTED, margin: 0 }}>
            AALMARAM
          </Text>

          <Heading style={{ fontFamily: DISPLAY, fontSize: 30, color: NIGHT, fontWeight: 700, margin: "20px 0 0" }}>
            Still thinking it over{name ? `, ${name}` : ""}?
          </Heading>

          <Text style={{ fontFamily: BODY, fontSize: 15, color: NIGHT, lineHeight: 1.7 }}>
            You got as far as paying and then stopped — perhaps the payment window closed, or life
            happened. Your basket is saved, and it takes one click to pick up where you left off.
          </Text>

          <Section style={{ margin: "8px 0 0" }}>
            {items.map((item, i) => (
              <Text
                key={i}
                style={{ fontFamily: DISPLAY, fontSize: 17, fontStyle: "italic", color: NIGHT, margin: "6px 0" }}
              >
                {item.title}
                <span style={{ fontFamily: BODY, fontStyle: "normal", fontSize: 12, color: MUTED }}>
                  {"  "}×{item.quantity}
                </span>
              </Text>
            ))}
          </Section>

          <Section style={{ margin: "28px 0" }}>
            <Button
              href={recoverUrl}
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
              RETURN TO YOUR BASKET
            </Button>
          </Section>

          <Text style={{ fontFamily: BODY, fontSize: 13, color: MUTED, lineHeight: 1.7 }}>
            Prices and availability are checked again when you return. If something went wrong with
            the payment itself, just reply — we&rsquo;ll sort it out.
          </Text>

          <Hr style={{ borderColor: "rgba(35,47,72,0.15)", margin: "28px 0" }} />

          <Text style={{ fontFamily: BODY, fontSize: 12, color: MUTED, lineHeight: 1.7 }}>
            This is the only reminder we will send about this basket. Questions?{" "}
            <Link href={`mailto:${supportEmail}`} style={{ color: GOLD }}>
              {supportEmail}
            </Link>
          </Text>
          <Text style={{ fontFamily: DISPLAY, fontSize: 15, fontStyle: "italic", color: NIGHT }}>
            Aalmaram · Books &amp; objects from Kerala
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
