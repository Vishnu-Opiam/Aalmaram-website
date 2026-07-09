const facts = [
  {
    label: "MUZIRIS · A FACT",
    quote:
      "Some historians believe the Roman Empire's decline was partly caused by how much gold it spent on Kerala's pepper.",
    bg: "var(--night)",
    accent: "var(--gold)",
  },
  {
    label: "MUZIRIS · A FACT",
    quote:
      "A single ship sailing from Muziris carried cargo worth the annual wages of an entire Roman army.",
    bg: "var(--spice)",
    accent: "#f1deae",
  },
  {
    label: "MUZIRIS · A FACT",
    quote:
      "A Tamil poet and the Roman writer Pliny the Elder both wrote about Muziris in the same century, from opposite ends of the world.",
    bg: "var(--earth)",
    accent: "var(--gold)",
  },
];

export default function AboutAalmaram() {
  return (
    <section id="about" className="relative">
      <div className="max-w-[1480px] mx-auto px-6 md:px-14 py-24 md:py-40">
        {/* Part 1 — body copy */}
        <div className="grid md:grid-cols-12 gap-10 items-start">
          <div className="md:col-span-4 reveal">
            <div className="font-display italic numeral" style={{ color: "var(--gold)", opacity: 0.92 }}>02</div>
            <div className="mt-6 text-[11px] tracking-[.34em] font-body font-light opacity-70">WHAT AALMARAM IS</div>
          </div>

          <div className="md:col-span-8 reveal">
            <h2 className="font-display font-black display-tight text-night" style={{ fontSize: "clamp(34px, 5vw, 62px)" }}>
              Children are growing up global, <span className="font-display italic font-medium" style={{ color: "var(--spice)" }}>and locally adrift.</span>
            </h2>

            <div className="mt-10 max-w-[60ch] font-body font-light leading-loose text-[17px] space-y-6" style={{ color: "#2a3855" }}>
              <p>
                The world our children grow into is global by default. What they can lose, quietly, is the
                ground beneath it: the particular history, language and memory of where they come from.
              </p>
              <p>
                Cultural transmission used to be ambient. It arrived through grandparents, verandah evenings
                and stories told a hundred times over. For many families now, it simply no longer does.
              </p>
              <p>
                Research is clear that bicultural competence, being at home in the wider world and in your
                own inheritance, helps children thrive. Roots and reach are not opposites.
              </p>
              <p>
                Kerala&apos;s stories are extraordinary, and they deserve to be told with real craft and
                beauty. That is what Aalmaram does.
              </p>
            </div>
          </div>
        </div>

        {/* Part 2 — three fact panels */}
        <div className="mt-20 md:mt-28 space-y-6 md:space-y-8">
          {facts.map((f, i) => (
            <div key={i} className="fact-panel reveal" style={{ background: f.bg }}>
              <div className="text-[10.5px] tracking-[.34em] font-body font-light" style={{ color: f.accent, opacity: 0.85 }}>
                {f.label}
              </div>
              <p
                className="mt-6 font-display font-medium display-tight max-w-[28ch] md:max-w-[24ch]"
                style={{ fontSize: "clamp(26px, 3.6vw, 50px)", color: "var(--ivory)" }}
              >
                {f.quote}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="h-px mx-6 md:mx-14" style={{ background: "linear-gradient(to right, transparent, rgba(35,47,72,.18), transparent)" }} />
    </section>
  );
}
