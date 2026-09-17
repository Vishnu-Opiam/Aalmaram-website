import { requireOwner } from "@/lib/admin-auth";
import { adminAllowlist } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { Pill, SectionTitle } from "../../ui";
import { InviteForm, TeamMemberActions } from "../SettingsForms";

export const metadata = { title: "Team - Aalmaram admin" };

export default async function TeamPage() {
  const session = await requireOwner();

  const { data: team } = await createAdminClient()
    .from("admin_users")
    .select("id, email, name, role, last_login_at, invited_at, invited_by, created_at")
    .order("created_at", { ascending: true });

  const allowlist = adminAllowlist();

  return (
    <div className="space-y-16">
      <section>
        <SectionTitle hint="Owners can change settings and the team. Staff can do everything else.">Who has access</SectionTitle>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left font-body text-[13.5px]">
            <thead>
              <tr className="text-[10px] tracking-[.22em] opacity-60">
                <th className="py-3 pr-4 font-normal">PERSON</th>
                <th className="py-3 pr-4 font-normal">ROLE</th>
                <th className="py-3 pr-4 font-normal">LAST SIGNED IN</th>
                <th className="py-3 font-normal" />
              </tr>
            </thead>
            <tbody>
              {(team ?? []).map((member) => (
                <tr key={member.id} className="border-t border-black/10 align-top">
                  <td className="py-3 pr-4">
                    {member.name || member.email}
                    {member.name && <div className="text-[12px] font-light opacity-60">{member.email}</div>}
                    {member.email === session.email && <div className="text-[11px] font-light opacity-50">you</div>}
                  </td>
                  <td className="py-3 pr-4">
                    <Pill tone={member.role === "owner" ? "good" : "quiet"}>{member.role.toUpperCase()}</Pill>
                  </td>
                  <td className="py-3 pr-4 font-light opacity-75 whitespace-nowrap">
                    {member.last_login_at
                      ? formatDateTime(member.last_login_at)
                      : member.invited_at
                        ? `Invited ${formatDateTime(member.invited_at)}`
                        : "Never"}
                  </td>
                  <td className="py-3 text-right">
                    <TeamMemberActions
                      id={member.id}
                      email={member.email}
                      role={member.role}
                      isSelf={member.email === session.email}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {allowlist.length > 0 && (
          <p className="mt-5 text-[12px] font-body font-light opacity-60 max-w-[70ch]">
            <code>ADMIN_ALLOWLIST</code> on the server still admits {allowlist.join(", ")} as an owner on first sign-in,
            even if removed here. Once everyone is on this list, clear that variable.
          </p>
        )}
      </section>

      <section className="max-w-[860px]">
        <SectionTitle hint="They get a one-time link to choose a password. If email isn't set up yet, you'll get the link to send yourself.">
          Invite someone
        </SectionTitle>
        <InviteForm />
      </section>
    </div>
  );
}
