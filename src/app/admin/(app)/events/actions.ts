"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { recordAudit, requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ActionState {
  error: string;
  ok?: string;
}

const eventSchema = z.object({
  title: z.string().trim().min(1, "Give the event a title.").max(140, "Keep the title under 140 characters."),
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date of the event.")
    .refine((v) => !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()), "That date doesn't look right."),
  location: z.string().trim().max(200),
  description: z.string().trim().max(1000, "Keep the description under 1,000 characters."),
  link: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "A link has to start with http:// or https://."),
});

type EventRow = z.infer<typeof eventSchema> & { published: boolean };

function readEvent(formData: FormData): { row: EventRow } | { error: string } {
  const parsed = eventSchema.safeParse(
    Object.fromEntries(Object.keys(eventSchema.shape).map((k) => [k, String(formData.get(k) ?? "")]))
  );
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  return { row: { ...parsed.data, published: formData.get("published") === "on" } };
}

/** The homepage lists events, so every change refreshes it too. */
function refresh(id?: string) {
  revalidatePath("/admin/events");
  if (id) revalidatePath(`/admin/events/${id}`);
  revalidatePath("/");
}

export async function createEvent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin();
  const result = readEvent(formData);
  if ("error" in result) return result;

  const db = createAdminClient();
  const { data, error } = await db.from("events").insert(result.row).select("id").single();
  if (error) return { error: `Could not save: ${error.message}` };

  await recordAudit(session, { action: "event.create", entityType: "event", entityId: data.id, diff: { ...result.row } });
  refresh();
  redirect(`/admin/events/${data.id}?saved=1`);
}

export async function updateEvent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing event." };
  const result = readEvent(formData);
  if ("error" in result) return result;

  const db = createAdminClient();
  const { data: before } = await db.from("events").select("*").eq("id", id).maybeSingle();
  if (!before) return { error: "That event no longer exists." };

  const { error } = await db.from("events").update(result.row).eq("id", id);
  if (error) return { error: `Could not save: ${error.message}` };

  const changed = Object.fromEntries(
    Object.entries(result.row)
      .filter(([key, value]) => before[key as keyof typeof before] !== value)
      .map(([key, value]) => [key, { from: before[key as keyof typeof before], to: value }])
  );
  await recordAudit(session, { action: "event.update", entityType: "event", entityId: id, diff: changed });
  refresh(id);
  return { error: "", ok: "Saved." };
}

export async function setEventPublished(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const published = formData.get("published") === "true";
  if (!id) return;

  const db = createAdminClient();
  await db.from("events").update({ published }).eq("id", id);
  await recordAudit(session, {
    action: published ? "event.publish" : "event.unpublish",
    entityType: "event",
    entityId: id,
  });
  refresh(id);
}

export async function deleteEvent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing event." };

  const db = createAdminClient();
  const { data: deleted, error } = await db.from("events").delete().eq("id", id).select("title, date");
  if (error) return { error: `Could not delete: ${error.message}` };
  if (!deleted?.length) return { error: "That event no longer exists." };

  await recordAudit(session, { action: "event.delete", entityType: "event", entityId: id, diff: deleted[0] });
  refresh();
  redirect("/admin/events");
}
