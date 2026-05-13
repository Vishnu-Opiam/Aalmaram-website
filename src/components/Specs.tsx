const specs = [
  { label: "FORMAT", value: "240 × 280 mm" },
  { label: "PAGES", value: "84, full colour" },
  { label: "AGE", value: "6 to 96" },
  { label: "ISBN", value: "978-93-5996-021-4" },
  { label: "WORDS BY", value: "Maya P. Nair" },
  { label: "ILLUSTRATIONS", value: "Rohan Varma" },
  { label: "PRINTED", value: "Kochi, 2026" },
  { label: "EDITION", value: "First, of 1,200" },
];

export default function Specs() {
  return (
    <section id="specs" className="relative">
      <div className="max-w-[1480px] mx-auto px-6 md:px-14 py-20 md:py-28">
        <div className="grid grid-cols-12 gap-6 md:gap-10">
          <div className="col-span-12 md:col-span-3 reveal">
            <div className="text-[11px] tracking-[.34em] font-body font-light opacity-70">05 · COLOPHON</div>
            <h3 className="mt-4 font-display text-[28px] leading-tight">The book, in numbers.</h3>
          </div>

          <dl className="col-span-12 md:col-span-9 grid grid-cols-2 md:grid-cols-4 gap-y-10 gap-x-8 reveal">
            {specs.map((s) => (
              <div key={s.label}>
                <dt className="text-[10.5px] tracking-[.28em] font-body font-light opacity-65">{s.label}</dt>
                <dd className="mt-2 font-display text-[18px]">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
