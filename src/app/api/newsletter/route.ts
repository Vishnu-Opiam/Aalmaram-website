import { NextResponse } from "next/server";

/**
 * POST /api/newsletter
 * Accepts JSON { email, name? } and forwards it to the n8n
 * newsletter-signup webhook, which upserts the person into the
 * NocoDB People table (source = Newsletter, do_not_contact = false).
 *
 * Set N8N_NEWSLETTER_WEBHOOK_URL in .env.local, e.g.
 *   N8N_NEWSLETTER_WEBHOOK_URL=https://n8n.opiamanalytics.com/webhook/newsletter-signup
 */

export const runtime = "nodejs";

export async function POST(request: Request) {
  let email = "";
  let name = "";
  try {
    const body = await request.json();
    email = String(body.email || "").trim().toLowerCase();
    name = String(body.name || "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
  }

  const webhookUrl = process.env.N8N_NEWSLETTER_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error("N8N_NEWSLETTER_WEBHOOK_URL is not configured");
    return NextResponse.json({ error: "Newsletter signup is not available right now" }, { status: 503 });
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name }),
    });
    if (!res.ok) throw new Error(`Webhook responded ${res.status}`);
  } catch (err) {
    console.error("Newsletter webhook failed:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
