import LegalPage from "@/components/LegalPage";

export const metadata = {
  title: "Contact Us · Aalmaram",
  description: "Get in touch with Aalmaram Books in Fort Kochi, Kerala.",
};

export default function ContactPage() {
  return (
    <LegalPage title="Contact Us" updated="June 4, 2026">
      <p>
        We love hearing from readers, parents, teachers, librarians, illustrators, and
        booksellers. Reach out and a real person at Aalmaram will write back.
      </p>

      <h2>Aalmaram Books</h2>
      <p>
        Fort Kochi<br />
        Ernakulam, Kerala 682001<br />
        India
      </p>

      <h2>General enquiries</h2>
      <p>
        Email: <a href="mailto:hello@aalmaram.com">hello@aalmaram.com</a><br />
        We aim to reply within 2 business days, Monday to Friday, 10:00&ndash;18:00 IST.
      </p>

      <h2>Orders, returns &amp; refunds</h2>
      <p>
        Email: <a href="mailto:hello@aalmaram.com">hello@aalmaram.com</a> with your order number in
        the subject line. Please also see our{" "}
        <a href="/refund">Refund &amp; Cancellation Policy</a> and{" "}
        <a href="/shipping">Shipping Policy</a>.
      </p>

      <h2>Wholesale, schools &amp; libraries</h2>
      <p>
        For bulk and trade enquiries write to{" "}
        <a href="mailto:hello@aalmaram.com">hello@aalmaram.com</a> with &ldquo;Wholesale&rdquo; in the
        subject line.
      </p>

      <h2>Press &amp; rights</h2>
      <p>
        For press, translation, or rights enquiries, email{" "}
        <a href="mailto:hello@aalmaram.com">hello@aalmaram.com</a>.
      </p>
    </LegalPage>
  );
}
