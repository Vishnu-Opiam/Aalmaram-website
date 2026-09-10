import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * Everything in this route group is admin-only. The proxy does an optimistic
 * cookie check; this is the one that actually decides, by looking the signed-in
 * email up in `admin_users`.
 */
export default async function AdminAppLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
