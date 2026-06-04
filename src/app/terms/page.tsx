import LegalPage from "@/components/LegalPage";

export const metadata = {
  title: "Terms & Conditions · Aalmaram",
  description:
    "The terms governing your use of the Aalmaram website and purchases.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms & Conditions" updated="June 4, 2026">
      <p>
        Welcome to Aalmaram. These Terms &amp; Conditions (&ldquo;Terms&rdquo;) govern your access to and
        use of <a href="https://aalmaram.com">aalmaram.com</a> (the &ldquo;Site&rdquo;) and any purchase of
        books or related products from Aalmaram Books (&ldquo;Aalmaram&rdquo;, &ldquo;we&rdquo;, &ldquo;our&rdquo;, &ldquo;us&rdquo;). By
        using the Site or placing an order you accept these Terms in full. If you do not agree,
        please do not use the Site.
      </p>

      <h2>1. About us</h2>
      <p>
        Aalmaram Books is a small independent press based in Fort Kochi, Kerala, India, that
        creates picture books, chapter books, and cultural objects for children. All references to
        &ldquo;our&rdquo; products mean physical books and merchandise sold through the Site.
      </p>

      <h2>2. Eligibility</h2>
      <p>
        You must be at least 18 years old, or have the consent of a parent or guardian, to make a
        purchase on the Site. By placing an order you confirm that the information you provide is
        accurate and complete.
      </p>

      <h2>3. Orders and pre-orders</h2>
      <ul>
        <li>All orders are subject to acceptance and availability.</li>
        <li>Pre-orders reserve a copy from a forthcoming print run. Expected shipping windows are estimates and may change due to printing or logistics delays. We will keep you informed.</li>
        <li>We reserve the right to refuse or cancel any order at our discretion, including in cases of suspected fraud, pricing errors, or stock unavailability.</li>
      </ul>

      <h2>4. Pricing and payment</h2>
      <ul>
        <li>All prices are listed in Indian Rupees (INR &#8377;) unless otherwise stated and are inclusive of applicable taxes.</li>
        <li>Shipping charges, where applicable, are shown at checkout.</li>
        <li>Payments are processed securely by <strong>Razorpay</strong>. We accept major credit and debit cards, UPI, net banking, and supported wallets.</li>
        <li>Your order is confirmed only after successful payment authorisation.</li>
      </ul>

      <h2>5. Shipping and delivery</h2>
      <p>
        Please see our <a href="/shipping">Shipping Policy</a> for delivery timelines, charges,
        and supported regions.
      </p>

      <h2>6. Returns, refunds and cancellations</h2>
      <p>
        Please see our <a href="/refund">Refund &amp; Cancellation Policy</a> for details on
        returns, refunds, and cancellations.
      </p>

      <h2>7. Intellectual property</h2>
      <p>
        All content on the Site &mdash; including text, illustrations, photographs, the Aalmaram name
        and logo, book covers, interior art, and design &mdash; is owned by or licensed to Aalmaram
        Books and protected by Indian and international copyright and trademark law. You may not
        copy, reproduce, distribute, or create derivative works without our prior written
        permission, except for personal, non-commercial use of the Site.
      </p>

      <h2>8. User content</h2>
      <p>
        If you submit reviews, comments, photos, or other content to us, you grant Aalmaram a
        non-exclusive, royalty-free, worldwide licence to use, reproduce, and display that content
        in connection with our business. You confirm that you own the content or have the right to
        share it and that it does not infringe anyone&rsquo;s rights.
      </p>

      <h2>9. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Site for any unlawful purpose or in violation of any applicable law;</li>
        <li>Interfere with the operation or security of the Site;</li>
        <li>Attempt to gain unauthorised access to any account, system, or data;</li>
        <li>Use the Site to transmit malware, spam, or harmful content.</li>
      </ul>

      <h2>10. Disclaimers</h2>
      <p>
        The Site and our products are provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. To the
        fullest extent permitted by law, we disclaim all warranties, express or implied, including
        warranties of merchantability and fitness for a particular purpose. We do not warrant that
        the Site will be uninterrupted, error-free, or free of viruses.
      </p>

      <h2>11. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, Aalmaram, its directors, employees, and partners
        shall not be liable for any indirect, incidental, special, consequential, or punitive
        damages arising out of or in connection with your use of the Site or any purchase. Our
        total liability for any claim arising out of an order shall not exceed the amount paid by
        you for that order.
      </p>

      <h2>12. Indemnity</h2>
      <p>
        You agree to indemnify and hold Aalmaram harmless from any claim, loss, or expense
        (including reasonable legal fees) arising out of your breach of these Terms or your
        misuse of the Site.
      </p>

      <h2>13. Governing law and jurisdiction</h2>
      <p>
        These Terms are governed by the laws of India. Any dispute arising out of or in
        connection with these Terms shall be subject to the exclusive jurisdiction of the courts
        in Ernakulam, Kerala, India.
      </p>

      <h2>14. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. The &ldquo;Last updated&rdquo; date at the top of the
        page indicates when revisions were made. Continued use of the Site after changes are
        posted constitutes acceptance of the revised Terms.
      </p>

      <h2>15. Contact</h2>
      <p>
        Questions about these Terms?<br />
        <strong>Aalmaram Books</strong><br />
        Fort Kochi, Kerala, India<br />
        Email: <a href="mailto:hello@aalmaram.com">hello@aalmaram.com</a>
      </p>
    </LegalPage>
  );
}
