import { ROLE_LABELS, requireOwner } from "@/lib/admin-auth";
import { adminAllowlist } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageTitle, Pill, SectionTitle } from "../ui";
import { AddEmployeeForm, EmployeeActions } from "./EmployeeForms";

export const metadata = { title: "Employees - Aalmaram admin" };

/** Admins only: who can get into the store admin, and on what terms. */
export default async function EmployeesPage() {
  const session = await requireOwner();

  const { data: team } = await createAdminClient()
    .from("admin_users")
    .select("id, email, name, role, last_login_at, invited_at, invited_by, revoked_at, revoked_by, created_at")
    .order("created_at", { ascending: true });

  const allowlist = adminAllowlist();

  return (
    <div className="space-y-4">
      <PageTitle>Employees</PageTitle>

      <section className="admin-card p-5 sm:p-6">
        <SectionTitle hint="Store managers can do everything in the store, settings included. Only admins can see this page and decide who gets in.">
          Who has access
        </SectionTitle>
        <div className="mt-5 admin-card overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr>
                <th className="py-3 pr-4 font-normal">Person</th>
                <th className="py-3 pr-4 font-normal">Role</th>
                <th className="py-3 pr-4 font-normal">Last signed in</th>
                <th className="py-3 font-normal" />
              </tr>
            </thead>
            <tbody>
              {(team ?? []).map((member) => (
                <tr
                  key={member.id}
                  className="border-t border-black/10 align-top"
                  style={member.revoked_at ? { opacity: 0.7 } : undefined}
                >
                  <td className="py-3 pr-4">
                    {member.name || member.email}
                    {member.name && <div className="text-[12px] opacity-60">{member.email}</div>}
                    {member.email === session.email && <div className="text-[12px] opacity-50">you</div>}
                  </td>
                  <td className="py-3 pr-4 space-x-1.5 whitespace-nowrap">
                    <Pill tone={member.role === "owner" ? "good" : "quiet"}>{ROLE_LABELS[member.role] ?? member.role}</Pill>
                    {member.revoked_at && <Pill tone="bad">Access revoked</Pill>}
                  </td>
                  <td className="py-3 pr-4 opacity-75 whitespace-nowrap">
                    {member.revoked_at
                      ? `Revoked ${formatDateTime(member.revoked_at)}`
                      : member.last_login_at
                        ? formatDateTime(member.last_login_at)
                        : member.invited_at
                          ? `Added ${formatDateTime(member.invited_at)}`
                          : "Never"}
                  </td>
                  <td className="py-3 text-right">
                    <EmployeeActions
                      id={member.id}
                      email={member.email}
                      role={member.role}
                      revoked={Boolean(member.revoked_at)}
                      isSelf={member.email === session.email}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {allowlist.length > 0 && (
          <p className="mt-5 text-[12px] opacity-60 max-w-[70ch]">
            <code>ADMIN_ALLOWLIST</code> on the server still admits {allowlist.join(", ")} as an admin on first sign-in
            if they are not on this list. Revoking someone here keeps them out regardless. Once everyone is set up, clear
            that variable.
          </p>
        )}
      </section>

      <section className="admin-card p-5 sm:p-6 max-w-[860px]">
        <SectionTitle hint="Set their password yourself, or send a one-time link so they choose their own.">
          Add an employee
        </SectionTitle>
        <AddEmployeeForm />
      </section>
    </div>
  );
}
