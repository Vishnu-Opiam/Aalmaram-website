import { NextResponse } from "next/server";
import { listEvents } from "@/lib/events";

/**
 * POST /api/events/register
 * Accepts JSON { eventId, name, email, phone? } and forwards the
 * registration to the n8n event-registration webhook (Flow 4), which:
 *  - upserts the person into the NocoDB People table
 *  - logs an "Event Registered" interaction
 *  - sends a confirmation email and schedules a reminder 24h before
 *
 * Set N8N_EVENT_WEBHOOK_URL in .env.local, e.g.
 *   N8N_EVENT_WEBHOOK_URL=https://n8n.opiamanalytics.com/webhook/event-registration
 */

export const runtime = "nodejs";

export async function POST(request: Request) {
  let eventId = "";
  let name = "";
  let email = "";
  let phone = "";
  try {
    const body = await request.json();
    eventId = String(body.eventId || "").trim();
    name = String(body.name || "").trim();
    email = String(body.email || "").trim().toLowerCase();
    phone = String(body.phone || "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "Please enter your name" }, { status: 400 });
  }

  const events = await listEvents();
  const event = events.find((e) => e.id === eventId);
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const webhookUrl = process.env.N8N_EVENT_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error("N8N_EVENT_WEBHOOK_URL is not configured");
    return NextResponse.json({ error: "Registration is not available right now" }, { status: 503 });
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        phone,
        event_id: event.id,
        event_title: event.title,
        event_date: event.date,
        event_location: event.location,
      }),
    });
    if (!res.ok) throw new Error(`Webhook responded ${res.status}`);
  } catch (err) {
    console.error("Event registration webhook failed:", err);
    return NextResponse.json({ error: "Something went wrong — please try again" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
