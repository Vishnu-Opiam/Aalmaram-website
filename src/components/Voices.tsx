export default function Voices() {
  return (
    <section id="voices" className="relative">
      <div className="max-w-[1480px] mx-auto px-6 md:px-14 py-24 md:py-36">
        <div className="grid md:grid-cols-12 gap-10 items-start">
          <div className="md:col-span-4 reveal">
            <div className="font-display italic numeral" style={{ color: "var(--kathakali)", opacity: 0.92 }}>03</div>
            <div className="mt-6 text-[11px] tracking-[.34em] font-body font-light opacity-70">VOICES · ON THE WORK</div>
          </div>

          <div className="md:col-span-8 reveal">
            <blockquote className="font-display italic font-medium text-night leading-[1.1]" style={{ fontSize: "clamp(28px, 3.4vw, 44px)" }}>
              <span style={{ color: "var(--gold)", fontFamily: "'Boska', serif", fontStyle: "italic" }}>&ldquo;</span>
              A book that does not hurry. It does what the verandah did — it lets the story arrive at the child&apos;s own pace.
              When my daughter closed the cover she asked, very quietly, can we visit the river tomorrow.
              <span style={{ color: "var(--gold)" }}>&rdquo;</span>
            </blockquote>

          </div>
        </div>
      </div>

      <div className="h-px mx-6 md:mx-14" style={{ background: "linear-gradient(to right, transparent, rgba(196,161,91,.5), transparent)" }} />
    </section>
  );
}
