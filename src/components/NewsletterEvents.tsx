"use client";

import { FormEvent, useRef, useState } from "react";

export default function NewsletterEvents() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (inputRef.current) inputRef.current.value = "";
    setMsg("Thank you for subscribing.");
  };

  return (
    <section className="relative" style={{ backgroundColor: "#f8f5f0" }}>
      <div className="max-w-[1480px] mx-auto px-6 md:px-14 py-24 md:py-32">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-24">
          <div className="reveal">
            <div className="text-[11px] tracking-[.34em] font-body font-light opacity-70 mb-6">06 · EVENTS & POP-UPS</div>
            <h2 className="font-display font-black text-[44px] md:text-[56px] leading-none mb-10" style={{ color: "var(--night)" }}>
              Meet us at the<br />
              <span className="italic font-medium" style={{ color: "var(--kathakali)" }}>market</span>.
            </h2>
            <div className="space-y-8">
              <div className="border-t border-black/10 pt-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-display text-2xl font-bold" style={{ color: "var(--night)" }}>Fort Kochi Art Fest</h3>
                    <p className="font-body font-light mt-2 opacity-80" style={{ color: "var(--night)" }}>David Hall Art Gallery & Cafe</p>
                  </div>
                  <div className="text-right">
                    <p className="font-body tracking-wider text-sm" style={{ color: "var(--night)" }}>OCT 14 - 15</p>
                    <p className="font-body font-light text-xs opacity-70 mt-1" style={{ color: "var(--night)" }}>10 AM - 6 PM</p>
                  </div>
                </div>
              </div>
              <div className="border-t border-black/10 pt-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-display text-2xl font-bold" style={{ color: "var(--night)" }}>Bangalore Literature Festival</h3>
                    <p className="font-body font-light mt-2 opacity-80" style={{ color: "var(--night)" }}>The Lalit Ashok</p>
                  </div>
                  <div className="text-right">
                    <p className="font-body tracking-wider text-sm" style={{ color: "var(--night)" }}>DEC 02 - 03</p>
                    <p className="font-body font-light text-xs opacity-70 mt-1" style={{ color: "var(--night)" }}>9 AM - 7 PM</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="reveal">
            <div className="text-[11px] tracking-[.34em] font-body font-light opacity-70 mb-6">NEWSLETTER</div>
            <h2 className="font-display font-black text-[44px] md:text-[56px] leading-none mb-6" style={{ color: "var(--night)" }}>
              A letter from the<br />
              <span className="italic font-medium" style={{ color: "var(--kathakali)" }}>studio</span>.
            </h2>
            <p className="font-body font-light text-[17px] leading-loose mb-10 opacity-80 max-w-[40ch]" style={{ color: "var(--night)" }}>
              Join our mailing list to receive updates on new releases, original artwork drops, and studio news. We write once a month, never more.
            </p>
            <form onSubmit={handleSubmit} className="flex items-center gap-4 border-b border-black/30 pb-3">
              <div className="flex-1">
                <input
                  ref={inputRef}
                  type="email"
                  required
                  placeholder="Enter your email address"
                  className="w-full bg-transparent font-body font-light text-lg focus:outline-none placeholder:opacity-50"
                  style={{ color: "var(--night)" }}
                />
              </div>
              <button type="submit" className="text-[13px] tracking-[.26em] font-body font-bold hover:opacity-70 transition-opacity" style={{ color: "var(--night)" }}>
                SUBSCRIBE
              </button>
            </form>
            <span className="block mt-4 text-[12px] tracking-[.2em] font-body italic opacity-70 min-h-[20px]" style={{ color: "var(--night)" }}>{msg}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
