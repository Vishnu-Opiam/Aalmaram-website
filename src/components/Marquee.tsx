export default function Marquee() {
  return (
    <section aria-hidden="true" className="overflow-hidden py-6 reveal" style={{ borderTop: 0 }}>
      <div className="marquee-track font-display italic text-[24px] md:text-[34px]" style={{ color: "rgba(35,47,72,.45)" }}>
        <span>വായിക്കാം, പറയാം, ഓർമ്മിക്കാം</span>
        <span style={{ color: "var(--kathakali)" }}>·</span>
        <span>Let us read, let us tell, let us remember</span>
        <span style={{ color: "var(--gold)" }}>·</span>
        <span>The tree that walks on its own roots</span>
        <span style={{ color: "var(--spice)" }}>·</span>
        <span>വായിക്കാം, പറയാം, ഓർമ്മിക്കാം</span>
        <span style={{ color: "var(--kathakali)" }}>·</span>
        <span>Let us read, let us tell, let us remember</span>
        <span style={{ color: "var(--gold)" }}>·</span>
        <span>The tree that walks on its own roots</span>
        <span style={{ color: "var(--spice)" }}>·</span>
      </div>
    </section>
  );
}
