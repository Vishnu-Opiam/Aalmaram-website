import Link from "next/link";

/**
 * Small presentational pieces shared by the admin screens. No hooks and no
 * server-only imports, so both server and client components can use them.
 */

export const inputClass = "preorder-input font-body text-[15px] w-full";
export const labelClass = "text-[13px] font-medium";

export function PageTitle({
  children,
  aside,
  subtitle,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
  subtitle?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight leading-tight" style={{ color: "var(--a-ink)" }}>
          {children}
        </h1>
        {subtitle && (
          <p className="mt-1 text-[14px]" style={{ color: "var(--a-muted)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {aside && <div className="flex flex-wrap items-center gap-3">{aside}</div>}
    </div>
  );
}

/** A white panel. Most admin sections sit in one. */
export function Card({
  children,
  className = "",
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return <div className={`admin-card ${padded ? "p-5 sm:p-6" : ""} ${className}`}>{children}</div>;
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-[13px] font-medium hover:opacity-100 opacity-70">
      ← {children}
    </Link>
  );
}

export function SectionTitle({
  children,
  hint,
  aside,
}: {
  children: React.ReactNode;
  hint?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-[16px] font-semibold tracking-tight" style={{ color: "var(--a-ink)" }}>
          {children}
        </h2>
        {hint && (
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--a-muted)" }}>
            {hint}
          </p>
        )}
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </div>
  );
}

export function Notice({ error, ok }: { error?: string; ok?: string }) {
  if (error) {
    return (
      <p
        role="alert"
        className="text-[13px] font-body px-4 py-3 rounded-lg"
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
        className="text-[13px] font-body px-4 py-3 rounded-lg"
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
      className="inline-flex items-center px-2.5 py-[3px] rounded-full text-[11px] font-medium whitespace-nowrap"
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

/** "partially_refunded" → "Partially refunded". */
export const sentence = (s: string) => {
  const words = s.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

export function PaymentPill({ status }: { status: string }) {
  return <Pill tone={PAYMENT_TONE[status] ?? "quiet"}>{sentence(status)}</Pill>;
}

export function FulfilmentPill({ status }: { status: string }) {
  return <Pill tone={FULFILMENT_TONE[status] ?? "quiet"}>{sentence(status)}</Pill>;
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
    <nav className="mt-6 flex items-center gap-6 text-[13px]">
      {page > 1 ? (
        <Link href={href(page - 1)} className="qlink">
          ← Newer
        </Link>
      ) : (
        <span className="opacity-30">← Newer</span>
      )}
      <span className="opacity-60">
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <Link href={href(page + 1)} className="qlink">
          Older →
        </Link>
      ) : (
        <span className="opacity-30">Older →</span>
      )}
    </nav>
  );
}
