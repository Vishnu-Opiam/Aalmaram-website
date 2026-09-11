"use server";

import { revalidatePath } from "next/cache";
import { recordAudit, requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ActionState {
  error: string;
  ok?: string;
}

export async function updateCustomerNotes(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const notes = String(formData.get("notes") ?? "").slice(0, 5000);
  if (!id) return { error: "Missing customer." };

  const db = createAdminClient();
  const { error } = await db.from("customers").update({ notes }).eq("id", id);
  if (error) return { error: `Could not save: ${error.message}` };

  await recordAudit(session, {
    action: "customer.notes.update",
    entityType: "customer",
    entityId: id,
    diff: { length: notes.length },
  });
  revalidatePath(`/admin/customers/${id}`);
  return { error: "", ok: "Notes saved." };
}

/**
 * Switching marketing off is always allowed — withdrawing consent must be as
 * easy as giving it. Switching it on records who did it and when; it should
 * only ever reflect a yes the customer gave directly (an email, a form).
 */
export async function setMarketing(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const accepts = formData.get("accepts_marketing") === "true";
  const source = String(formData.get("source") ?? "").trim().slice(0, 200);
  if (!id) return { error: "Missing customer." };
  if (accepts && !source) {
    return { error: "Say how they agreed (e.g. “replied to the launch email”), so the yes can be shown later." };
  }

  const db = createAdminClient();
  const { error } = await db
    .from("customers")
    .update({
      accepts_marketing: accepts,
      marketing_consent_at: accepts ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) return { error: `Could not save: ${error.message}` };

  await recordAudit(session, {
    action: accepts ? "customer.marketing.opt_in" : "customer.marketing.opt_out",
    entityType: "customer",
    entityId: id,
    diff: accepts ? { source } : {},
  });
  revalidatePath(`/admin/customers/${id}`);
  revalidatePath("/admin/customers");
  return { error: "", ok: accepts ? "Marked as opted in." : "Opted out. They won't get marketing email." };
}
