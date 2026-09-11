import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Text } from "@react-email/components";

/** Same tokens as OrderConfirmation and the hand-written templates in /emails. */
const MANUSCRIPT = "#f8f5f0";
const NIGHT = "#232f48";
const GOLD = "#c6a15b";
const MUTED = "#8a8577";
const DISPLAY = "'Playfair Display', Georgia, serif";
const BODY = "'Nunito', Helvetica, Arial, sans-serif";

export interface OutOfStockRefundProps {
  name: string;
  amountPaise: number;
  items: string[];
  supportEmail: string;
}

const rupees = (paise: number) =>
  "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });

/**
 * Sent when a payment went through for a book that sold out in the seconds
 * between the quote and the order being written. No order exists; the money
 * has already been sent back.
 */
export default function OutOfStockRefund({ name, amountPaise, items, supportEmail }: OutOfStockRefundProps) {
  return (
    <Html>
      <Head />
      <Preview>{`We've refunded your ${rupees(amountPaise)} in full.`}</Preview>
      <Body style={{ backgroundColor: MANUSCRIPT, margin: 0, padding: "32px 0" }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: "0 24px" }}>
          <Text style={{ fontFamily: BODY, fontSize: 11, letterSpacing: "0.34em", color: MUTED, margin: 0 }}>
            AALMARAM
          </Text>

          <Heading style={{ fontFamily: DISPLAY, fontSize: 30, color: NIGHT, fontWeight: 700, margin: "20px 0 0" }}>
            We&rsquo;re so sorry, {name || "friend"}.
          </Heading>

          <Text style={{ fontFamily: BODY, fontSize: 15, color: NIGHT, lineHeight: 1.7 }}>
            {items.length > 0 ? (
              <>
                The last copy of <em>{items.join(", ")}</em> went to another reader in the moments
                while your payment was going through,
              </>
            ) : (
              <>What you ordered sold out in the moments while your payment was going through,</>
            )}{" "}
            so we couldn&rsquo;t fill your order.
          </Text>

          <Text style={{ fontFamily: BODY, fontSize: 15, color: NIGHT, lineHeight: 1.7 }}>
            We&rsquo;ve refunded the full <strong>{rupees(amountPaise)}</strong> to the way you paid.
            Banks usually take 5&ndash;7 working days to show it.
          </Text>

          <Hr style={{ borderColor: "rgba(35,47,72,0.15)", margin: "28px 0" }} />

          <Text style={{ fontFamily: BODY, fontSize: 13, color: MUTED, lineHeight: 1.7 }}>
            If you&rsquo;d like to hear when it&rsquo;s back, or anything looks wrong, simply reply or
            write to{" "}
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
