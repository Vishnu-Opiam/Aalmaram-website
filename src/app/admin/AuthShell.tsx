import { adminFont } from "./font";
import "./admin.css";

function Mark({ inverted = false }: { inverted?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="grid place-items-center w-9 h-9 rounded-lg text-[15px] font-semibold"
        style={inverted ? { background: "#eee0bf", color: "var(--a-accent)" } : { background: "var(--a-accent)", color: "#eee0bf" }}
        aria-hidden
      >
        A
      </span>
      <span className="text-[15px] font-semibold tracking-tight">Aalmaram</span>
    </div>
  );
}

/**
 * The frame around the signed-out admin screens (sign in, accept invite): the
 * brand on one side, a card holding the form on the other.
 */
export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={`admin-shell ${adminFont.variable} grid lg:grid-cols-2`}>
      <aside
        className="hidden lg:flex flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: "var(--a-accent)", color: "#eee0bf" }}
      >
        {/* Soft glow so the panel isn't a flat block. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 -top-40 w-[520px] h-[520px] rounded-full"
          style={{ background: "radial-gradient(closest-side, rgba(224,112,48,.28), transparent)" }}
        />
        <Mark inverted />
        <div className="relative max-w-[440px]">
          <p className="text-[30px] font-semibold tracking-tight leading-tight">
            Orders, parcels and stock for the Aalmaram store, in one place.
          </p>
          <p className="mt-4 text-[14px]" style={{ color: "rgba(238,224,191,.7)" }}>
            Staff only. Every change made here is logged against your email.
          </p>
        </div>
        <div className="kasavu-band h-px w-full" aria-hidden />
      </aside>

      <main className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[400px]">
          <div className="lg:hidden mb-8">
            <Mark />
          </div>
          <div className="admin-card p-6 sm:p-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
