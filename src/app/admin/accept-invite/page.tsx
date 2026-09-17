import Link from "next/link";
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
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="w-full max-w-[360px]">
          <div className="text-[10.5px] tracking-[.34em] font-body font-light opacity-60">AALMARAM</div>
          <h1 className="mt-4 font-display font-black text-[30px] display-tight" style={{ color: "var(--night)" }}>
            That link isn&apos;t complete
          </h1>
          <p className="mt-3 font-body font-light text-[14px]" style={{ color: "#2a3855" }}>
            Ask the store owner for a new one, or{" "}
            <Link href="/admin/login" className="qlink">
              sign in
            </Link>{" "}
            if you already have a password.
          </p>
        </div>
      </main>
    );
  }

  return <AcceptInviteForm tokenHash={tokenHash} type={type} />;
}
