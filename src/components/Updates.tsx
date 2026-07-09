export default function Updates() {
  return (
    <section id="news" className="relative" style={{ backgroundColor: "#f8f5f0" }}>
      <div className="max-w-[1480px] mx-auto px-6 md:px-14 py-24 md:py-32">
        <div className="mb-16 reveal">
          <div className="text-[11px] tracking-[.34em] font-body font-light opacity-70">03 · WHAT WE&apos;VE BEEN UP TO</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-24">
          {/* Events */}
          <div className="reveal">
            <h2 className="font-display font-black text-[36px] md:text-[46px] leading-none mb-10" style={{ color: "var(--night)" }}>
              <span className="italic font-medium" style={{ color: "var(--kathakali)" }}>Events</span>
            </h2>

            <article className="border-t border-black/10 pt-8">
              <div className="spread aspect-[7/5] mb-7">
                <div className="inner">
                  <img src="/books/nandu-launch.jpg" alt="The Nandu in Muziris Launch in Kochi" className="w-full h-full object-cover" />
                </div>
              </div>

              <div className="flex items-start justify-between gap-4">
                <h3 className="font-display text-[24px] md:text-[26px] font-bold leading-tight" style={{ color: "var(--night)" }}>
                  The Nandu in Muziris Launch
                </h3>
                <div className="text-right shrink-0 pl-4">
                  <p className="font-body tracking-wider text-[13px]" style={{ color: "var(--night)" }}>31 MAY 2026</p>
                  <p className="font-body font-light text-[12px] opacity-70 mt-1" style={{ color: "var(--night)" }}>Kochi</p>
                </div>
              </div>
              <p className="mt-3 font-body font-light text-[15px] leading-loose opacity-80 max-w-[46ch]" style={{ color: "var(--night)" }}>
                We gathered readers, families and friends in Kochi to send our first book into the world:
                an afternoon of storytelling, illustration, and one very small crow named Nandu.
              </p>
            </article>

            {/* Space for future events */}
            <p className="mt-10 pt-8 border-t border-black/10 font-body font-light text-[14px] italic opacity-60" style={{ color: "var(--night)" }}>
              More events soon. This is where we&apos;ll share what&apos;s next.
            </p>
          </div>

          {/* Journal */}
          <div className="reveal">
            <h2 className="font-display font-black text-[36px] md:text-[46px] leading-none mb-10" style={{ color: "var(--night)" }}>
              <span className="italic font-medium" style={{ color: "var(--kathakali)" }}>Journal</span>
            </h2>

            {/* TODO: Nivedith to replace with the first published post before go-live */}
            <article className="border-t border-black/10 pt-8">
              <div className="spread aspect-[7/5] mb-7">
                <div className="inner">
                  <img src="/books/gallery-2.png" alt="Aalmaram journal" className="w-full h-full object-cover" />
                </div>
              </div>

              <p className="text-[11px] tracking-[.28em] font-body font-light opacity-60 mb-3" style={{ color: "var(--night)" }}>
                COMING SOON
              </p>
              <h3 className="font-display text-[24px] md:text-[26px] font-bold leading-tight" style={{ color: "var(--night)" }}>
                The port that fed an empire
              </h3>
              <p className="mt-3 font-body font-light text-[15px] leading-loose opacity-80 max-w-[46ch]" style={{ color: "var(--night)" }}>
                Our first journal entry is on its way: a short read on Muziris, the lost Kerala port whose
                pepper once reached the heart of Rome.
              </p>
              <a href="#" className="inline-block mt-5 text-[12px] tracking-[.26em] font-body font-bold qlink" style={{ color: "var(--kathakali)" }}>
                READ MORE →
              </a>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}
