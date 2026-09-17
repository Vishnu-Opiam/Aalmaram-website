"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit, requireOwner } from "@/lib/admin-auth";
import { sendAdminAccessLink } from "@/lib/email";
import { siteUrl } from "@/lib/env";
import { humaniseDbError, rupeesToPaise } from "@/lib/format";
import { canonicalState } from "@/lib/india";
import { OUTBOX_TOPICS, postToWebhook, resolveWebhookUrls } from "@/lib/outbox";
import { isShiprocketConfigured, shiprocketToken } from "@/lib/shiprocket";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ActionState {
  error: string;
  ok?: string;
  /** A link the owner may need to copy by hand (an invite, when email is not set up). */
  link?: string;
}

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

async function merge(key: string, patch: Record<string, Json>, actor: string): Promise<string | null> {
  const { error } = await createAdminClient().rpc("merge_setting", { p_key: key, p_patch: patch, p_actor: actor });
  return error ? humaniseDbError(error.message) : null;
}

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();
const emailish = z.string().email();
const fromAddress = /^[^<>]{1,80} <[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>$|^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

// ── Store ───────────────────────────────────────────────────────────────────

export async function saveStore(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireOwner();

  const name = text(formData, "name");
  const supportEmail = text(formData, "support_email").toLowerCase();
  const site = text(formData, "site_url").replace(/\/+$/, "");
  const gst = text(formData, "gst_number").toUpperCase();
  const prefix = text(formData, "invoice_prefix").toUpperCase();
  const notify = text(formData, "admin_notify_email").toLowerCase();
  const fromOrders = text(formData, "from_orders");
  const fromMarketing = text(formData, "from_marketing");

  if (!name || name.length > 80) return { error: "The store name is required, up to 80 characters." };
  if (!emailish.safeParse(supportEmail).success) return { error: "The support email doesn't look right." };
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(site)) {
    return { error: "The site address should look like https://aalmaram.com — no path." };
  }
  // GSTIN: 2-digit state, 10-character PAN, entity number, Z, checksum.
  if (gst && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gst)) {
    return { error: "That GST number doesn't look like a GSTIN (15 characters, e.g. 32ABCDE1234F1Z5). Leave it blank if you don't have one." };
  }
  if (!/^[A-Z0-9-]{1,10}$/.test(prefix)) return { error: "The invoice prefix is up to 10 letters, numbers or dashes." };
  if (notify && !emailish.safeParse(notify).success) return { error: "The new-order alert email doesn't look right." };
  if (!fromAddress.test(fromOrders) || !fromAddress.test(fromMarketing)) {
    return { error: 'From addresses look like: Aalmaram <foundersteam@aalmaram.com>' };
  }

  const error =
    (await merge("store_public", { name, support_email: supportEmail, site_url: site }, session.email)) ??
    (await merge(
      "store",
      {
        gst_number: gst,
        invoice_prefix: prefix,
        admin_notify_email: notify,
        from_orders: fromOrders,
        from_marketing: fromMarketing,
      },
      session.email
    ));
  if (error) return { error };

  revalidatePath("/admin/settings");
  return { error: "", ok: "Store details saved." };
}

// ── Shipping ────────────────────────────────────────────────────────────────

export async function saveShipping(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireOwner();

  const flat = rupeesToPaise(text(formData, "flat_rate"));
  if (flat === null) return { error: "Enter the flat shipping rate in rupees, like 60. Use 0 for free shipping everywhere." };

  const thresholdText = text(formData, "free_threshold");
  const threshold = thresholdText === "" ? 0 : rupeesToPaise(thresholdText);
  if (threshold === null) return { error: "Enter the free-shipping threshold in rupees, or leave it blank for none." };

  const states = formData.getAll("override_state").map(String);
  const rates = formData.getAll("override_rate").map(String);
  const overrides: Record<string, number> = {};
  for (let i = 0; i < states.length; i++) {
    const rawState = states[i]?.trim() ?? "";
    const rawRate = rates[i]?.trim() ?? "";
    if (!rawState && !rawRate) continue;
    const state = canonicalState(rawState);
    if (!state) return { error: `"${rawState}" isn't an Indian state or union territory.` };
    if (state in overrides) return { error: `${state} is listed twice.` };
    const paise = rupeesToPaise(rawRate);
    if (paise === null) return { error: `Enter a rate in rupees for ${state}.` };
    overrides[state] = paise;
  }

  const error = await merge(
    "shipping",
    { flat_rate_paise: flat, free_threshold_paise: threshold, state_overrides: overrides },
    session.email
  );
  if (error) return { error };

  revalidatePath("/admin/settings");
  revalidatePath("/checkout");
  revalidatePath("/shop");
  revalidatePath("/", "layout");
  return { error: "", ok: "Shipping saved. New checkouts use it straight away." };
}

// ── Inventory ───────────────────────────────────────────────────────────────

export async function saveInventory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireOwner();
  const raw = text(formData, "low_stock_threshold");
  if (!/^\d{1,4}$/.test(raw)) return { error: "The low-stock threshold is a whole number of copies, 0 or more." };

  const error = await merge("inventory", { low_stock_threshold: Number(raw) }, session.email);
  if (error) return { error };

  revalidatePath("/admin/settings");
  revalidatePath("/admin/products");
  revalidatePath("/admin");
  return { error: "", ok: "Saved." };
}

// ── Features ────────────────────────────────────────────────────────────────

export async function saveFeatures(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireOwner();
  const error = await merge(
    "features",
    {
      checkout_enabled: formData.get("checkout_enabled") === "on",
      abandoned_checkout_email: formData.get("abandoned_checkout_email") === "on",
    },
    session.email
  );
  if (error) return { error };

  revalidatePath("/admin/settings");
  revalidatePath("/checkout");
  return { error: "", ok: "Saved." };
}

// ── Shiprocket ──────────────────────────────────────────────────────────────

export async function saveShiprocketPickup(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireOwner();
  const nickname = text(formData, "pickup_location");
  if (nickname.length > 60) return { error: "That nickname is too long." };

  const error = await merge("shiprocket", { pickup_location: nickname }, session.email);
  if (error) return { error };

  revalidatePath("/admin/settings");
  return { error: "", ok: nickname ? "Pickup location saved." : "Cleared." };
}

export async function testShiprocket(): Promise<ActionState> {
  const session = await requireOwner();
  if (!isShiprocketConfigured()) {
    return { error: "SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD are not set on the server." };
  }
  try {
    await shiprocketToken(true);
    await recordAudit(session, { action: "shiprocket.test", entityType: "settings", entityId: "shiprocket" });
    revalidatePath("/admin/settings");
    return { error: "", ok: "Shiprocket accepted the login. A fresh token is cached." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Shiprocket could not be reached." };
  }
}

// ── Integrations ────────────────────────────────────────────────────────────

export async function saveWebhooks(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireOwner();
  const webhooks: Record<string, string> = {};
  for (const topic of OUTBOX_TOPICS) {
    const url = text(formData, `webhook:${topic}`);
    if (url && !/^https:\/\/\S+$/i.test(url)) {
      return { error: `The ${topic} URL has to start with https://.` };
    }
    webhooks[topic] = url;
  }

  const error = await merge("integrations", { webhooks }, session.email);
  if (error) return { error };

  revalidatePath("/admin/settings/integrations");
  return { error: "", ok: "Saved. Events waiting for a topic you just set go out on the next drain." };
}

/** A clearly-marked sample, straight to the URL — it does not touch the outbox. */
export async function sendTestWebhook(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireOwner();
  const topic = text(formData, "topic");
  if (!(OUTBOX_TOPICS as readonly string[]).includes(topic)) return { error: "Unknown topic." };

  const urls = await resolveWebhookUrls();
  const url = urls[topic as (typeof OUTBOX_TOPICS)[number]].url;
  if (!url) return { error: `No URL is set for ${topic}. Save one first.` };

  const id = `test-${Date.now()}`;
  const now = new Date().toISOString();
  const event = { id, topic, created_at: now, attempt: 1, test: true };
  const sampleOrder = {
    id: "00000000-0000-0000-0000-000000000000",
    name: "#TEST0000",
    order_number: "TEST0000",
    email: "test@example.com",
    phone: "9999999999",
    created_at: now,
    currency: "INR",
    financial_status: "paid",
    fulfillment_status: topic === "order.paid" ? "unfulfilled" : "fulfilled",
    subtotal_price: "700.00",
    total_discounts: "0.00",
    total_tax: "0.00",
    total_price: "760.00",
    discount_codes: [],
    buyer_accepts_marketing: false,
    customer: { first_name: "Test", last_name: "Order", email: "test@example.com", phone: "9999999999" },
    shipping_address: {
      name: "Test Order",
      first_name: "Test",
      last_name: "Order",
      address1: "1 Test Road",
      address2: "",
      city: "Kochi",
      province: "Kerala",
      zip: "682001",
      country: "India",
      phone: "9999999999",
    },
    line_items: [{ title: "Test book", variant_title: "", sku: "TEST", quantity: 1, price: "700.00" }],
    shipping_lines: [{ title: "Shipping", price: "60.00" }],
    fulfillments: [],
    shipment: null,
  };

  const body =
    topic === "inventory.low"
      ? {
          event,
          data: {
            product_title: "Test book",
            variant_title: "Default",
            sku: "TEST",
            available: 3,
            previous: 6,
            threshold: 5,
          },
          available: 3,
          current_available: 3,
          title: "Test book",
        }
      : { ...sampleOrder, event, data: { order_id: sampleOrder.id, order_number: "TEST0000", email: "test@example.com", accepts_marketing: false } };

  const result = await postToWebhook(url, { topic, id }, body);
  await recordAudit(session, {
    action: "integrations.test",
    entityType: "settings",
    entityId: "integrations",
    diff: { topic, outcome: result.outcome, status: result.status },
  });

  return result.outcome === "sent"
    ? { error: "", ok: `n8n accepted the ${topic} test (${result.status}). Check the execution in n8n.` }
    : { error: `The ${topic} test failed: ${result.error}` };
}

export async function retryOutboxRow(formData: FormData): Promise<void> {
  const session = await requireOwner();
  const id = text(formData, "id");
  if (!id) return;
  const { error } = await createAdminClient().rpc("retry_outbox", { p_id: id, p_actor: session.email });
  if (error) console.error(`retry_outbox ${id}: ${error.message}`);
  revalidatePath("/admin/settings/integrations");
  revalidatePath("/admin");
}

// ── Team ────────────────────────────────────────────────────────────────────

/**
 * A one-time link to set a password. Supabase makes the token; the link points
 * at our own /admin/accept-invite, which verifies it only when the form is
 * submitted — so an email scanner following the link can't use it up.
 */
async function accessLink(email: string, kind: "invite" | "recovery"): Promise<{ link: string } | { error: string }> {
  const db = createAdminClient();
  const { data, error } = await db.auth.admin.generateLink({ type: kind, email });
  if (error || !data?.properties?.hashed_token) {
    return { error: error?.message ?? "Supabase did not return a link." };
  }
  const params = new URLSearchParams({ token_hash: data.properties.hashed_token, type: kind });
  return { link: `${siteUrl()}/admin/accept-invite?${params}` };
}

export async function inviteAdmin(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireOwner();
  const email = text(formData, "email").toLowerCase();
  const name = text(formData, "name");
  const role = text(formData, "role");

  if (!emailish.safeParse(email).success) return { error: "That email doesn't look right." };
  if (role !== "owner" && role !== "staff") return { error: "Pick a role." };
  if (name.length > 80) return { error: "That name is too long." };

  const db = createAdminClient();
  const { data: existing } = await db.from("admin_users").select("id").eq("email", email).maybeSingle();
  if (existing) return { error: `${email} is already on the team. Send them a password link instead.` };

  // An invite creates the Supabase user; if one already exists (they had an
  // account before), a recovery link does the same job.
  let result = await accessLink(email, "invite");
  let kind: "invite" | "recovery" = "invite";
  if ("error" in result && /already|registered|exists/i.test(result.error)) {
    result = await accessLink(email, "recovery");
    kind = "recovery";
  }
  if ("error" in result) return { error: `Could not create the invite: ${result.error}` };

  const { data: userList } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const userId = userList?.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;

  const { data: row, error: insertError } = await db
    .from("admin_users")
    .insert({
      email,
      name,
      role,
      user_id: userId,
      invited_at: new Date().toISOString(),
      invited_by: session.email,
    })
    .select("id")
    .single();
  if (insertError) return { error: `Could not add them: ${insertError.message}` };

  await recordAudit(session, { action: "admin.invite", entityType: "admin_user", entityId: row.id, diff: { email, role, name } });

  const sent = await sendAdminAccessLink(email, { link: result.link, invitedBy: session.name || session.email, kind });
  revalidatePath("/admin/settings/team");
  return sent.sent
    ? { error: "", ok: `Invitation emailed to ${email}.`, link: result.link }
    : { error: "", ok: `${email} is added. Email isn't set up, so send them this link yourself — it works once and expires within the hour.`, link: result.link };
}

export async function sendPasswordLink(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireOwner();
  const id = text(formData, "id");
  const db = createAdminClient();
  const { data: admin } = await db.from("admin_users").select("id, email").eq("id", id).maybeSingle();
  if (!admin) return { error: "That person is no longer on the team." };

  let result = await accessLink(admin.email, "recovery");
  let kind: "invite" | "recovery" = "recovery";
  // Invited but never signed in, and the Supabase user has gone: invite again.
  if ("error" in result) {
    result = await accessLink(admin.email, "invite");
    kind = "invite";
  }
  if ("error" in result) return { error: `Could not create a link: ${result.error}` };

  await recordAudit(session, { action: "admin.password_link", entityType: "admin_user", entityId: admin.id, diff: { email: admin.email } });
  const sent = await sendAdminAccessLink(admin.email, { link: result.link, invitedBy: session.name || session.email, kind });
  return sent.sent
    ? { error: "", ok: `Link emailed to ${admin.email}.`, link: result.link }
    : { error: "", ok: "Email isn't set up — send this link yourself. It works once and expires within the hour.", link: result.link };
}

export async function setAdminRole(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireOwner();
  const id = text(formData, "id");
  const role = text(formData, "role");
  const { error } = await createAdminClient().rpc("set_admin_role", { p_admin_id: id, p_role: role, p_actor: session.email });
  if (error) return { error: humaniseDbError(error.message) };
  revalidatePath("/admin/settings/team");
  return { error: "", ok: "Role changed." };
}

export async function removeAdmin(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireOwner();
  const id = text(formData, "id");
  const db = createAdminClient();
  const { data, error } = await db.rpc("remove_admin_user", { p_admin_id: id, p_actor: session.email });
  if (error) return { error: humaniseDbError(error.message) };

  // Their sign-in goes too, so a removed person holds no account that could be
  // re-admitted by accident (for example through ADMIN_ALLOWLIST).
  const removed = data as { email: string; user_id: string | null };
  if (removed.user_id) {
    const { error: deleteError } = await db.auth.admin.deleteUser(removed.user_id);
    if (deleteError) console.error(`Removed ${removed.email} from the team but could not delete their login: ${deleteError.message}`);
  }

  revalidatePath("/admin/settings/team");
  return { error: "", ok: `${removed.email} no longer has access.` };
}
