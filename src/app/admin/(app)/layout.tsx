import Link from "next/link";
import { ROLE_LABELS, requireAdmin } from "@/lib/admin-auth";
import { signOut } from "../actions";
import AdminNav, { type NavItem } from "./AdminNav";
import { adminFont } from "../font";
import "../admin.css";

export const dynamic = "force-dynamic";


const NAV: NavItem[] = [
  { href: "/admin", label: "Today", icon: "home" },
  { href: "/admin/orders", label: "Orders", icon: "orders" },
  { href: "/admin/shipments", label: "Shipments", icon: "truck" },
  { href: "/admin/customers", label: "Customers", icon: "users" },
  { href: "/admin/products", label: "Products", icon: "book" },
  { href: "/admin/discounts", label: "Discounts", icon: "tag" },
  { href: "/admin/events", label: "Events", icon: "calendar" },
  { href: "/admin/analytics", label: "Analytics", icon: "chart" },
  { href: "/admin/settings", label: "Settings", icon: "settings" },
];

/** Only admins (owners) can open these, so only they see the link. */
const OWNER_NAV: NavItem[] = [{ href: "/admin/employees", label: "Employees", icon: "badge" }];

function Brand() {
  return (
    <Link href="/admin" className="flex items-center gap-3">
      <span
        className="grid place-items-center w-9 h-9 rounded-lg text-[15px] font-semibold"
        style={{ background: "var(--a-accent)", color: "#eee0bf" }}
        aria-hidden
      >
        A
      </span>
      <span className="leading-tight">
        <span className="block text-[15px] font-semibold tracking-tight">Aalmaram</span>
        <span className="block text-[12px]" style={{ color: "var(--a-muted)" }}>
          Store admin
        </span>
      </span>
    </Link>
  );
}

/**
 * Everything in this route group is admin-only. The proxy does an optimistic
 * cookie check; this is the one that actually decides, by looking the signed-in
 * email up in `admin_users`.
 */
export default async function AdminAppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  const items = [...NAV, ...(session.role === "owner" ? OWNER_NAV : [])];
  const initial = session.email.charAt(0).toUpperCase();

  return (
    <div className={`admin-shell ${adminFont.variable}`}>
      {/* ── Sidebar (desktop) ─────────────────────────────── */}
      <aside
        className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-[248px] flex-col px-4 py-6"
        style={{ background: "var(--a-surface)", borderRight: "1px solid var(--a-border)" }}
      >
        <div className="px-2">
          <Brand />
        </div>
        <div className="mt-8 px-3 text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--a-muted)" }}>
          Menu
        </div>
        <div className="mt-2">
          <AdminNav items={items} variant="sidebar" />
        </div>

        <div className="mt-auto admin-card !shadow-none p-3 flex items-center gap-3" style={{ background: "var(--a-bg)" }}>
          <span
            className="grid place-items-center w-9 h-9 shrink-0 rounded-full text-[14px] font-semibold"
            style={{ background: "#e07030", color: "#fff" }}
            aria-hidden
          >
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium" title={session.email}>
              {session.email}
            </div>
            <div className="text-[12px] capitalize" style={{ color: "var(--a-muted)" }}>
              {ROLE_LABELS[session.role] ?? session.role}
            </div>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              title="Sign out"
              aria-label="Sign out"
              className="grid place-items-center w-8 h-8 rounded-md hover:bg-black/5"
              style={{ color: "var(--a-muted)" }}
            >
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          </form>
        </div>
      </aside>

      {/* ── Top bar (mobile / tablet) ─────────────────────── */}
      <header
        className="lg:hidden sticky top-0 z-30"
        style={{ background: "var(--a-surface)", borderBottom: "1px solid var(--a-border)" }}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <Brand />
          <form action={signOut}>
            <button type="submit" className="text-[13px] font-medium px-3 py-1.5 rounded-md hover:bg-black/5">
              Sign out
            </button>
          </form>
        </div>
        <AdminNav items={items} variant="bar" />
      </header>

      <main className="lg:pl-[248px]">
        <div className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-10 py-8 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
