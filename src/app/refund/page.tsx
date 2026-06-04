import LegalPage from "@/components/LegalPage";

export const metadata = {
  title: "Refund & Cancellation Policy · Aalmaram",
  description:
    "How to cancel orders, return books, and request refunds at Aalmaram.",
};

export default function RefundPage() {
  return (
    <LegalPage title="Refund & Cancellation Policy" updated="June 4, 2026">
      <p>
        We want every Aalmaram book to arrive in perfect condition and to be loved. If something
        is wrong with your order, we&rsquo;ll make it right. This policy explains how cancellations,
        returns, and refunds work.
      </p>

      <h2>1. Order cancellation</h2>
      <ul>
        <li>
          <strong>Before dispatch:</strong> You can cancel a regular order any time before it has
          been dispatched for a full refund. Email{" "}
          <a href="mailto:hello@aalmaram.com">hello@aalmaram.com</a> with your order number as soon
          as possible.
        </li>
        <li>
          <strong>After dispatch:</strong> Once your order is handed over to the courier, it cannot
          be cancelled. You may instead return it under the conditions below after delivery.
        </li>
        <li>
          <strong>Pre-orders:</strong> Pre-orders can be cancelled for a full refund at any time
          before the title ships. If the expected shipping window changes by more than 60 days,
          you may also cancel for a full refund regardless.
        </li>
      </ul>

      <h2>2. Returns &mdash; when we accept them</h2>
      <p>We accept returns only in the following situations:</p>
      <ul>
        <li>The book arrived <strong>damaged</strong> in transit (torn cover, broken spine, water damage, etc.).</li>
        <li>The book has a <strong>printing or binding defect</strong>.</li>
        <li>You received the <strong>wrong title</strong> or wrong quantity.</li>
        <li>The package was <strong>tampered with</strong> on delivery.</li>
      </ul>
      <p>
        Because books are reading copies and not resaleable once handled, we do not accept
        returns for change of mind, unwanted gifts, or because a story didn&rsquo;t suit a reader.
      </p>

      <h2>3. How to raise a return request</h2>
      <ol>
        <li>
          Email <a href="mailto:hello@aalmaram.com">hello@aalmaram.com</a> within{" "}
          <strong>7 days of delivery</strong> with your order number, a short description, and
          clear photographs of the issue (and of the outer packaging where relevant).
        </li>
        <li>
          Our team will respond within 2 business days with next steps. If approved, we will
          arrange a reverse pickup where serviceable, or share a return address.
        </li>
        <li>
          Please keep the book in its original packaging until the return is resolved.
        </li>
      </ol>

      <h2>4. Refunds</h2>
      <ul>
        <li>
          Approved refunds are processed to your <strong>original payment method</strong> via
          Razorpay.
        </li>
        <li>
          Refunds are initiated within <strong>3 business days</strong> of the returned item being
          received and inspected (or immediately for pre-dispatch cancellations).
        </li>
        <li>
          Depending on your bank or card issuer, the amount typically reflects in your account
          within <strong>5&ndash;10 business days</strong> after we initiate the refund.
        </li>
        <li>
          For damaged or wrong-item cases, we may at our option send a replacement copy instead of
          a refund, with your agreement.
        </li>
      </ul>

      <h2>5. Shipping charges</h2>
      <ul>
        <li>If the return is due to our error (damage, defect, wrong item), we cover return shipping.</li>
        <li>Original shipping charges, where paid, are refunded only when the entire order is returned due to our error.</li>
      </ul>

      <h2>6. Failed deliveries and returns to sender</h2>
      <p>
        If a package is returned to us because of an incorrect address, repeated failed delivery
        attempts, or refusal to accept, we will contact you to arrange re-shipment (re-shipping
        charges may apply) or to issue a refund for the product value, excluding original shipping.
      </p>

      <h2>7. Contact</h2>
      <p>
        Need help with a return or refund?<br />
        <strong>Aalmaram Books</strong><br />
        Email: <a href="mailto:hello@aalmaram.com">hello@aalmaram.com</a><br />
        We aim to respond within 2 business days.
      </p>
    </LegalPage>
  );
}
