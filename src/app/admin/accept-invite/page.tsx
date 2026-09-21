import Link from "next/link";
import AuthShell from "../AuthShell";
import AcceptInviteForm from "./AcceptInviteForm";

export const metadata = { title: "Admin - Aalmaram" };
export const dynamic = "force-dynamic";

/**
 * Where an invite or password link lands. Only renders the form: the token is
 * verified when the form is submitted, not on this GET, so a mail scanner that
 * follows the link can't spend it.
 */
export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const { token_hash: tokenHash, type } = await searchParams;

  if (!tokenHash || (type !== "invite" && type !== "recovery")) {
    return (
      <AuthShell>
        <h1 className="text-[22px] font-semibold tracking-tight">That link isn&apos;t complete</h1>
        <p className="mt-2 text-[14px]" style={{ color: "var(--a-muted)" }}>
          Ask the store owner for a new one, or{" "}
          <Link href="/admin/login" className="qlink font-medium" style={{ color: "var(--a-ink)" }}>
            sign in
          </Link>{" "}
          if you already have a password.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AcceptInviteForm tokenHash={tokenHash} type={type} />
    </AuthShell>
  );
}
