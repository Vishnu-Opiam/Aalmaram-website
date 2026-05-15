import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { listEvents, createEvent, type EventInput } from "@/lib/shopify";

function sanitize(body: unknown): EventInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return {
    title: str(b.title),
    date: str(b.date),
    location: str(b.location),
    description: str(b.description),
    link: str(b.link),
  };
}

export async function GET() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ events: await listEvents() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load events" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const input = sanitize(await request.json());
    if (!input.title || !input.date) {
      return NextResponse.json({ error: "Title and date are required." }, { status: 400 });
    }
    const event = await createEvent(input);
    return NextResponse.json({ event }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create event" },
      { status: 500 }
    );
  }
}
