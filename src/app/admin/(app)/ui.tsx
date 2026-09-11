import Link from "next/link";

/**
 * Small presentational pieces shared by the admin screens. No hooks and no
 * server-only imports, so both server and client components can use them.
 */

export const inputClass = "preorder-input font-body text-[15px] w-full";
export const labelClass = "text-[10px] tracking-[.24em] font-body opacity-70";

export function PageTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <h1 className="font-display font-black text-[34px] display-tight" style={{ color: "var(--night)" }}>
        {children}
      </h1>
      {aside && <div className="flex flex-wrap items-center gap-5">{aside}</div>}
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="qlink text-[11px] tracking-[.26em] font-body font-light">
      ← {children}
    </Link>
  );
}

export function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-display italic text-[20px]" style={{ color: "var(--night)" }}>
        {children}
      </h2>
      {hint && <p className="mt-1 text-[12px] font-body font-light opacity-60">{hint}</p>}
    </div>
  );
}

export function Notice({ error, ok }: { error?: string; ok?: string }) {
  if (error) {
    return (
      <p
        role="alert"
        className="text-[13px] font-body p-3 rounded"
        style={{ color: "var(--spice)", background: "rgba(164,66,44,.08)" }}
      >
        {error}
      </p>
    );
  }
  if (ok) {
    return (
      <p
        role="status"
        className="text-[13px] font-body p-3 rounded"
        style={{ color: "var(--deep, #0c664b)", background: "rgba(12,102,75,.07)" }}
      >
        {ok}
      </p>
    );
  }
  return null;
}

const TONES = {
  good: { color: "#0c664b", background: "rgba(12,102,75,.09)" },
  warn: { color: "#8a5a12", background: "rgba(198,161,91,.2)" },
  bad: { color: "var(--spice)", background: "rgba(164,66,44,.09)" },
  quiet: { color: "rgba(35,47,72,.7)", background: "rgba(35,47,72,.07)" },
} as const;

export type Tone = keyof typeof TONES;

/** A status word with its colour. The word always carries the meaning; the colour only reinforces it. */
export function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className="inline-block px-2 py-[3px] rounded text-[10px] tracking-[.16em] font-body whitespace-nowrap"
      style={TONES[tone]}
    >
      {children}
    </span>
  );
}

const PAYMENT_TONE: Record<string, Tone> = {
  paid: "good",
  partially_refunded: "warn",
  refunded: "quiet",
  pending: "warn",
  failed: "bad",
};

const FULFILMENT_TONE: Record<string, Tone> = {
  unfulfilled: "warn",
  fulfilled: "good",
  cancelled: "quiet",
  returned: "quiet",
};

export function PaymentPill({ status }: { status: string }) {
  return <Pill tone={PAYMENT_TONE[status] ?? "quiet"}>{status.replace("_", " ").toUpperCase()}</Pill>;
}

export function FulfilmentPill({ status }: { status: string }) {
  return <Pill tone={FULFILMENT_TONE[status] ?? "quiet"}>{status.toUpperCase()}</Pill>;
}

/** Page-number links that keep the rest of the query string. */
export function Pagination({
  basePath,
  params,
  page,
  pageCount,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;
  const href = (p: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
    if (p > 1) query.set("page", String(p));
    const qs = query.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  return (
    <nav className="mt-8 flex items-center gap-6 text-[12px] tracking-[.2em] font-body font-light">
      {page > 1 ? (
        <Link href={href(page - 1)} className="qlink">
          ← NEWER
        </Link>
      ) : (
        <span className="opacity-30">← NEWER</span>
      )}
      <span className="opacity-60">
        PAGE {page} OF {pageCount}
      </span>
      {page < pageCount ? (
        <Link href={href(page + 1)} className="qlink">
          OLDER →
        </Link>
      ) : (
        <span className="opacity-30">OLDER →</span>
      )}
    </nav>
  );
}
