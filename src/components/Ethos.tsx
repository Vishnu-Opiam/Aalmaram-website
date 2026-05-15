export default function Ethos() {
  return (
    <section id="story" className="relative">
      <div className="max-w-[1480px] mx-auto px-6 md:px-14 py-24 md:py-40">
        <div className="grid md:grid-cols-12 gap-10 items-center relative">
          <div className="md:col-span-5 relative reveal">
            <div className="font-display italic numeral" style={{ color: "var(--gold)", opacity: 0.92 }}>01</div>
            <div className="absolute -bottom-2 left-0 right-0 h-px" style={{ background: "linear-gradient(to right, rgba(196,161,91,.5), transparent)" }} />
            <div className="mt-6 text-[11px] tracking-[.34em] font-body font-light opacity-70">THE ETHOS · WHY WE PUBLISH</div>
          </div>

          <div className="md:col-span-7 reveal">
            <h2 className="font-display font-black display-tight text-night" style={{ fontSize: "clamp(36px, 5vw, 64px)" }}>
              We publish slowly, <span className="font-display italic font-medium" style={{ color: "var(--spice)" }}>because some stories</span> deserve to outlast us.
            </h2>

            <div className="mt-10 max-w-[58ch] font-body font-light leading-loose text-[17px] space-y-6" style={{ color: "#2a3855" }}>
              <p>
                Aalmaram is named for the banyan - the tree that walks on its own roots, sending each
                new branch down into the earth to become another trunk. Our books are the same: stories
                passed grandmother to grandchild on moonlit verandahs, rooted again in archival paper
                and a slow, deliberate craft.
              </p>
              <p>
                We do not chase global trends. We belong to specific arbors, specific monsoons,
                specific ancestral homes. Each volume is meant to be held, dog-eared, and inherited.
              </p>
            </div>


          </div>
        </div>
      </div>

      <div className="h-px mx-6 md:mx-14" style={{ background: "linear-gradient(to right, transparent, rgba(35,47,72,.18), transparent)" }} />
    </section>
  );
}
