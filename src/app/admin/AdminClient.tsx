"use client";

import { useCallback, useEffect, useState } from "react";

interface EventRecord {
  id: string;
  title: string;
  date: string;
  location: string;
  description: string;
  link: string;
}

const EMPTY: Omit<EventRecord, "id"> = {
  title: "",
  date: "",
  location: "",
  description: "",
  link: "",
};

export default function AdminClient({ initialAuthed }: { initialAuthed: boolean }) {
  const [authed, setAuthed] = useState(initialAuthed);

  if (!authed) return <Login onSuccess={() => setAuthed(true)} />;
  return <Panel onLogout={() => setAuthed(false)} />;
}

/* ───────────────────────── Login ───────────────────────── */

function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-[360px]">
        <div className="text-[10.5px] tracking-[.34em] font-body font-light opacity-60">AALMARAM</div>
        <h1 className="mt-4 font-display font-black text-[30px] display-tight" style={{ color: "var(--night)" }}>
          Admin
        </h1>
        <p className="mt-3 font-body font-light text-[14px]" style={{ color: "#2a3855" }}>
          Enter the admin password to manage events.
        </p>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          className="preorder-input font-body text-[15px] mt-8 w-full"
        />

        {error && (
          <p className="mt-3 text-[12.5px] font-body" style={{ color: "var(--spice)" }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="btn-night w-full py-4 text-[12px] tracking-[.28em] font-body font-normal mt-6"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

/* ───────────────────────── Panel ───────────────────────── */

function Panel({ onLogout }: { onLogout: () => void }) {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<EventRecord | null>(null);
  const [form, setForm] = useState<Omit<EventRecord, "id">>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/events");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load events");
      setEvents(data.events);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load events");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Intentional one-time data fetch on mount; loading state is handled inside load().
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const resetForm = () => {
    setEditing(null);
    setForm(EMPTY);
  };

  const startEdit = (ev: EventRecord) => {
    setEditing(ev);
    setForm({ title: ev.title, date: ev.date, location: ev.location, description: ev.description, link: ev.link });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.title.trim() || !form.date.trim()) {
      setError("Title and date are required.");
      return;
    }
    setSaving(true);
    try {
      const url = editing ? `/api/admin/events/${encodeURIComponent(editing.id)}` : "/api/admin/events";
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (ev: EventRecord) => {
    if (!confirm(`Delete "${ev.title}"? This cannot be undone.`)) return;
    setError("");
    try {
      const res = await fetch(`/api/admin/events/${encodeURIComponent(ev.id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete");
      if (editing?.id === ev.id) resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const logout = async () => {
    await fetch("/api/admin/login", { method: "DELETE" });
    onLogout();
  };

  const field = (k: keyof typeof form) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value })),
  });

  return (
    <main className="max-w-[920px] mx-auto px-6 md:px-10 py-16">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-[10.5px] tracking-[.34em] font-body font-light opacity-60">AALMARAM</div>
          <h1 className="mt-3 font-display font-black text-[34px] display-tight" style={{ color: "var(--night)" }}>
            Events
          </h1>
        </div>
        <button onClick={logout} className="qlink text-[12px] tracking-[.24em] font-body font-light">
          Sign out
        </button>
      </div>

      {error && (
        <p className="mt-6 text-[13px] font-body p-3 rounded" style={{ color: "var(--spice)", background: "rgba(164,66,44,.08)" }}>
          {error}
        </p>
      )}

      {/* Form */}
      <form onSubmit={save} className="mt-10 grid gap-4 p-6 rounded-lg" style={{ background: "rgba(35,47,72,.04)" }}>
        <div className="font-display italic text-[20px]" style={{ color: "var(--night)" }}>
          {editing ? "Edit event" : "New event"}
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-[10px] tracking-[.24em] font-body opacity-70">TITLE *</span>
            <input {...field("title")} className="preorder-input font-body text-[15px] w-full" placeholder="Book launch at Blossom" />
          </label>
          <label className="block">
            <span className="text-[10px] tracking-[.24em] font-body opacity-70">DATE *</span>
            <input {...field("date")} type="date" className="preorder-input font-body text-[15px] w-full" />
          </label>
          <label className="block">
            <span className="text-[10px] tracking-[.24em] font-body opacity-70">LOCATION</span>
            <input {...field("location")} className="preorder-input font-body text-[15px] w-full" placeholder="Bengaluru" />
          </label>
          <label className="block">
            <span className="text-[10px] tracking-[.24em] font-body opacity-70">LINK (RSVP / tickets)</span>
            <input {...field("link")} type="url" className="preorder-input font-body text-[15px] w-full" placeholder="https://" />
          </label>
        </div>
        <label className="block">
          <span className="text-[10px] tracking-[.24em] font-body opacity-70">DESCRIPTION</span>
          <textarea
            {...field("description")}
            rows={3}
            className="preorder-input font-body text-[15px] w-full"
            placeholder="A short note about this event…"
          />
        </label>
        <div className="flex gap-4 items-center">
          <button type="submit" disabled={saving} className="btn-night px-8 py-3 text-[12px] tracking-[.26em] font-body">
            {saving ? "Saving…" : editing ? "Update event" : "Add event"}
          </button>
          {editing && (
            <button type="button" onClick={resetForm} className="qlink text-[12px] tracking-[.24em] font-body font-light">
              Cancel
            </button>
          )}
        </div>
      </form>

      {/* List */}
      <div className="mt-12">
        {loading ? (
          <p className="font-body font-light text-[14px] opacity-60">Loading…</p>
        ) : events.length === 0 ? (
          <p className="font-body font-light text-[14px] opacity-60">No events yet. Add your first one above.</p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "rgba(35,47,72,.12)" }}>
            {events.map((ev) => (
              <li key={ev.id} className="py-5 flex items-start justify-between gap-6">
                <div>
                  <div className="font-display italic text-[18px]" style={{ color: "var(--night)" }}>
                    {ev.title}
                  </div>
                  <div className="mt-1 text-[12.5px] font-body font-light opacity-70">
                    {ev.date}
                    {ev.location ? ` · ${ev.location}` : ""}
                  </div>
                  {ev.description && (
                    <p className="mt-2 text-[13px] font-body font-light max-w-[60ch]" style={{ color: "#2a3855" }}>
                      {ev.description}
                    </p>
                  )}
                </div>
                <div className="flex gap-4 shrink-0">
                  <button onClick={() => startEdit(ev)} className="qlink text-[12px] tracking-[.2em] font-body font-light">
                    Edit
                  </button>
                  <button
                    onClick={() => remove(ev)}
                    className="text-[12px] tracking-[.2em] font-body font-light"
                    style={{ color: "var(--spice)" }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
