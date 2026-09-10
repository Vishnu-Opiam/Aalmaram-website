import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-auth";
import { updateEvent, deleteEvent, type EventInput } from "@/lib/events";

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

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdminApi())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const input = sanitize(await request.json());
    if (!input.title || !input.date) {
      return NextResponse.json({ error: "Title and date are required." }, { status: 400 });
    }
    const event = await updateEvent(decodeURIComponent(id), input);
    return NextResponse.json({ event });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update event" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdminApi())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    await deleteEvent(decodeURIComponent(id));
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete event" },
      { status: 500 }
    );
  }
}
