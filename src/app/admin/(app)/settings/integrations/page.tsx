import { requireAdmin } from "@/lib/admin-auth";
import { isEmailConfigured } from "@/lib/email";
import { formatDateTime } from "@/lib/format";
import { OUTBOX_TOPICS, resolveWebhookUrls, topicEnvName } from "@/lib/outbox";
import { isShiprocketConfigured } from "@/lib/shiprocket";
import { createAdminClient } from "@/lib/supabase/admin";
import { Pill, SectionTitle, type Tone, sentence } from "../../ui";
import { TestWebhookButton, WebhooksForm } from "../SettingsForms";
import { retryOutboxRow } from "../actions";

export const metadata = { title: "Integrations - Aalmaram admin" };

const CONSUMERS: Record<string, string> = {
  "order.paid": "n8n: Zoho invoice, NocoDB contact + interaction, newsletter opt-in.",
  "order.shipped": "No n8n flow yet — the store emails tracking itself.",
  "order.delivered": "n8n: post-purchase check-in and review emails.",
  "order.refunded": "No n8n flow yet.",
  "order.cancelled": "No n8n flow yet.",
  "inventory.low": "n8n: low-stock email.",
};

const STATUS_TONE: Record<string, Tone> = { sent: "good", pending: "warn", failed: "bad" };

function KeyRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <tr className="border-t border-black/10 align-top">
      <td className="py-3 pr-4 whitespace-nowrap">{label}</td>
      <td className="py-3 pr-4">
        <Pill tone={ok ? "good" : "warn"}>{ok ? "Set" : "Missing"}</Pill>
      </td>
      <td className="py-3 opacity-75">{detail}</td>
    </tr>
  );
}

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();
  const { status: statusFilter } = await searchParams;

  const db = createAdminClient();
  const urls = await resolveWebhookUrls();
  const { data: integrations } = await db.from("settings").select("value").eq("key", "integrations").maybeSingle();
  const saved = ((integrations?.value as { webhooks?: Record<string, string> } | null)?.webhooks ?? {}) as Record<string, string>;

  const [{ data: waitingRows }, rowsQuery] = await Promise.all([
    db.from("webhook_outbox").select("topic").eq("status", "pending"),
    (() => {
      let q = db
        .from("webhook_outbox")
        .select("id, topic, status, attempts, last_error, last_response_status, created_at, sent_at, next_attempt_at, payload")
        .order("created_at", { ascending: false })
        .limit(50);
      if (statusFilter === "pending" || statusFilter === "failed" || statusFilter === "sent") q = q.eq("status", statusFilter);
      return q;
    })(),
  ]);
  const waiting = (topic: string) => (waitingRows ?? []).filter((r) => r.topic === topic).length;
  const rows = rowsQuery.data ?? [];

  const keyId = process.env.RAZORPAY_KEY_ID ?? "";
  const razorpayMode = keyId.startsWith("rzp_live_") ? "LIVE keys" : keyId.startsWith("rzp_test_") ? "test keys" : "unrecognised key";

  return (
    <div className="space-y-4">
      <section className="admin-card p-5 sm:p-6 max-w-[860px]">
        <SectionTitle hint="Where store events go. See docs/custom-commerce/EVENTS.md for the payloads and the n8n setup.">
          n8n webhooks
        </SectionTitle>
        <WebhooksForm
          rows={OUTBOX_TOPICS.map((topic) => ({
            topic,
            saved: saved[topic] ?? "",
            envName: topicEnvName(topic) ?? "",
            envSet: Boolean(process.env[topicEnvName(topic) ?? ""]),
            consumer: CONSUMERS[topic],
            waiting: waiting(topic),
          }))}
        />

        <div className="mt-10">
          <span className="text-[13px] font-medium">Send a test</span>
          <p className="mt-1 text-[12.5px] opacity-55">
            A sample marked <code>event.test: true</code>, order TEST0000, straight to the URL in use.
          </p>
          <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {OUTBOX_TOPICS.map((topic) => (
              <div key={topic} className="p-4 rounded" style={{ background: "rgba(35,47,72,.04)" }}>
                <div className="text-[12px] mb-2">
                  {topic}{" "}
                  <span className="opacity-50">
                    {urls[topic].source === "settings" ? "· saved URL" : urls[topic].source === "env" ? "· env URL" : "· no URL"}
                  </span>
                </div>
                <TestWebhookButton topic={topic} disabled={!urls[topic].url} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="admin-card p-5 sm:p-6">
        <SectionTitle hint="The last 50 events. Delivered within seconds normally; retried with backoff when n8n is down.">
          Event queue
        </SectionTitle>
        <div className="mt-4 flex gap-6 text-[12px]">
          {["all", "pending", "failed", "sent"].map((s) => (
            <a
              key={s}
              href={s === "all" ? "/admin/settings/integrations" : `/admin/settings/integrations?status=${s}`}
              className="qlink"
              style={{ opacity: (statusFilter ?? "all") === s ? 1 : 0.55 }}
            >
              {sentence(s)}
            </a>
          ))}
        </div>
        {rows.length === 0 ? (
          <p className="mt-6 text-[13.5px] opacity-60">Nothing here.</p>
        ) : (
          <div className="mt-5 admin-card overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr>
                  <th className="py-3 pr-4 font-normal">When</th>
                  <th className="py-3 pr-4 font-normal">Event</th>
                  <th className="py-3 pr-4 font-normal">About</th>
                  <th className="py-3 pr-4 font-normal">Status</th>
                  <th className="py-3 pr-4 font-normal">Detail</th>
                  <th className="py-3 font-normal" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const p = (row.payload ?? {}) as Record<string, unknown>;
                  const about = String(p.order_number ?? p.product_title ?? "");
                  const configured = Boolean(urls[row.topic as keyof typeof urls]?.url);
                  return (
                    <tr key={row.id} className="border-t border-black/10 align-top">
                      <td className="py-3 pr-4 whitespace-nowrap">{formatDateTime(row.created_at)}</td>
                      <td className="py-3 pr-4">{row.topic}</td>
                      <td className="py-3 pr-4">
                        {p.order_id ? (
                          <a href={`/admin/orders/${String(p.order_id)}`} className="qlink">
                            {about || "order"}
                          </a>
                        ) : (
                          about || "—"
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <Pill tone={STATUS_TONE[row.status] ?? "quiet"}>{sentence(row.status)}</Pill>
                      </td>
                      <td className="py-3 pr-4 opacity-75 max-w-[420px]">
                        {row.status === "sent"
                          ? `${row.sent_at ? formatDateTime(row.sent_at) : ""}${row.last_error ? ` · not sent: ${row.last_error}` : ""}`
                          : !configured && row.status === "pending"
                            ? "Waiting for a webhook URL."
                            : `${row.attempts} attempt(s)${row.last_error ? ` · ${row.last_error}` : ""}${
                                row.status === "pending" && row.attempts > 0 ? ` · next ${formatDateTime(row.next_attempt_at)}` : ""
                              }`}
                      </td>
                      <td className="py-3 text-right">
                        {row.status === "failed" || (row.status === "pending" && row.attempts > 0) ? (
                          <form action={retryOutboxRow}>
                            <input type="hidden" name="id" value={row.id} />
                            <button type="submit" className="qlink text-[12px]">
                              Retry now
                            </button>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-card p-5 sm:p-6 max-w-[860px]">
        <SectionTitle hint="Secrets live in the server environment (Vercel → Settings → Environment Variables), never here. This only says whether each is present.">
          Keys
        </SectionTitle>
        <div className="mt-5 admin-card overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <tbody>
              <KeyRow label="Razorpay keys" ok={Boolean(keyId && process.env.RAZORPAY_KEY_SECRET)} detail={keyId ? `Using ${razorpayMode}.` : "RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET"} />
              <KeyRow label="Razorpay webhook secret" ok={Boolean(process.env.RAZORPAY_WEBHOOK_SECRET)} detail="Without it, a payment whose browser never returns is not turned into an order." />
              <KeyRow label="Resend" ok={isEmailConfigured()} detail="RESEND_API_KEY — receipts, tracking, reminders, invites." />
              <KeyRow label="Shiprocket API user" ok={isShiprocketConfigured()} detail="SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD" />
              <KeyRow label="Shiprocket pickup PIN" ok={Boolean(process.env.SHIPROCKET_PICKUP_PINCODE)} detail="SHIPROCKET_PICKUP_PINCODE — needed to quote couriers." />
              <KeyRow label="Shiprocket webhook token" ok={Boolean(process.env.SHIPROCKET_WEBHOOK_TOKEN)} detail="SHIPROCKET_WEBHOOK_TOKEN — must match the token set in Shiprocket's webhook." />
              <KeyRow label="n8n shared secret" ok={Boolean(process.env.N8N_WEBHOOK_SECRET)} detail="N8N_WEBHOOK_SECRET — sent to n8n, and required from it." />
              <KeyRow label="Cron secret" ok={Boolean(process.env.CRON_SECRET)} detail="CRON_SECRET — without it the tracking, event and reminder jobs refuse to run." />
              <KeyRow label="Site address" ok={Boolean(process.env.NEXT_PUBLIC_SITE_URL)} detail={process.env.NEXT_PUBLIC_SITE_URL ?? "NEXT_PUBLIC_SITE_URL — links in emails."} />
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
