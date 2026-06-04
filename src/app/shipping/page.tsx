import LegalPage from "@/components/LegalPage";

export const metadata = {
  title: "Shipping Policy · Aalmaram",
  description: "Delivery timelines, charges, and regions for Aalmaram orders.",
};

export default function ShippingPage() {
  return (
    <LegalPage title="Shipping Policy" updated="June 4, 2026">
      <p>
        We ship our books from Fort Kochi, Kerala. This page explains how long delivery takes,
        what it costs, and how to track your order.
      </p>

      <h2>1. Where we ship</h2>
      <ul>
        <li><strong>Within India:</strong> we ship to all serviceable PIN codes across India.</li>
        <li><strong>International:</strong> select countries on request. Please email <a href="mailto:hello@aalmaram.com">hello@aalmaram.com</a> for a quote before placing an international order.</li>
      </ul>

      <h2>2. Processing time</h2>
      <ul>
        <li>In-stock orders are usually dispatched within <strong>2&ndash;4 business days</strong> of payment confirmation.</li>
        <li>Pre-orders ship within the window stated on the product page. We&rsquo;ll email you when your copy is on the way.</li>
        <li>Orders placed on Sundays or public holidays are processed the next business day.</li>
      </ul>

      <h2>3. Delivery timelines</h2>
      <p>Once dispatched, estimated delivery times are:</p>
      <ul>
        <li><strong>Kerala:</strong> 2&ndash;4 business days</li>
        <li><strong>Metros &amp; Tier 1 cities (rest of India):</strong> 4&ndash;6 business days</li>
        <li><strong>Other locations in India:</strong> 5&ndash;8 business days</li>
        <li><strong>International:</strong> 10&ndash;21 business days, depending on destination and customs</li>
      </ul>
      <p>
        These are estimates from our courier partners. Remote PIN codes, weather events, strikes,
        and customs clearance can extend timelines.
      </p>

      <h2>4. Shipping charges</h2>
      <ul>
        <li>Domestic shipping charges, where applicable, are calculated at checkout based on weight and destination.</li>
        <li>From time to time we offer free shipping on orders above a threshold; this is shown on the cart page when active.</li>
        <li>International shipping is quoted individually and paid before dispatch. Any customs duties, taxes, or import fees levied by the destination country are the recipient&rsquo;s responsibility.</li>
      </ul>

      <h2>5. Tracking your order</h2>
      <p>
        You will receive an email with tracking details once your order is handed to the courier.
        If you have not received tracking information within 5 business days of placing your
        order, write to us at <a href="mailto:hello@aalmaram.com">hello@aalmaram.com</a>.
      </p>

      <h2>6. Address accuracy</h2>
      <p>
        Please double-check your shipping address and phone number at checkout. We are not
        responsible for parcels lost due to incorrect or incomplete addresses. If you spot an
        error, contact us within 12 hours of placing your order and we&rsquo;ll do our best to update
        it before dispatch.
      </p>

      <h2>7. Damaged or lost parcels</h2>
      <p>
        If your parcel arrives damaged, or if tracking indicates it has been lost in transit,
        please contact us within 7 days of the expected delivery date. See our{" "}
        <a href="/refund">Refund &amp; Cancellation Policy</a> for the resolution process.
      </p>

      <h2>8. Contact</h2>
      <p>
        Questions about your shipment?<br />
        <strong>Aalmaram Books</strong><br />
        Email: <a href="mailto:hello@aalmaram.com">hello@aalmaram.com</a>
      </p>
    </LegalPage>
  );
}
