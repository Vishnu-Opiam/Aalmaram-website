import LegalPage from "@/components/LegalPage";

export const metadata = {
  title: "Privacy Policy · Aalmaram",
  description:
    "How Aalmaram Books collects, uses, and protects your personal information.",
};

export default function PrivacyPolicy() {
  return (
    <LegalPage title="Privacy Policy" updated="June 4, 2026">
      <p>
        Aalmaram Books (&ldquo;Aalmaram&rdquo;, &ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;) is committed to
        protecting the privacy of every reader, customer, and visitor who interacts with our
        website, products, and services. This Privacy Policy explains what information we collect,
        how we use it, and the choices you have. By using <a href="https://aalmaram.com">aalmaram.com</a>{" "}
        (the &ldquo;Site&rdquo;) or placing an order, you agree to the practices described below.
      </p>

      <h2>1. Information we collect</h2>
      <p>We collect information that you provide to us directly, as well as limited information collected automatically when you use the Site.</p>
      <ul>
        <li><strong>Contact and order details:</strong> name, shipping and billing address, email address, phone number, and order history.</li>
        <li><strong>Payment information:</strong> processed securely by our payment partner Razorpay. We do not store full card numbers, CVV, UPI PIN, or net-banking credentials on our servers.</li>
        <li><strong>Account and pre-order information:</strong> details you submit through pre-order, newsletter, or contact forms.</li>
        <li><strong>Device and usage data:</strong> IP address, browser type, pages visited, and referring URLs, collected through cookies and similar technologies.</li>
      </ul>

      <h2>2. How we use your information</h2>
      <ul>
        <li>To process orders, payments, refunds, and shipping.</li>
        <li>To communicate with you about your order, pre-order status, or customer-service queries.</li>
        <li>To send newsletters and updates about new titles, but only where you have opted in. You can unsubscribe at any time.</li>
        <li>To improve the Site, our books, and our service.</li>
        <li>To comply with applicable laws and prevent fraud.</li>
      </ul>

      <h2>3. Sharing your information</h2>
      <p>We do not sell your personal information. We share data only with trusted partners who help us operate our business, including:</p>
      <ul>
        <li><strong>Payment processors</strong> such as Razorpay Software Private Limited for secure payment handling.</li>
        <li><strong>Shipping and logistics partners</strong> to deliver your order.</li>
        <li><strong>Technology providers</strong> for hosting, email delivery, and analytics.</li>
        <li><strong>Government or legal authorities</strong> where disclosure is required by law.</li>
      </ul>

      <h2>4. Cookies</h2>
      <p>
        We use cookies and similar technologies to remember your cart, keep you signed in,
        understand how the Site is used, and improve your experience. You can disable cookies
        in your browser settings; some parts of the Site may not function correctly if you do.
      </p>

      <h2>5. Data retention</h2>
      <p>
        We retain personal information for as long as needed to fulfil the purposes set out in
        this policy, comply with our legal obligations (such as tax and accounting requirements),
        resolve disputes, and enforce our agreements.
      </p>

      <h2>6. Security</h2>
      <p>
        We use reasonable administrative, technical, and physical safeguards to protect your
        information. Payments are handled by Razorpay over encrypted (TLS) connections. However,
        no method of transmission or storage is 100% secure, and we cannot guarantee absolute
        security.
      </p>

      <h2>7. Your rights</h2>
      <p>
        Subject to applicable law (including India&rsquo;s Digital Personal Data Protection Act, 2023),
        you may request access to, correction of, or deletion of your personal information, and
        withdraw consent to marketing communications. To exercise these rights, write to{" "}
        <a href="mailto:hello@aalmaram.com">hello@aalmaram.com</a>.
      </p>

      <h2>8. Children&rsquo;s privacy</h2>
      <p>
        Although our books are made for children, our Site and purchase flow are intended for
        adults (parents, guardians, librarians, gift-givers). We do not knowingly collect personal
        information from children under 18. If you believe a child has provided us information,
        please contact us so we can delete it.
      </p>

      <h2>9. Third-party links</h2>
      <p>
        The Site may contain links to third-party websites. We are not responsible for the privacy
        practices of those sites and encourage you to read their policies.
      </p>

      <h2>10. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. The &ldquo;Last updated&rdquo; date at the top
        of the page indicates when it was last revised. Material changes will be communicated via
        the Site or by email where appropriate.
      </p>

      <h2>11. Contact us</h2>
      <p>
        Questions about this policy or your data?<br />
        <strong>Aalmaram Books</strong><br />
        Fort Kochi, Kerala, India<br />
        Email: <a href="mailto:hello@aalmaram.com">hello@aalmaram.com</a>
      </p>
    </LegalPage>
  );
}
