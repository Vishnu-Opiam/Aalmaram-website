export default function BookCover() {
  return (
    <div className="book-stage">
      <div className="book drop-shadow-2xl cursor-pointer">
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

        {/* Inside Page (Right side, Pg2) */}
        <div className="book__inside">
          <img src="/books/Pg2.png" alt="Second Page" className="w-full h-full object-cover" />
          <div className="absolute inset-0 mix-blend-multiply pointer-events-none lighting-pg2" />
        </div>

        {/* The flippable Cover */}
        <div className="book__face">
          <div className="book__face-front">
            <img src="/books/Cover.png" alt="Book Cover" className="w-full h-full object-cover" />
            <div className="absolute inset-0 pointer-events-none lighting-cover" />
          </div>
          {/* Back of the cover when flipped (Left Page) */}
          <div className="book__face-back">
            <img src="/books/Pg1.png" alt="First Page" className="w-full h-full object-cover" />
            <div className="absolute inset-0 mix-blend-multiply pointer-events-none lighting-pg1" />
          </div>
        </div>

        <div className="book__pages" />
        <div className="book__top" />
        <div className="book__bottom" />
        <div className="book__shadow" />
      </div>
    </div>
  );
}
