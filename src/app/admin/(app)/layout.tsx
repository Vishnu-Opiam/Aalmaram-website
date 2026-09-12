import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { signOut } from "../actions";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: "Today" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/shipments", label: "Shipments" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/discounts", label: "Discounts" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/events", label: "Events" },
];

/**
 * Everything in this route group is admin-only. The proxy does an optimistic
 * cookie check; this is the one that actually decides, by looking the signed-in
 * email up in `admin_users`.
 */
export default async function AdminAppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();

  return (
    <div className="min-h-screen">
      <header
        className="sticky top-0 z-30 paper"
        style={{ borderBottom: "1px solid rgba(35,47,72,.12)" }}
      >
        <div className="max-w-[1180px] mx-auto px-6 md:px-10 py-4 flex items-center gap-8">
          <Link href="/admin" className="shrink-0">
            <div className="text-[10.5px] tracking-[.34em] font-body font-light opacity-60">
              AALMARAM
            </div>
            <div className="font-display italic text-[17px] leading-tight">Admin</div>
          </Link>

          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="qlink text-[12px] tracking-[.22em] font-body font-light"
              >
                {item.label.toUpperCase()}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-5">
            <span className="hidden md:inline text-[11.5px] font-body font-light opacity-60">
              {session.email}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="qlink text-[12px] tracking-[.22em] font-body font-light"
              >
                SIGN OUT
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="max-w-[1180px] mx-auto px-6 md:px-10 py-12">{children}</div>
    </div>
  );
}
