"use client";

import { FormEvent, useState } from "react";

interface Props {
  eventId: string;
  eventTitle: string;
}

export default function EventRegisterForm({ eventId, eventTitle }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/events/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, name, email, phone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error || "Something went wrong. Please try again.");
        return;
      }
      setDone(true);
      setMsg("You're registered. Check your inbox for confirmation.");
    } catch {
      setMsg("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <p
        className="mt-4 text-[12px] tracking-[.2em] font-body italic opacity-80"
        style={{ color: "var(--night)" }}
      >
        {msg}
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 text-[12px] tracking-[.26em] font-body font-bold hover:opacity-70 transition-opacity"
        style={{ color: "var(--kathakali)" }}
      >
        REGISTER →
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 space-y-3 max-w-[360px]" aria-label={`Register for ${eventTitle}`}>
      <input
        type="text"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        className="w-full bg-transparent border-b border-black/30 pb-2 font-body font-light text-base focus:outline-none placeholder:opacity-50"
        style={{ color: "var(--night)" }}
      />
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email address"
        className="w-full bg-transparent border-b border-black/30 pb-2 font-body font-light text-base focus:outline-none placeholder:opacity-50"
        style={{ color: "var(--night)" }}
      />
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Phone (optional)"
        className="w-full bg-transparent border-b border-black/30 pb-2 font-body font-light text-base focus:outline-none placeholder:opacity-50"
        style={{ color: "var(--night)" }}
      />
      <div className="flex items-center gap-6 pt-1">
        <button
          type="submit"
          disabled={busy}
          className="text-[12px] tracking-[.26em] font-body font-bold hover:opacity-70 transition-opacity disabled:opacity-40"
          style={{ color: "var(--night)" }}
        >
          {busy ? "SENDING…" : "CONFIRM"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[12px] tracking-[.2em] font-body font-light opacity-60 hover:opacity-100 transition-opacity"
          style={{ color: "var(--night)" }}
        >
          Cancel
        </button>
      </div>
      {msg && (
        <p className="text-[12px] tracking-[.1em] font-body italic opacity-80" style={{ color: "var(--spice)" }}>
          {msg}
        </p>
      )}
    </form>
  );
}
