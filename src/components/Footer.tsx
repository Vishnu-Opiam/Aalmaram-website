"use client";

export default function Footer() {
  return (
    <footer className="relative">
      <div className="h-px mx-6 md:mx-14" style={{ background: "linear-gradient(to right, transparent, rgba(224,112,48,.5), transparent)" }} />

      <div className="max-w-[1480px] mx-auto px-6 md:px-14 py-16 md:py-20">
        <div className="grid grid-cols-12 gap-10">
          <div className="col-span-12 md:col-span-6">
            <div className="font-display font-black text-[44px] display-tight" style={{ color: "var(--night)" }}>Aalmaram</div>
            <div className="mt-2 font-display italic text-[15px] opacity-80">Books from Kerala · since 2026</div>
            <p className="mt-8 max-w-[40ch] font-body font-light leading-loose text-[14.5px] opacity-85">
              A small press in Fort Kochi making picture books, chapter books, and cultural objects
              for the children of Kerala - and the families who carry Kerala with them.
            </p>
          </div>

          

          <div className="col-span-6 md:col-span-3">
            <div className="text-[10.5px] tracking-[.28em] font-body font-light opacity-65">PRESS</div>
            <ul className="mt-5 space-y-3 font-body font-light text-[14.5px]">
              <li><a href="#" className="qlink">About us</a></li>
              <li><a href="#" className="qlink">The studio</a></li>
              <li><a href="#" className="qlink">Stockists</a></li>
              <li><a href="#" className="qlink">Journal</a></li>
            </ul>
          </div>
        </div>

        <div
          className="mt-16 pt-8 flex items-center justify-between flex-wrap gap-4 text-[11px] tracking-[.24em] font-body font-light opacity-70"
          style={{ borderTop: "1px solid rgba(35,47,72,.18)" }}
        >
          <span>© 2026 Aalmaram Books · Fort Kochi, Kerala</span>
          <span>Set in Boska &amp; Anderson Grotesk · Printed on archival paper</span>
          <span><a href="#" className="qlink">Privacy</a> · <a href="#" className="qlink">Terms</a></span>
        </div>
      </div>
    </footer>
  );
}
