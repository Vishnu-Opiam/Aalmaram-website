"use client";

import { FormEvent, useRef, useState } from "react";

export default function NewsletterForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const email = inputRef.current?.value.trim() ?? "";
    if (!email || busy) return;

    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error || "Something went wrong. Please try again.");
        return;
      }
      if (inputRef.current) inputRef.current.value = "";
      setMsg("Thank you for subscribing.");
    } catch {
      setMsg("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
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
        <button
          type="submit"
          disabled={busy}
          className="text-[13px] tracking-[.26em] font-body font-bold hover:opacity-70 transition-opacity disabled:opacity-40"
          style={{ color: "var(--night)" }}
        >
          {busy ? "SENDING…" : "SUBSCRIBE"}
        </button>
      </form>
      <span
        className="block mt-4 text-[12px] tracking-[.2em] font-body italic opacity-70 min-h-[20px]"
        style={{ color: "var(--night)" }}
      >
        {msg}
      </span>
    </>
  );
}
