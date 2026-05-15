const details = [
  {
    numeral: "i.",
    color: "var(--gold)",
    lineColor: "var(--kathakali)",
    title: "Archival Italian paper, 140 gsm.",
    text: "Acid-free, FSC-certified. It holds ink the way river silt holds the morning - without letting go.",
  },
  {
    numeral: "ii.",
    color: "var(--kathakali)",
    lineColor: "var(--gold)",
    title: "Hot foil stamping in Malabar gold.",
    text: "Six small foil moments - only where the page asks for them. The spine, the first letter of chapter one, the moon over the backwater.",
  },
  {
    numeral: "iii.",
    color: "var(--spice)",
    lineColor: "var(--spice)",
    title: "Smyth-sewn binding, cloth-cased.",
    text: "Bound to lie flat in a child's lap. The cloth is woven from unbleached cotton in Balaramapuram, the same village that weaves Onam mundus.",
  },
  {
    numeral: "iv.",
    color: "var(--lagoon)",
    lineColor: "var(--lagoon)",
    title: "Typeset to be read aloud.",
    text: "Set generously in Anderson Grotesk, with type sized so the grandparent reads aloud and the child reads along.",
  },
  {
    numeral: "v.",
    color: "var(--moss)",
    lineColor: "var(--moss)",
    title: "Numbered first edition.",
    text: "Each copy in the first edition is numbered by hand on the colophon, of an issue of one thousand two hundred.",
  },
  {
    numeral: "vi.",
    color: "var(--earth)",
    lineColor: "var(--earth)",
    title: "Wrapped in handmade khadi sleeve.",
    text: "So it arrives the way an heirloom should - quietly, in cloth, tied with a single length of jute.",
  },
];

export default function Craft() {
  return (
    <section id="craft" className="relative">
      <div className="max-w-[1480px] mx-auto px-6 md:px-14 py-24 md:py-36">
        <div className="grid md:grid-cols-12 gap-10 items-end mb-20 reveal">
          <div className="md:col-span-7">
            <div className="text-[11px] tracking-[.34em] font-body font-light opacity-70">04 · TACTILE CRAFT</div>
            <h3 className="mt-6 font-display font-black display-tight" style={{ fontSize: "clamp(34px, 4.6vw, 58px)" }}>
              A book made <span className="font-display italic font-medium" style={{ color: "var(--gold)" }}>to be held -</span> and to outlast the holder.
            </h3>
          </div>
          <div className="md:col-span-5 md:pl-10 font-body font-light leading-loose text-[15.5px] opacity-90">
            Every physical detail is meticulous. Foil where it earns its place. Paper that can hold a
            monsoon afternoon&apos;s fingerprints without complaint.
          </div>
        </div>

        <div className="grid grid-cols-12 gap-y-16 gap-x-10">
          {details.map((d) => (
            <article key={d.numeral} className="col-span-12 md:col-span-4 reveal">
              <div className="font-display italic text-[42px]" style={{ color: d.color }}>{d.numeral}</div>
              <div className="mt-4 h-px w-10" style={{ background: d.lineColor }} />
              <h4 className="mt-5 font-display text-[22px] leading-snug">{d.title}</h4>
              <p className="mt-3 font-body font-light leading-relaxed text-[14.5px] opacity-85">{d.text}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="h-px mx-6 md:mx-14 kasavu-band" />
    </section>
  );
}
