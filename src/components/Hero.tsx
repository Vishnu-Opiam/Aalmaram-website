export default function Hero() {
  return (
    <section className="relative" id="hero">
      <div className="max-w-[1480px] mx-auto px-6 md:px-14 pt-16 md:pt-28 pb-24 md:pb-36">
        <div className="flex items-center gap-5 mb-16 md:mb-24 reveal">
          <span className="h-px w-12" style={{ background: "var(--kathakali)" }} />
          <span className="text-[11px] tracking-[.34em] font-body font-light">Aalmaram · Books &amp; objects from Kerala</span>
          <span className="h-px w-24" style={{ background: "rgba(35,47,72,.25)" }} />
          <span className="ml-auto text-[11px] tracking-[.28em] font-body font-light hidden md:inline">
            Made in Kochi
          </span>
        </div>

        <div className="reveal">
          <h1
            className="font-display font-black display-tight text-night text-balance"
            style={{ fontSize: "clamp(40px, 6vw, 96px)" }}
          >
            The deeper the roots,<br />
            the further you{" "}
            <span className="font-display italic font-medium" style={{ color: "var(--spice)" }}>grow</span>.
          </h1>
        </div>

        <div
          className="mt-10 md:mt-14 max-w-[52ch] font-body font-light leading-loose text-[18px] md:text-[20px] reveal"
          style={{ color: "#2a3855" }}
        >
          <p>
            We make beautifully crafted books and objects that bring Kerala&apos;s history alive, for
            children and the families who carry it with them.
          </p>
        </div>

        <div className="mt-12 flex flex-wrap items-center gap-6 reveal">
          <a
            href="#products"
            className="btn-night px-10 py-4 text-[12.5px] tracking-[.26em] font-body font-normal inline-block"
          >
            See what we make
          </a>
          <a href="#about" className="qlink text-[12.5px] tracking-[.26em] font-body font-light">
            What Aalmaram is
          </a>
        </div>
      </div>

      <div className="h-[1px] kasavu-band mx-6 md:mx-14" />
    </section>
  );
}
