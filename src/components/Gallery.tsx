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
            Every interior spread is illustrated in a palette drawn from a Kerala afternoon — fern,
            lagoon, spice, earth. Plates are tipped onto archival sheets so the paper can hold the
            weight of the colour.
          </div>
        </div>

        {/* Asymmetric grid */}
        <div className="grid grid-cols-12 gap-6 md:gap-10">
          {/* Spread 1 — landscape */}
          <figure className="col-span-12 md:col-span-7 reveal">
            <div className="spread aspect-[7/5]">
              <div
                className="inner drift"
                style={{
                  background: `
                    radial-gradient(60% 80% at 30% 70%, rgba(63,94,63,.45), transparent 65%),
                    radial-gradient(80% 70% at 75% 30%, rgba(58,107,122,.5), transparent 60%),
                    linear-gradient(180deg, #e6d6b0 0%, #d8c69a 60%, #b89a63 100%)`,
                }}
              >
                <svg viewBox="0 0 700 500" className="absolute inset-0 w-full h-full">
                  <g stroke="#232f48" strokeWidth="1.6" fill="none" strokeLinecap="round">
                    <path d="M120 470 C 124 360, 132 250, 138 160" />
                    <path d="M138 160 C 110 130, 80 130, 60 150" />
                    <path d="M138 160 C 170 130, 200 130, 220 152" />
                    <path d="M138 160 C 132 130, 124 110, 108 95" />
                    <path d="M138 160 C 146 130, 156 112, 172 96" />
                    <path d="M138 160 C 140 138, 142 116, 142 96" />
                    <path d="M138 160 C 134 138, 130 118, 124 102" opacity=".7" />
                  </g>
                  <g stroke="#232f48" strokeWidth="1.2" fill="none">
                    <path d="M430 360 q 50 18 110 0" />
                    <path d="M455 360 v -55" />
                  </g>
                  <circle cx="540" cy="160" r="46" fill="#e07030" opacity=".75" />
                  <g stroke="#232f48" strokeWidth=".5" opacity=".25">
                    <path d="M340 380 q 20 -6 40 0 t 40 0 t 40 0 t 40 0 t 40 0" />
                    <path d="M340 400 q 20 -6 40 0 t 40 0 t 40 0 t 40 0 t 40 0" />
                    <path d="M340 420 q 20 -6 40 0 t 40 0 t 40 0 t 40 0 t 40 0" />
                  </g>
                </svg>
              </div>
            </div>
            <figcaption className="mt-4 flex justify-between items-baseline">
              <span className="font-display italic text-[16px]">Plate i · &ldquo;The river that remembers&rdquo;</span>
              <span className="text-[10.5px] tracking-[.28em] font-body font-light opacity-60">PAGE 12 / 13</span>
            </figcaption>
          </figure>

          {/* Spread 2 — portrait Theyyam */}
          <figure className="col-span-12 md:col-span-5 md:row-span-2 reveal">
            <div className="spread aspect-[3/4] md:aspect-[5/8]">
              <div
                className="inner drift"
                style={{
                  background: `
                    radial-gradient(70% 50% at 50% 30%, rgba(224,112,48,.85), transparent 65%),
                    radial-gradient(60% 60% at 50% 75%, rgba(164,66,44,.7), transparent 65%),
                    linear-gradient(180deg, #2a3853 0%, #232f48 100%)`,
                }}
              >
                <svg viewBox="0 0 400 600" className="absolute inset-0 w-full h-full">
                  <g stroke="#eee0bf" strokeWidth="1.1" fill="none" opacity=".85">
                    <circle cx="200" cy="240" r="78" />
                    <circle cx="200" cy="240" r="120" opacity=".55" />
                    <g>
                      <line x1="200" y1="80" x2="200" y2="160" />
                      <line x1="200" y1="320" x2="200" y2="400" />
                      <line x1="40" y1="240" x2="120" y2="240" />
                      <line x1="280" y1="240" x2="360" y2="240" />
                      <line x1="90" y1="130" x2="146" y2="186" />
                      <line x1="310" y1="130" x2="254" y2="186" />
                      <line x1="90" y1="350" x2="146" y2="294" />
                      <line x1="310" y1="350" x2="254" y2="294" />
                    </g>
                  </g>
                  <g stroke="#c6a15b" strokeWidth=".7" fill="none">
                    <circle cx="200" cy="240" r="40" />
                    <circle cx="200" cy="240" r="20" />
                  </g>
                  <line x1="60" y1="540" x2="340" y2="540" stroke="#eee0bf" strokeWidth=".5" opacity=".5" />
                </svg>
              </div>
            </div>
            <figcaption className="mt-4 flex justify-between items-baseline">
              <span className="font-display italic text-[16px]">Plate ii · &ldquo;Fire at the temple gate&rdquo;</span>
              <span className="text-[10.5px] tracking-[.28em] font-body font-light opacity-60">PAGE 34 / 35</span>
            </figcaption>
          </figure>

          {/* Spread 3 — manuscript text */}
          <figure className="col-span-12 md:col-span-7 reveal">
            <div className="spread aspect-[7/4]">
              <div
                className="inner drift"
                style={{ background: "radial-gradient(80% 80% at 50% 50%, #f1e5c9, #e2cf99 80%)" }}
              >
                <div className="absolute inset-0 grid grid-cols-2 gap-10 p-10 md:p-16">
                  <div>
                    <div className="text-[10px] tracking-[.34em] font-body font-light opacity-70 mb-4">CHAPTER FOUR</div>
                    <h4 className="font-display italic text-[26px] md:text-[34px] leading-tight" style={{ color: "var(--night)" }}>
                      The grandfather elephant sleeps under the banyan.
                    </h4>
                    <div className="mt-6 h-px w-12" style={{ background: "var(--kathakali)" }} />
                    <p className="mt-6 font-body font-light leading-loose text-[12.5px] md:text-[13.5px]" style={{ color: "#2a3855" }}>
                      When the rain comes early, before even the cuckoo is ready, the great tusker walks
                      the long path home, head heavy with the smell of jasmine and wet earth.
                    </p>
                    <p className="mt-3 font-body font-light leading-loose text-[12.5px] md:text-[13.5px]" style={{ color: "#2a3855" }}>
                      The villagers do not call him by name. They simply say —
                    </p>
                  </div>
                  <div className="relative">
                    <svg viewBox="0 0 220 320" className="absolute inset-0 w-full h-full">
                      <g stroke="#232f48" strokeWidth="1" fill="none" strokeLinecap="round">
                        <circle cx="110" cy="100" r="58" opacity=".95" />
                        <circle cx="110" cy="100" r="44" opacity=".7" />
                        <circle cx="110" cy="100" r="30" opacity=".5" />
                        <path d="M110 100 L 110 290" />
                        <path d="M92 130 C 86 180, 80 240, 78 290" />
                        <path d="M128 130 C 134 180, 140 240, 142 290" />
                        <path d="M76 116 C 66 170, 56 240, 52 290" />
                        <path d="M144 116 C 154 170, 164 240, 168 290" />
                      </g>
                      <line x1="40" y1="295" x2="180" y2="295" stroke="#a4422c" strokeWidth=".6" />
                      <text x="110" y="312" textAnchor="middle" fontFamily="Boska" fontStyle="italic" fontSize="11" fill="#a4422c">— ammachi&apos;s path —</text>
                    </svg>
                  </div>
                </div>
              </div>
            </div>
            <figcaption className="mt-4 flex justify-between items-baseline">
              <span className="font-display italic text-[16px]">Plate iii · &ldquo;Ammachi&apos;s path&rdquo;</span>
              <span className="text-[10.5px] tracking-[.28em] font-body font-light opacity-60">PAGE 48 / 49</span>
            </figcaption>
          </figure>

          {/* Spread 4 — wide footer plate */}
          <figure className="col-span-12 reveal">
            <div className="spread aspect-[16/6]">
              <div
                className="inner drift"
                style={{ background: "linear-gradient(180deg, #c6a15b 0%, #b89058 30%, #6b4a2e 100%)" }}
              >
                <svg viewBox="0 0 1200 450" className="absolute inset-0 w-full h-full">
                  <line x1="0" y1="200" x2="1200" y2="200" stroke="#eee0bf" strokeWidth=".7" opacity=".6" />
                  <g stroke="#232f48" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity=".95">
                    <g>
                      <path d="M120 360 C 124 290, 130 220, 134 150" />
                      <path d="M134 150 q -22 -18 -40 -8" />
                      <path d="M134 150 q  22 -18  40 -8" />
                      <path d="M134 150 q -8 -22 -22 -32" />
                      <path d="M134 150 q  8 -22  22 -32" />
                    </g>
                    <g transform="translate(80,0)">
                      <path d="M220 360 C 224 290, 230 220, 234 150" />
                      <path d="M234 150 q -22 -18 -40 -8" />
                      <path d="M234 150 q  22 -18  40 -8" />
                      <path d="M234 150 q -8 -22 -22 -32" />
                      <path d="M234 150 q  8 -22  22 -32" />
                    </g>
                    <g transform="translate(160,4)">
                      <path d="M320 360 C 324 290, 330 220, 334 150" />
                      <path d="M334 150 q -22 -18 -40 -8" />
                      <path d="M334 150 q  22 -18  40 -8" />
                      <path d="M334 150 q -8 -22 -22 -32" />
                      <path d="M334 150 q  8 -22  22 -32" />
                    </g>
                    <path d="M620 300 q 100 30 320 0" />
                    <path d="M660 300 q 0 -10 18 -10 h 230 q 18 0 18 10" />
                    <line x1="780" y1="290" x2="780" y2="240" />
                    <circle cx="780" cy="230" r="6" />
                    <g strokeWidth=".6" opacity=".5">
                      <path d="M520 340 q 30 -8 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0" />
                      <path d="M520 365 q 30 -8 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0" />
                      <path d="M520 390 q 30 -8 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0" />
                    </g>
                  </g>
                  <circle cx="1020" cy="120" r="36" fill="#eee0bf" opacity=".85" />
                </svg>
              </div>
            </div>
            <figcaption className="mt-4 flex justify-between items-baseline">
              <span className="font-display italic text-[16px]">Plate iv · &ldquo;Vallam at the hour the kingfisher sleeps&rdquo;</span>
              <span className="text-[10.5px] tracking-[.28em] font-body font-light opacity-60">PAGE 72 / 73</span>
            </figcaption>
          </figure>
        </div>
      </div>

      <div className="h-px mx-6 md:mx-14" style={{ background: "linear-gradient(to right, transparent, rgba(35,47,72,.18), transparent)" }} />
    </section>
  );
}
