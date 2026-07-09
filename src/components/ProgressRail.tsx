"use client";

import { useEffect, useState } from "react";

const sections = [
  { id: "hero", href: "#hero" },
  { id: "products", href: "#products" },
  { id: "about", href: "#about" },
  { id: "news", href: "#news" },
  { id: "collaborate", href: "#collaborate" },
];

export default function ProgressRail() {
  const [active, setActive] = useState("hero");

  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    sections.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (!el) return;

      const obs = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) setActive(id);
          });
        },
        { rootMargin: "-40% 0px -55% 0px", threshold: 0 }
      );
      obs.observe(el);
      observers.push(obs);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, []);

  return (
    <nav className="rail" aria-hidden="true">
      {sections.map(({ id, href }) => (
        <a key={id} href={href} className={active === id ? "active" : ""} />
      ))}
    </nav>
  );
}
