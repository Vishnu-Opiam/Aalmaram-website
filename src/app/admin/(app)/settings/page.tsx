import { requireOwner } from "@/lib/admin-auth";
import { formatDateTime } from "@/lib/format";
import { isShiprocketConfigured } from "@/lib/shiprocket";
import { createAdminClient } from "@/lib/supabase/admin";
import { SectionTitle } from "../ui";
import { FeaturesForm, InventoryForm, ShippingForm, ShiprocketForm, StoreForm } from "./SettingsForms";

export const metadata = { title: "Settings - Aalmaram admin" };

type Obj = Record<string, unknown>;

const rupees = (paise: unknown) => {
  const n = Number(paise ?? 0);
  return Number.isFinite(n) ? String(n / 100) : "0";
};
const str = (v: unknown) => (typeof v === "string" ? v : "");

export default async function StoreSettingsPage() {
  await requireOwner();

  const { data: rows } = await createAdminClient().from("settings").select("key, value");
  const get = (key: string) => ((rows ?? []).find((r) => r.key === key)?.value ?? {}) as Obj;

  const storePublic = get("store_public");
  const store = get("store");
  const shipping = get("shipping");
  const inventory = get("inventory");
  const features = get("features");
  const shiprocket = get("shiprocket");

  const overrides = Object.entries((shipping.state_overrides ?? {}) as Record<string, number>).map(([state, paise]) => ({
    state,
    rate: rupees(paise),
  }));
  const tokenExpires = str(shiprocket.token_expires_at);

  return (
    <div className="space-y-16 max-w-[860px]">
      <section>
        <SectionTitle hint="What buyers see, and where email comes from.">Store</SectionTitle>
        <StoreForm
          values={{
            name: str(storePublic.name) || "Aalmaram",
            supportEmail: str(storePublic.support_email),
            siteUrl: str(storePublic.site_url),
            gstNumber: str(store.gst_number),
            invoicePrefix: str(store.invoice_prefix) || "AAL",
            adminNotifyEmail: str(store.admin_notify_email),
            fromOrders: str(store.from_orders),
            fromMarketing: str(store.from_marketing),
            envOverrides: {
              fromOrders: Boolean(process.env.EMAIL_FROM_ORDERS),
              notify: Boolean(process.env.ADMIN_NOTIFY_EMAIL),
            },
          }}
        />
      </section>

      <section>
        <SectionTitle hint="Worked out on the server at checkout — the buyer's browser never sets it.">Shipping</SectionTitle>
        <ShippingForm
          flatRate={rupees(shipping.flat_rate_paise)}
          freeThreshold={Number(shipping.free_threshold_paise ?? 0) > 0 ? rupees(shipping.free_threshold_paise) : ""}
          overrides={overrides}
        />
      </section>

      <section>
        <SectionTitle>Shiprocket</SectionTitle>
        <p className="mt-2 text-[12.5px] font-body font-light opacity-70">
          {isShiprocketConfigured() ? (
            <>
              API user configured on the server.{" "}
              {tokenExpires
                ? `Login token cached until ${formatDateTime(tokenExpires)}.`
                : "No login token cached yet — the first shipment or a test below fetches one."}
            </>
          ) : (
            <>
              Not connected: <code>SHIPROCKET_EMAIL</code> and <code>SHIPROCKET_PASSWORD</code> are not set on the
              server. Create an API user in Shiprocket → Settings → API, then add both to the environment.
            </>
          )}
        </p>
        <ShiprocketForm
          pickupLocation={str(shiprocket.pickup_location)}
          envPickup={process.env.SHIPROCKET_PICKUP_LOCATION?.trim() || null}
        />
      </section>

      <section>
        <SectionTitle>Inventory</SectionTitle>
        <InventoryForm threshold={Number(inventory.low_stock_threshold ?? 5)} />
      </section>

      <section>
        <SectionTitle>Switches</SectionTitle>
        <FeaturesForm
          checkoutEnabled={features.checkout_enabled !== false}
          abandonedCheckoutEmail={features.abandoned_checkout_email !== false}
        />
      </section>
    </div>
  );
}
