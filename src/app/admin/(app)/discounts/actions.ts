"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { recordAudit, requireAdmin } from "@/lib/admin-auth";
import { fromISTInputValue, rupeesToPaise } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ActionState {
  error: string;
  ok?: string;
}

const optionalWhole = z
  .string()
  .trim()
  .refine((v) => v === "" || /^[1-9]\d*$/.test(v), "Limits are whole numbers above zero, or blank for none.");

const discountSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{3,32}$/, "Codes are 3–32 letters, numbers, dashes or underscores."),
  title: z.string().trim().max(120),
  type: z.enum(["percentage", "fixed_amount", "free_shipping"]),
  value: z.string().trim(),
  applies_to: z.enum(["all", "products", "tag"]),
  tag: z.string().trim().max(60),
  min_subtotal: z.string().trim(),
  usage_limit: optionalWhole,
  usage_limit_per_customer: optionalWhole,
  starts_at: z.string().trim(),
  ends_at: z.string().trim(),
});

type DiscountRow = {
  code: string;
  title: string;
  type: "percentage" | "fixed_amount" | "free_shipping";
  value: number;
  applies_to: "all" | "products" | "tag";
  product_ids: string[] | null;
  tag: string | null;
  min_subtotal_paise: number | null;
  usage_limit: number | null;
  usage_limit_per_customer: number | null;
  once_per_customer: boolean;
  starts_at: string;
  ends_at: string | null;
  active: boolean;
};

/**
 * Validates everything the database would reject, so the admin gets a sentence
 * rather than a constraint name. The constraints stay as the backstop.
 */
function readDiscount(formData: FormData): { row: DiscountRow } | { error: string } {
  const parsed = discountSchema.safeParse(
    Object.fromEntries(Object.keys(discountSchema.shape).map((k) => [k, String(formData.get(k) ?? "")]))
  );
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const d = parsed.data;

  let value = 0;
  if (d.type === "percentage") {
    value = Number(d.value);
    if (!/^\d+(\.\d{1,2})?$/.test(d.value) || value <= 0 || value > 100) {
      return { error: "A percentage must be above 0 and at most 100." };
    }
  } else if (d.type === "fixed_amount") {
    const paise = rupeesToPaise(d.value);
    if (paise === null || paise <= 0) return { error: "Enter the amount off in rupees, like 100." };
    value = paise;
  }

  const productIds = formData.getAll("product_ids").map(String).filter(Boolean);
  if (d.applies_to === "products" && productIds.length === 0) {
    return { error: "Pick at least one product, or apply the code to everything." };
  }
  if (d.applies_to === "tag" && !d.tag) return { error: "Enter the tag this code applies to." };

  let minSubtotal: number | null = null;
  if (d.min_subtotal) {
    minSubtotal = rupeesToPaise(d.min_subtotal);
    if (minSubtotal === null) return { error: "Minimum basket must be an amount in rupees." };
  }

  const startsAt = d.starts_at ? fromISTInputValue(d.starts_at) : new Date().toISOString();
  if (!startsAt) return { error: "That start date doesn't look right." };
  const endsAt = d.ends_at ? fromISTInputValue(d.ends_at) : null;
  if (d.ends_at && !endsAt) return { error: "That end date doesn't look right." };
  if (endsAt && endsAt <= startsAt) return { error: "The end has to be after the start." };

  const oncePerCustomer = formData.get("once_per_customer") === "on";

  return {
    row: {
      code: d.code,
      title: d.title,
      type: d.type,
      value,
      applies_to: d.applies_to,
      product_ids: d.applies_to === "products" ? productIds : null,
      tag: d.applies_to === "tag" ? d.tag : null,
      min_subtotal_paise: minSubtotal,
      usage_limit: d.usage_limit ? Number(d.usage_limit) : null,
      // Once per customer is the stricter rule; when it is on, the per-customer
      // number is redundant and is cleared so the two can't disagree.
      usage_limit_per_customer: oncePerCustomer
        ? null
        : d.usage_limit_per_customer
          ? Number(d.usage_limit_per_customer)
          : null,
      once_per_customer: oncePerCustomer,
      starts_at: startsAt,
      ends_at: endsAt,
      active: formData.get("active") === "on",
    },
  };
}

function refresh(id?: string) {
  revalidatePath("/admin/discounts");
  if (id) revalidatePath(`/admin/discounts/${id}`);
}

export async function createDiscount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin();
  const result = readDiscount(formData);
  if ("error" in result) return result;

  const db = createAdminClient();
  const { data, error } = await db.from("discounts").insert(result.row).select("id").single();
  if (error) {
    return {
      error: error.code === "23505" ? `The code ${result.row.code} already exists.` : `Could not save: ${error.message}`,
    };
  }

  await recordAudit(session, {
    action: "discount.create",
    entityType: "discount",
    entityId: data.id,
    diff: { ...result.row },
  });
  refresh();
  redirect(`/admin/discounts/${data.id}?saved=1`);
}

export async function updateDiscount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing discount." };
  const result = readDiscount(formData);
  if ("error" in result) return result;

  const db = createAdminClient();
  const { data: before } = await db.from("discounts").select("*").eq("id", id).maybeSingle();
  if (!before) return { error: "That discount no longer exists." };

  const { error } = await db.from("discounts").update(result.row).eq("id", id);
  if (error) {
    return {
      error: error.code === "23505" ? `The code ${result.row.code} already exists.` : `Could not save: ${error.message}`,
    };
  }

  const changed = Object.fromEntries(
    Object.entries(result.row)
      .filter(([key, value]) => JSON.stringify(before[key as keyof typeof before]) !== JSON.stringify(value))
      .map(([key, value]) => [key, { from: before[key as keyof typeof before], to: value }])
  );
  await recordAudit(session, { action: "discount.update", entityType: "discount", entityId: id, diff: changed });
  refresh(id);
  return { error: "", ok: "Saved." };
}

export async function setDiscountActive(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) return;

  const db = createAdminClient();
  await db.from("discounts").update({ active }).eq("id", id);
  await recordAudit(session, {
    action: active ? "discount.activate" : "discount.deactivate",
    entityType: "discount",
    entityId: id,
  });
  refresh(id);
}

/**
 * Only a code that has never been used can be deleted. Deleting one that has
 * would take its redemption history with it (the foreign key cascades), so a
 * used code is deactivated instead.
 */
export async function deleteDiscount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing discount." };

  const db = createAdminClient();
  const { count } = await db
    .from("discount_redemptions")
    .select("id", { count: "exact", head: true })
    .eq("discount_id", id);
  if (count && count > 0) {
    return { error: "This code has been used, so it can only be deactivated — deleting it would erase its history." };
  }

  const { data: deleted, error } = await db
    .from("discounts")
    .delete()
    .eq("id", id)
    .eq("used_count", 0)
    .select("code");
  if (error) return { error: `Could not delete: ${error.message}` };
  if (!deleted?.length) return { error: "This code has been used, so it can only be deactivated." };

  await recordAudit(session, {
    action: "discount.delete",
    entityType: "discount",
    entityId: id,
    diff: { code: deleted[0].code },
  });
  refresh();
  redirect("/admin/discounts");
}
