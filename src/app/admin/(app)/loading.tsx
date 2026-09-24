/**
 * Shown the moment any admin link is clicked, while the server fetches the next
 * page. Next prefetches this fallback with the shared layout, so navigation
 * swaps to it immediately instead of waiting on the database.
 */
export default function AdminLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="space-y-2">
        <Bar w="220px" h="28px" />
        <Bar w="320px" h="14px" />
      </div>

      <div className="admin-card p-4 flex flex-wrap items-end gap-4">
        <Bar w="100%" h="38px" className="flex-1 min-w-[220px]" />
        <Bar w="140px" h="38px" />
        <Bar w="90px" h="38px" />
      </div>

      <div className="admin-card overflow-hidden">
        <div className="px-5 py-3" style={{ background: "var(--a-bg)" }}>
          <Bar w="40%" h="12px" />
        </div>
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="px-5 py-4 flex items-center gap-6"
            style={{ borderTop: "1px solid var(--a-border)" }}
          >
            <Bar w="90px" h="14px" />
            <Bar w="120px" h="14px" />
            <Bar w="30%" h="14px" className="flex-1" />
            <Bar w="70px" h="14px" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Bar({ w, h, className = "" }: { w: string; h: string; className?: string }) {
  return <span className={`admin-skel ${className}`} style={{ width: w, height: h }} />;
}
