"use client";

import { useEffect, useState, useRef } from "react";
import { usePreOrder } from "@/context/PreOrderContext";

type Stage = "form" | "submitting" | "success";

export default function PreOrderModal() {
  const { isModalOpen, closeModal } = usePreOrder();
  const [stage, setStage] = useState<Stage>("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  /* Reset state when modal opens */
  useEffect(() => {
    if (isModalOpen) {
      setStage("form");
      setName("");
      setEmail("");
      setError("");
      setTimeout(() => nameRef.current?.focus(), 120);
    }
  }, [isModalOpen]);

  /* Close on Escape */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closeModal]);

  /* Lock body scroll */
  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isModalOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim() || !email.trim()) {
      setError("Please fill in both fields.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    setStage("submitting");

    try {
      const res = await fetch("/api/preorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });

      if (!res.ok) throw new Error("Failed to save");
      setStage("success");
    } catch {
      setStage("form");
      setError("Something went wrong. Please try again.");
    }
  };

  if (!isModalOpen) return null;

  return (
    <>
      {/* Scrim */}
      <div
        className="preorder-scrim"
        onClick={closeModal}
        aria-hidden
      />

      {/* Modal */}
      <div className="preorder-modal" role="dialog" aria-modal="true">
        <button
          onClick={closeModal}
          className="preorder-close text-[12px] tracking-[.24em] qlink"
          aria-label="Close"
        >
          CLOSE
        </button>

        {stage === "success" ? (
          <div className="preorder-success">
            <div className="preorder-check-ring">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--kathakali)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>

            <h3 className="mt-8 font-display font-black text-[28px] md:text-[34px] display-tight" style={{ color: "var(--night)" }}>
              We've saved a<br />copy for you.
            </h3>

            <p className="mt-5 font-body font-light text-[15px] leading-relaxed max-w-[34ch] mx-auto" style={{ color: "#2a3855" }}>
              Thank you for your interest in <em className="font-display italic">Nandu in Muziris</em>.
              We'll let you know the moment it's ready to ship.
            </p>

            <div className="mt-6 text-[10.5px] tracking-[.3em] font-body font-light opacity-50">
              FIRST EDITION · LIMITED RUN
            </div>

            <button
              onClick={closeModal}
              className="mt-10 btn-night px-10 py-4 text-[12px] tracking-[.26em] font-body font-normal"
            >
              Continue exploring
            </button>
          </div>
        ) : (
          <div className="preorder-form-content">
            <div className="text-[10.5px] tracking-[.34em] font-body font-light opacity-60">
              BOOK NOW
            </div>

            <h3 className="mt-5 font-display font-black text-[28px] md:text-[34px] display-tight" style={{ color: "var(--night)" }}>
              Book your<br />
              <span className="font-display italic font-medium" style={{ color: "var(--kathakali)" }}>copy</span>.
            </h3>

            <p className="mt-5 font-body font-light text-[15px] leading-relaxed max-w-[36ch] mx-auto" style={{ color: "#2a3855" }}>
              Enter your details below and we'll save a first-edition copy of <em className="font-display italic">Nandu in Muziris</em> for you.
            </p>

            <form onSubmit={handleSubmit} className="mt-9 space-y-4 w-full max-w-[340px] mx-auto">
              <div className="preorder-field">
                <label htmlFor="preorder-name" className="text-[10px] tracking-[.28em] font-body font-light opacity-70">
                  YOUR NAME
                </label>
                <input
                  ref={nameRef}
                  id="preorder-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                  className="preorder-input font-body text-[15px]"
                  disabled={stage === "submitting"}
                />
              </div>

              <div className="preorder-field">
                <label htmlFor="preorder-email" className="text-[10px] tracking-[.28em] font-body font-light opacity-70">
                  EMAIL ADDRESS
                </label>
                <input
                  id="preorder-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="preorder-input font-body text-[15px]"
                  disabled={stage === "submitting"}
                />
              </div>

              {error && (
                <p className="text-[12px] font-body" style={{ color: "var(--spice)" }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={stage === "submitting"}
                className="btn-night w-full py-4 text-[12px] tracking-[.28em] font-body font-normal mt-6"
              >
                {stage === "submitting" ? "Saving your copy…" : "Book now"}
              </button>
            </form>

            <div className="mt-6 text-[10.5px] tracking-[.22em] font-body font-light opacity-40">
              No payment required · We'll contact you when it's ready
            </div>
          </div>
        )}
      </div>
    </>
  );
}
