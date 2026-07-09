import { NextResponse } from "next/server";

/**
 * POST /api/collaborate
 * Accepts JSON { name, email, idea } from the "Collaborate with us" form and
 * forwards it to an n8n webhook, which emails the submission to Nivedith.
 *
 * Set N8N_COLLABORATE_WEBHOOK_URL in .env.local, e.g.
 *   N8N_COLLABORATE_WEBHOOK_URL=https://n8n.opiamanalytics.com/webhook/collaborate
 *
 * If the webhook is not configured we log the submission to the server console
 * so nothing is silently lost during setup (same pattern as /api/preorder).
 */

export const runtime = "nodejs";

export async function POST(request: Request) {
  let name = "";
  let email = "";
  let idea = "";
  try {
    const body = await request.json();
    name = String(body.name || "").trim();
    email = String(body.email || "").trim();
    idea = String(body.idea || "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!name || !idea) {
    return NextResponse.json({ error: "Please add your name and your idea" }, { status: 400 });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
  }

  const webhookUrl = process.env.N8N_COLLABORATE_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log("💡 COLLABORATE:", { name, email, idea, timestamp: new Date().toISOString() });
    return NextResponse.json({ ok: true, note: "Logged locally (webhook not configured)" });
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, idea }),
    });
    if (!res.ok) throw new Error(`Webhook responded ${res.status}`);
  } catch (err) {
    console.error("Collaborate webhook failed:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
