export default function BookCover() {
  return (
    <div className="book-stage">
      <div className="book drop-shadow-2xl">
        <div className="book__back" />
        <div className="book__spine">
          <div className="h-full flex items-center justify-center">
            <div
              className="font-display italic text-[10px] tracking-[.3em] -rotate-90 whitespace-nowrap"
              style={{ color: "var(--gold)" }}
            >
              Aalmaram · 01
            </div>
          </div>
        </div>
        <div className="book__face">
          <div className="absolute inset-0 p-8 flex flex-col">
            <div className="h-px w-10" style={{ background: "var(--gold)" }} />
            <div className="mt-3 text-[9.5px] tracking-[.36em] font-body font-light" style={{ color: "var(--gold)" }}>
              A A L M A R A M
            </div>

            <div className="flex-1 flex items-center justify-center my-2">
              <svg viewBox="0 0 200 220" className="w-[78%] opacity-95" fill="none">
                <g stroke="#c6a15b" strokeWidth=".7" opacity=".95">
                  <circle cx="100" cy="78" r="62" />
                  <circle cx="100" cy="78" r="50" />
                  <circle cx="100" cy="78" r="38" />
                </g>
                <g stroke="#c6a15b" strokeWidth="1.1" strokeLinecap="round" opacity=".9">
                  <path d="M100 78 L100 200" />
                  <path d="M88 110 C 84 140, 80 170, 78 200" />
                  <path d="M112 110 C 116 140, 120 170, 122 200" />
                  <path d="M76 100 C 70 135, 64 170, 60 200" />
                  <path d="M124 100 C 130 135, 136 170, 140 200" />
                  <path d="M92 90 C 90 130, 88 175, 88 200" opacity=".55" />
                  <path d="M108 90 C 110 130, 112 175, 112 200" opacity=".55" />
                </g>
                <line x1="40" y1="202" x2="160" y2="202" stroke="#c6a15b" strokeWidth=".5" opacity=".5" />
              </svg>
            </div>

            <div className="text-center">
              <div className="font-display italic text-[18px] leading-[1.05] foil-text">
                Nandu in<br />Muziris
              </div>
              <div className="mt-3 h-px w-8 mx-auto" style={{ background: "var(--gold)" }} />
              <div
                className="mt-2 text-[8.5px] tracking-[.4em] font-body font-light"
                style={{ color: "rgba(238,224,191,.7)" }}
              >
                A BOOK OF KERALA STORIES
              </div>
            </div>
          </div>
        </div>
        <div className="book__pages" />
        <div className="book__shadow" />
      </div>
    </div>
  );
}
