"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/settings", label: "Store" },
  { href: "/admin/settings/integrations", label: "Integrations" },
];

export default function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="mt-6 flex flex-wrap gap-7 border-b border-[var(--a-border)]">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className="pb-3 -mb-px text-[14px] font-medium"
            style={{
              borderBottom: active ? "2px solid var(--night)" : "2px solid transparent",
              opacity: active ? 1 : 0.6,
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
