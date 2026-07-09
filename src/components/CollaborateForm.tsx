"use client";

import { FormEvent, useState } from "react";

export default function CollaborateForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [idea, setIdea] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/collaborate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, idea }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error || "Something went wrong. Please try again.");
        return;
      }
      setDone(true);
      setMsg("Thank you, your idea is on its way to us. We'll be in touch.");
    } catch {
      setMsg("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <p className="font-body font-light text-[17px] leading-loose italic" style={{ color: "var(--night)" }}>
        {msg}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-[540px]" aria-label="Share your idea with Aalmaram">
      <div className="preorder-field">
        <label htmlFor="collab-name" className="text-[10.5px] tracking-[.28em] font-body font-light opacity-65">NAME</label>
        <input
          id="collab-name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="preorder-input font-body text-[17px]"
        />
      </div>

      <div className="preorder-field">
        <label htmlFor="collab-email" className="text-[10.5px] tracking-[.28em] font-body font-light opacity-65">EMAIL</label>
        <input
          id="collab-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="preorder-input font-body text-[17px]"
        />
      </div>

      <div className="preorder-field">
        <label htmlFor="collab-idea" className="text-[10.5px] tracking-[.28em] font-body font-light opacity-65">TELL US YOUR IDEA</label>
        <textarea
          id="collab-idea"
          required
          rows={4}
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="A story, an idea, a piece of history…"
          className="preorder-input font-body text-[17px] resize-none"
        />
      </div>

      <div className="flex items-center gap-6 pt-2">
        <button
          type="submit"
          disabled={busy}
          className="btn-night px-10 py-4 text-[12.5px] tracking-[.26em] font-body font-normal disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send it our way"}
        </button>
        {msg && (
          <span className="text-[13px] font-body italic opacity-80" style={{ color: "var(--spice)" }}>{msg}</span>
        )}
      </div>
    </form>
  );
}
