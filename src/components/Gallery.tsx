export default function Gallery() {
  return (
    <section id="gallery" className="relative">
      <div className="max-w-[1480px] mx-auto px-6 md:px-14 py-24 md:py-32">
        {/* Caption row */}
        <div className="grid md:grid-cols-12 gap-10 items-end mb-16 reveal">
          <div className="md:col-span-7">
            <div className="text-[11px] tracking-[.34em] font-body font-light opacity-70">02 · A VISUAL NARRATIVE</div>
            <h3 className="mt-6 font-display font-black display-tight" style={{ fontSize: "clamp(34px, 4.6vw, 58px)" }}>
              <span className="font-display italic font-medium capitalize" style={{ color: "var(--kathakali)" }}>Painted by hand,</span> printed with care.
            </h3>
          </div>
          <div className="md:col-span-5 md:pl-10 font-body font-light leading-loose text-[15.5px] opacity-90">
            Every interior spread is drawn in warm, earthy tones - spice, turmeric, earth, lagoon - that
            capture the feeling of a Kerala afternoon. Original artwork is printed on archival paper
            to preserve the depth of colour.
          </div>
        </div>

        {/* Asymmetric grid */}
        <div className="grid grid-cols-12 gap-6 md:gap-10">
          {/* Spread 1 — landscape */}
          <figure className="col-span-12 md:col-span-7 reveal">
            <div className="spread aspect-[7/5]">
              <div className="inner">
                <img src="/books/gallery-1.jpg" alt="Nandu in Muziris book" className="w-full h-full object-cover" />
              </div>
            </div>
          </figure>

          {/* Spread 2 — portrait Theyyam */}
          <figure className="col-span-12 md:col-span-5 md:row-span-2 reveal">
            <div className="spread aspect-[3/4] md:aspect-[5/8]">
              <div className="inner">
                <img src="/books/gallery-2.png" alt="Nandu in Muziris illustration" className="w-full h-full object-cover" />
              </div>
            </div>
          </figure>

          {/* Spread 3 — manuscript text */}
          <figure className="col-span-12 md:col-span-7 reveal">
            <div className="spread aspect-[7/4]">
              <div
                className="inner drift"
                style={{ background: "radial-gradient(80% 80% at 50% 50%, #f1e5c9, #e2cf99 80%)" }}
              >
                <div className="absolute inset-0 grid md:grid-cols-2 gap-10 p-10 md:p-16 items-center">
                  <div>
                    <div className="text-[10px] tracking-[.34em] font-body font-light opacity-70 mb-4">WHY THIS BOOK</div>
                    <h4 className="font-display italic text-[26px] md:text-[34px] leading-tight" style={{ color: "var(--night)" }}>
                      A 2,000-year-old port, told for the first time to children.
                    </h4>
                    <div className="mt-6 h-px w-12" style={{ background: "var(--kathakali)" }} />
                    <p className="mt-6 font-body font-light leading-loose text-[12.5px] md:text-[13.5px]" style={{ color: "#2a3855" }}>
                      Muziris was once the meeting point of Rome, Arabia and the East - then the sea
                      swallowed it whole. Through Nandu, a small crow searching for home, that lost
                      world becomes a story a child can hold.
                    </p>
                  </div>
                  <div className="space-y-6">
                    {[
                      ["Hand-painted", "Every spread illustrated by hand, printed on archival paper."],
                      ["A story of belonging", "A gentle tale about losing home and finding where you belong."],
                      ["Rooted in real history", "Drawn from Kerala's own forgotten port city."],
                    ].map(([title, body]) => (
                      <div key={title} className="flex gap-4">
                        <div className="mt-2 h-px w-8 shrink-0" style={{ background: "var(--kathakali)" }} />
                        <div>
                          <div className="font-display italic text-[17px] md:text-[19px]" style={{ color: "var(--night)" }}>{title}</div>
                          <p className="mt-1 font-body font-light leading-loose text-[12px] md:text-[13px]" style={{ color: "#2a3855" }}>{body}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </figure>
        </div>
      </div>

      <div className="h-px mx-6 md:mx-14" style={{ background: "linear-gradient(to right, transparent, rgba(35,47,72,.18), transparent)" }} />
    </section>
  );
}
