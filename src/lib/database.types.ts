/**
 * Database types for the Supabase schema in `supabase/migrations`.
 *
 * HAND-WRITTEN STAND-IN. Regenerate against the real project with:
 *
 *     npm run db:types
 *
 * That overwrites this file with the canonical output of
 * `supabase gen types typescript`. Until the Supabase project exists, this
 * mirrors the migrations by hand so the app type-checks.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** Columns the database fills in for you are optional on insert. */
type Insertable<Row, Defaulted extends keyof Row> = Omit<Row, Defaulted> &
  Partial<Pick<Row, Defaulted>>;

type Timestamps = "id" | "created_at" | "updated_at";

export type ProductRow = {
  id: string;
  handle: string;
  title: string;
  subtitle: string;
  description_md: string;
  status: "draft" | "active" | "archived";
  tags: string[];
  hsn_code: string;
  requires_shipping: boolean;
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductVariantRow = {
  id: string;
  product_id: string;
  title: string;
  sku: string | null;
  price_paise: number;
  compare_at_paise: number | null;
  inventory_quantity: number;
  weight_grams: number;
  length_cm: number;
  breadth_cm: number;
  height_cm: number;
  position: number;
  created_at: string;
  updated_at: string;
};

export type ProductImageRow = {
  id: string;
  product_id: string;
  url: string;
  alt: string;
  position: number;
  created_at: string;
};

export type CustomerRow = {
  id: string;
  email: string;
  phone: string | null;
  first_name: string;
  last_name: string;
  accepts_marketing: boolean;
  notes: string;
  total_orders: number;
  total_spent_paise: number;
  created_at: string;
  updated_at: string;
};

export type DiscountRow = {
  id: string;
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
  combinable: boolean;
  used_count: number;
  starts_at: string;
  ends_at: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type DiscountRedemptionRow = {
  id: string;
  discount_id: string;
  order_id: string;
  customer_email: string;
  amount_paise: number;
  created_at: string;
};

export type CheckoutRow = {
  id: string;
  email: string | null;
  line_items: Json;
  discount_code: string | null;
  subtotal_paise: number;
  discount_paise: number;
  shipping_paise: number;
  tax_paise: number;
  total_paise: number;
  shipping_address: Json | null;
  razorpay_order_id: string | null;
  status: "active" | "completed" | "abandoned";
  completed_order_id: string | null;
  recovery_email_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OrderRow = {
  id: string;
  order_number: string;
  email: string;
  phone: string | null;
  customer_id: string | null;
  payment_status: "pending" | "paid" | "failed" | "refunded" | "partially_refunded";
  fulfillment_status: "unfulfilled" | "fulfilled" | "cancelled" | "returned";
  order_status: "open" | "archived" | "cancelled";
  currency: "INR";
  subtotal_paise: number;
  discount_paise: number;
  shipping_paise: number;
  tax_paise: number;
  total_paise: number;
  refunded_paise: number;
  discount_code: string | null;
  shipping_address: Json;
  billing_address: Json | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  razorpay_signature: string | null;
  notes: string;
  cancel_reason: string | null;
  placed_at: string | null;
  source: "web" | "shopify-import";
  created_at: string;
  updated_at: string;
};

export type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string | null;
  variant_id: string | null;
  title: string;
  variant_title: string;
  sku: string | null;
  unit_price_paise: number;
  quantity: number;
  total_paise: number;
  weight_grams: number;
  created_at: string;
};

export type InventoryAdjustmentRow = {
  id: string;
  variant_id: string;
  delta: number;
  reason: "order" | "restock" | "manual" | "cancellation" | "refund" | "import";
  order_id: string | null;
  note: string;
  created_by: string;
  created_at: string;
};

export type ShipmentRow = {
  id: string;
  order_id: string;
  provider: "shiprocket";
  shiprocket_order_id: string | null;
  shiprocket_shipment_id: string | null;
  awb_code: string | null;
  courier_name: string | null;
  label_url: string | null;
  manifest_url: string | null;
  status:
    | "pending"
    | "awb_assigned"
    | "pickup_scheduled"
    | "in_transit"
    | "delivered"
    | "rto"
    | "cancelled";
  tracking_url: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  raw: Json;
  created_at: string;
  updated_at: string;
};

export type WebhookTopic =
  | "order.paid"
  | "order.shipped"
  | "order.delivered"
  | "order.refunded"
  | "order.cancelled";

export type WebhookOutboxRow = {
  id: string;
  topic: WebhookTopic;
  payload: Json;
  status: "pending" | "sent" | "failed";
  attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
};

export type EventRow = {
  id: string;
  title: string;
  date: string;
  location: string;
  description: string;
  link: string;
  published: boolean;
  created_at: string;
  updated_at: string;
};

export type SettingRow = {
  key: string;
  value: Json;
  is_public: boolean;
  updated_at: string;
};

export type AdminUserRow = {
  id: string;
  user_id: string | null;
  email: string;
  role: "owner" | "staff";
  name: string;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AuditLogRow = {
  id: string;
  admin_user_id: string | null;
  admin_email: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  diff: Json;
  created_at: string;
};

export type RateLimitRow = {
  key: string;
  window_start: string;
  count: number;
};

type Table<Row, Defaulted extends keyof Row> = {
  Row: Row;
  Insert: Insertable<Row, Defaulted>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      products: Table<
        ProductRow,
        | Timestamps
        | "subtitle"
        | "description_md"
        | "status"
        | "tags"
        | "hsn_code"
        | "requires_shipping"
        | "seo_title"
        | "seo_description"
      >;
      product_variants: Table<
        ProductVariantRow,
        | Timestamps
        | "title"
        | "sku"
        | "compare_at_paise"
        | "inventory_quantity"
        | "weight_grams"
        | "length_cm"
        | "breadth_cm"
        | "height_cm"
        | "position"
      >;
      product_images: Table<ProductImageRow, "id" | "created_at" | "alt" | "position">;
      customers: Table<
        CustomerRow,
        | Timestamps
        | "phone"
        | "first_name"
        | "last_name"
        | "accepts_marketing"
        | "notes"
        | "total_orders"
        | "total_spent_paise"
      >;
      discounts: Table<
        DiscountRow,
        | Timestamps
        | "title"
        | "applies_to"
        | "product_ids"
        | "tag"
        | "min_subtotal_paise"
        | "usage_limit"
        | "usage_limit_per_customer"
        | "once_per_customer"
        | "combinable"
        | "used_count"
        | "starts_at"
        | "ends_at"
        | "active"
      >;
      discount_redemptions: Table<DiscountRedemptionRow, "id" | "created_at">;
      checkouts: Table<
        CheckoutRow,
        | Timestamps
        | "email"
        | "line_items"
        | "discount_code"
        | "subtotal_paise"
        | "discount_paise"
        | "shipping_paise"
        | "tax_paise"
        | "total_paise"
        | "shipping_address"
        | "razorpay_order_id"
        | "status"
        | "completed_order_id"
        | "recovery_email_sent_at"
      >;
      orders: Table<
        OrderRow,
        | Timestamps
        | "order_number"
        | "phone"
        | "customer_id"
        | "payment_status"
        | "fulfillment_status"
        | "order_status"
        | "currency"
        | "subtotal_paise"
        | "discount_paise"
        | "shipping_paise"
        | "tax_paise"
        | "total_paise"
        | "refunded_paise"
        | "discount_code"
        | "shipping_address"
        | "billing_address"
        | "razorpay_order_id"
        | "razorpay_payment_id"
        | "razorpay_signature"
        | "notes"
        | "cancel_reason"
        | "placed_at"
        | "source"
      >;
      order_items: Table<
        OrderItemRow,
        "id" | "created_at" | "product_id" | "variant_id" | "variant_title" | "sku" | "weight_grams"
      >;
      inventory_adjustments: Table<
        InventoryAdjustmentRow,
        "id" | "created_at" | "order_id" | "note" | "created_by"
      >;
      shipments: Table<
        ShipmentRow,
        | Timestamps
        | "provider"
        | "shiprocket_order_id"
        | "shiprocket_shipment_id"
        | "awb_code"
        | "courier_name"
        | "label_url"
        | "manifest_url"
        | "status"
        | "tracking_url"
        | "shipped_at"
        | "delivered_at"
        | "raw"
      >;
      webhook_outbox: Table<
        WebhookOutboxRow,
        "id" | "created_at" | "status" | "attempts" | "next_attempt_at" | "last_error" | "sent_at"
      >;
      events: Table<EventRow, Timestamps | "location" | "description" | "link" | "published">;
      settings: Table<SettingRow, "value" | "is_public" | "updated_at">;
      admin_users: Table<AdminUserRow, Timestamps | "user_id" | "role" | "name" | "last_login_at">;
      audit_log: Table<
        AuditLogRow,
        "id" | "created_at" | "admin_user_id" | "admin_email" | "entity_id" | "diff"
      >;
      rate_limits: Table<RateLimitRow, "window_start" | "count">;
    };
    Views: { [_ in never]: never };
    Functions: {
      create_order_from_checkout: {
        Args: {
          p_checkout_id: string;
          p_razorpay_order_id: string;
          p_razorpay_payment_id: string;
          p_razorpay_signature: string;
          p_source?: string;
        };
        Returns: Json;
      };
      rate_limit_hit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number };
        Returns: boolean;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
