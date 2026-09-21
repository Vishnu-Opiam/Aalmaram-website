export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_users: {
        Row: {
          created_at: string
          email: string
          id: string
          invited_at: string | null
          invited_by: string | null
          last_login_at: string | null
          name: string
          revoked_at: string | null
          revoked_by: string | null
          role: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          last_login_at?: string | null
          name?: string
          revoked_at?: string | null
          revoked_by?: string | null
          role?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          last_login_at?: string | null
          name?: string
          revoked_at?: string | null
          revoked_by?: string | null
          role?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          admin_email: string
          admin_user_id: string | null
          created_at: string
          diff: Json
          entity_id: string | null
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          admin_email?: string
          admin_user_id?: string | null
          created_at?: string
          diff?: Json
          entity_id?: string | null
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          admin_email?: string
          admin_user_id?: string | null
          created_at?: string
          diff?: Json
          entity_id?: string | null
          entity_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      checkouts: {
        Row: {
          accepts_marketing: boolean
          completed_order_id: string | null
          created_at: string
          discount_code: string | null
          discount_paise: number
          email: string | null
          id: string
          line_items: Json
          razorpay_order_id: string | null
          recovery_email_sent_at: string | null
          shipping_address: Json | null
          shipping_paise: number
          status: string
          subtotal_paise: number
          tax_paise: number
          total_paise: number
          updated_at: string
        }
        Insert: {
          accepts_marketing?: boolean
          completed_order_id?: string | null
          created_at?: string
          discount_code?: string | null
          discount_paise?: number
          email?: string | null
          id?: string
          line_items?: Json
          razorpay_order_id?: string | null
          recovery_email_sent_at?: string | null
          shipping_address?: Json | null
          shipping_paise?: number
          status?: string
          subtotal_paise?: number
          tax_paise?: number
          total_paise?: number
          updated_at?: string
        }
        Update: {
          accepts_marketing?: boolean
          completed_order_id?: string | null
          created_at?: string
          discount_code?: string | null
          discount_paise?: number
          email?: string | null
          id?: string
          line_items?: Json
          razorpay_order_id?: string | null
          recovery_email_sent_at?: string | null
          shipping_address?: Json | null
          shipping_paise?: number
          status?: string
          subtotal_paise?: number
          tax_paise?: number
          total_paise?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkouts_completed_order_id_fkey"
            columns: ["completed_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          accepts_marketing: boolean
          created_at: string
          email: string
          first_name: string
          id: string
          last_name: string
          marketing_consent_at: string | null
          notes: string
          phone: string | null
          shopify_id: number | null
          total_orders: number
          total_spent_paise: number
          updated_at: string
        }
        Insert: {
          accepts_marketing?: boolean
          created_at?: string
          email: string
          first_name?: string
          id?: string
          last_name?: string
          marketing_consent_at?: string | null
          notes?: string
          phone?: string | null
          shopify_id?: number | null
          total_orders?: number
          total_spent_paise?: number
          updated_at?: string
        }
        Update: {
          accepts_marketing?: boolean
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          marketing_consent_at?: string | null
          notes?: string
          phone?: string | null
          shopify_id?: number | null
          total_orders?: number
          total_spent_paise?: number
          updated_at?: string
        }
        Relationships: []
      }
      discount_redemptions: {
        Row: {
          amount_paise: number
          created_at: string
          customer_email: string
          discount_id: string
          id: string
          order_id: string
        }
        Insert: {
          amount_paise: number
          created_at?: string
          customer_email: string
          discount_id: string
          id?: string
          order_id: string
        }
        Update: {
          amount_paise?: number
          created_at?: string
          customer_email?: string
          discount_id?: string
          id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discount_redemptions_discount_id_fkey"
            columns: ["discount_id"]
            isOneToOne: false
            referencedRelation: "discounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      discounts: {
        Row: {
          active: boolean
          applies_to: string
          code: string
          combinable: boolean
          created_at: string
          ends_at: string | null
          id: string
          min_subtotal_paise: number | null
          once_per_customer: boolean
          product_ids: string[] | null
          shopify_id: number | null
          starts_at: string
          tag: string | null
          title: string
          type: string
          updated_at: string
          usage_limit: number | null
          usage_limit_per_customer: number | null
          used_count: number
          value: number
        }
        Insert: {
          active?: boolean
          applies_to?: string
          code: string
          combinable?: boolean
          created_at?: string
          ends_at?: string | null
          id?: string
          min_subtotal_paise?: number | null
          once_per_customer?: boolean
          product_ids?: string[] | null
          shopify_id?: number | null
          starts_at?: string
          tag?: string | null
          title?: string
          type: string
          updated_at?: string
          usage_limit?: number | null
          usage_limit_per_customer?: number | null
          used_count?: number
          value: number
        }
        Update: {
          active?: boolean
          applies_to?: string
          code?: string
          combinable?: boolean
          created_at?: string
          ends_at?: string | null
          id?: string
          min_subtotal_paise?: number | null
          once_per_customer?: boolean
          product_ids?: string[] | null
          shopify_id?: number | null
          starts_at?: string
          tag?: string | null
          title?: string
          type?: string
          updated_at?: string
          usage_limit?: number | null
          usage_limit_per_customer?: number | null
          used_count?: number
          value?: number
        }
        Relationships: []
      }
      events: {
        Row: {
          created_at: string
          date: string
          description: string
          id: string
          link: string
          location: string
          published: boolean
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          description?: string
          id?: string
          link?: string
          location?: string
          published?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          description?: string
          id?: string
          link?: string
          location?: string
          published?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory_adjustments: {
        Row: {
          created_at: string
          created_by: string
          delta: number
          id: string
          note: string
          order_id: string | null
          reason: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          delta: number
          id?: string
          note?: string
          order_id?: string | null
          reason: string
          variant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          delta?: number
          id?: string
          note?: string
          order_id?: string | null
          reason?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_adjustments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustments_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_id: string | null
          quantity: number
          restocked_quantity: number
          sku: string | null
          title: string
          total_paise: number
          unit_price_paise: number
          variant_id: string | null
          variant_title: string
          weight_grams: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_id?: string | null
          quantity: number
          restocked_quantity?: number
          sku?: string | null
          title: string
          total_paise: number
          unit_price_paise: number
          variant_id?: string | null
          variant_title?: string
          weight_grams?: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string | null
          quantity?: number
          restocked_quantity?: number
          sku?: string | null
          title?: string
          total_paise?: number
          unit_price_paise?: number
          variant_id?: string | null
          variant_title?: string
          weight_grams?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          billing_address: Json | null
          cancel_reason: string | null
          created_at: string
          currency: string
          customer_id: string | null
          discount_code: string | null
          discount_paise: number
          email: string
          fulfillment_status: string
          id: string
          notes: string
          order_number: string
          order_status: string
          payment_status: string
          phone: string | null
          placed_at: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_signature: string | null
          refunded_paise: number
          shipping_address: Json
          shipping_paise: number
          shopify_id: number | null
          source: string
          subtotal_paise: number
          tax_paise: number
          total_paise: number
          updated_at: string
          view_token: string
        }
        Insert: {
          billing_address?: Json | null
          cancel_reason?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          discount_code?: string | null
          discount_paise?: number
          email: string
          fulfillment_status?: string
          id?: string
          notes?: string
          order_number?: string
          order_status?: string
          payment_status?: string
          phone?: string | null
          placed_at?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          refunded_paise?: number
          shipping_address?: Json
          shipping_paise?: number
          shopify_id?: number | null
          source?: string
          subtotal_paise?: number
          tax_paise?: number
          total_paise?: number
          updated_at?: string
          view_token?: string
        }
        Update: {
          billing_address?: Json | null
          cancel_reason?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          discount_code?: string | null
          discount_paise?: number
          email?: string
          fulfillment_status?: string
          id?: string
          notes?: string
          order_number?: string
          order_status?: string
          payment_status?: string
          phone?: string | null
          placed_at?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          refunded_paise?: number
          shipping_address?: Json
          shipping_paise?: number
          shopify_id?: number | null
          source?: string
          subtotal_paise?: number
          tax_paise?: number
          total_paise?: number
          updated_at?: string
          view_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt: string
          created_at: string
          id: string
          position: number
          product_id: string
          url: string
        }
        Insert: {
          alt?: string
          created_at?: string
          id?: string
          position?: number
          product_id: string
          url: string
        }
        Update: {
          alt?: string
          created_at?: string
          id?: string
          position?: number
          product_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          barcode: string | null
          breadth_cm: number
          compare_at_paise: number | null
          cost_paise: number | null
          created_at: string
          height_cm: number
          id: string
          inventory_quantity: number
          length_cm: number
          position: number
          price_paise: number
          product_id: string
          sku: string | null
          title: string
          updated_at: string
          weight_grams: number
        }
        Insert: {
          barcode?: string | null
          breadth_cm?: number
          compare_at_paise?: number | null
          cost_paise?: number | null
          created_at?: string
          height_cm?: number
          id?: string
          inventory_quantity?: number
          length_cm?: number
          position?: number
          price_paise: number
          product_id: string
          sku?: string | null
          title?: string
          updated_at?: string
          weight_grams?: number
        }
        Update: {
          barcode?: string | null
          breadth_cm?: number
          compare_at_paise?: number | null
          cost_paise?: number | null
          created_at?: string
          height_cm?: number
          id?: string
          inventory_quantity?: number
          length_cm?: number
          position?: number
          price_paise?: number
          product_id?: string
          sku?: string | null
          title?: string
          updated_at?: string
          weight_grams?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          description_md: string
          handle: string
          hsn_code: string
          id: string
          product_type: string
          requires_shipping: boolean
          seo_description: string | null
          seo_title: string | null
          shopify_id: number | null
          status: string
          subtitle: string
          tags: string[]
          title: string
          updated_at: string
          vendor: string
        }
        Insert: {
          created_at?: string
          description_md?: string
          handle: string
          hsn_code?: string
          id?: string
          product_type?: string
          requires_shipping?: boolean
          seo_description?: string | null
          seo_title?: string | null
          shopify_id?: number | null
          status?: string
          subtitle?: string
          tags?: string[]
          title: string
          updated_at?: string
          vendor?: string
        }
        Update: {
          created_at?: string
          description_md?: string
          handle?: string
          hsn_code?: string
          id?: string
          product_type?: string
          requires_shipping?: boolean
          seo_description?: string | null
          seo_title?: string | null
          shopify_id?: number | null
          status?: string
          subtitle?: string
          tags?: string[]
          title?: string
          updated_at?: string
          vendor?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          count: number
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          window_start?: string
        }
        Update: {
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      refunds: {
        Row: {
          amount_paise: number
          checkout_id: string | null
          created_at: string
          created_by: string
          error: string | null
          id: string
          kind: string
          order_id: string | null
          processed_at: string | null
          razorpay_payment_id: string
          razorpay_refund_id: string | null
          reason: string
          restock: Json
          status: string
          updated_at: string
        }
        Insert: {
          amount_paise: number
          checkout_id?: string | null
          created_at?: string
          created_by?: string
          error?: string | null
          id?: string
          kind: string
          order_id?: string | null
          processed_at?: string | null
          razorpay_payment_id: string
          razorpay_refund_id?: string | null
          reason?: string
          restock?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          amount_paise?: number
          checkout_id?: string | null
          created_at?: string
          created_by?: string
          error?: string | null
          id?: string
          kind?: string
          order_id?: string | null
          processed_at?: string | null
          razorpay_payment_id?: string
          razorpay_refund_id?: string | null
          reason?: string
          restock?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_checkout_id_fkey"
            columns: ["checkout_id"]
            isOneToOne: false
            referencedRelation: "checkouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          is_public: boolean
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          is_public?: boolean
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          is_public?: boolean
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      shipments: {
        Row: {
          awb_code: string | null
          cancelled_at: string | null
          courier_name: string | null
          created_at: string
          delivered_at: string | null
          expected_delivery_date: string | null
          id: string
          label_url: string | null
          last_event_at: string | null
          last_status_at: string | null
          manifest_url: string | null
          order_id: string
          pickup_scheduled_at: string | null
          pickup_token_number: string | null
          provider: string
          raw: Json
          shipped_at: string | null
          shiprocket_order_id: string | null
          shiprocket_shipment_id: string | null
          shiprocket_status: string | null
          status: string
          status_detail: string
          tracking_url: string | null
          updated_at: string
        }
        Insert: {
          awb_code?: string | null
          cancelled_at?: string | null
          courier_name?: string | null
          created_at?: string
          delivered_at?: string | null
          expected_delivery_date?: string | null
          id?: string
          label_url?: string | null
          last_event_at?: string | null
          last_status_at?: string | null
          manifest_url?: string | null
          order_id: string
          pickup_scheduled_at?: string | null
          pickup_token_number?: string | null
          provider?: string
          raw?: Json
          shipped_at?: string | null
          shiprocket_order_id?: string | null
          shiprocket_shipment_id?: string | null
          shiprocket_status?: string | null
          status?: string
          status_detail?: string
          tracking_url?: string | null
          updated_at?: string
        }
        Update: {
          awb_code?: string | null
          cancelled_at?: string | null
          courier_name?: string | null
          created_at?: string
          delivered_at?: string | null
          expected_delivery_date?: string | null
          id?: string
          label_url?: string | null
          last_event_at?: string | null
          last_status_at?: string | null
          manifest_url?: string | null
          order_id?: string
          pickup_scheduled_at?: string | null
          pickup_token_number?: string | null
          provider?: string
          raw?: Json
          shipped_at?: string | null
          shiprocket_order_id?: string | null
          shiprocket_shipment_id?: string | null
          shiprocket_status?: string | null
          status?: string
          status_detail?: string
          tracking_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_outbox: {
        Row: {
          attempts: number
          created_at: string
          id: string
          last_attempt_at: string | null
          last_error: string | null
          last_response_status: number | null
          next_attempt_at: string
          payload: Json
          sent_at: string | null
          status: string
          topic: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          last_response_status?: number | null
          next_attempt_at?: string
          payload: Json
          sent_at?: string | null
          status?: string
          topic: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          last_response_status?: number | null
          next_attempt_at?: string
          payload?: Json
          sent_at?: string | null
          status?: string
          topic?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_inventory: {
        Args: {
          p_actor?: string
          p_delta: number
          p_note?: string
          p_reason: string
          p_variant_id: string
        }
        Returns: number
      }
      admin_sales_summary: { Args: never; Returns: Json }
      assign_shipment_awb: {
        Args: {
          p_actor?: string
          p_awb_code: string
          p_courier_name: string
          p_label_url?: string
          p_raw?: Json
          p_shipment_id: string
          p_tracking_url?: string
        }
        Returns: Json
      }
      begin_refund: {
        Args: {
          p_actor?: string
          p_amount_paise: number
          p_cancel?: boolean
          p_order_id: string
          p_reason?: string
          p_restock?: Json
        }
        Returns: Json
      }
      cancel_order: {
        Args: {
          p_actor?: string
          p_order_id: string
          p_reason?: string
          p_restock?: Json
        }
        Returns: Json
      }
      cancel_shipment: {
        Args: { p_actor?: string; p_reason?: string; p_shipment_id: string }
        Returns: Json
      }
      claim_abandoned_checkouts: {
        Args: {
          p_after_minutes?: number
          p_limit?: number
          p_within_hours?: number
        }
        Returns: {
          created_at: string
          discount_code: string
          email: string
          id: string
          line_items: Json
          shipping_address: Json
          total_paise: number
        }[]
      }
      claim_outbox: {
        Args: { p_lease_seconds?: number; p_limit?: number; p_topics: string[] }
        Returns: {
          attempts: number
          created_at: string
          id: string
          last_attempt_at: string | null
          last_error: string | null
          last_response_status: number | null
          next_attempt_at: string
          payload: Json
          sent_at: string | null
          status: string
          topic: string
        }[]
        SetofOptions: {
          from: "*"
          to: "webhook_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_refund: {
        Args: {
          p_actor?: string
          p_razorpay_refund_id: string
          p_refund_id: string
        }
        Returns: Json
      }
      create_order_from_checkout: {
        Args: {
          p_checkout_id: string
          p_razorpay_order_id: string
          p_razorpay_payment_id: string
          p_razorpay_signature: string
          p_source?: string
        }
        Returns: Json
      }
      create_shipment: {
        Args: {
          p_actor?: string
          p_order_id: string
          p_raw?: Json
          p_shiprocket_order_id: string
          p_shiprocket_shipment_id: string
        }
        Returns: Json
      }
      fail_refund: {
        Args: { p_actor?: string; p_error: string; p_refund_id: string }
        Returns: undefined
      }
      finish_outbox: {
        Args: {
          p_error?: string
          p_id: string
          p_max_attempts?: number
          p_outcome: string
          p_response_status?: number
        }
        Returns: string
      }
      import_shopify_order: {
        Args: { p_items: Json; p_order: Json }
        Returns: Json
      }
      merge_setting: {
        Args: { p_actor: string; p_key: string; p_patch: Json }
        Returns: Json
      }
      rate_limit_hit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      recompute_customer_totals: {
        Args: { p_emails: string[] }
        Returns: number
      }
      record_out_of_stock_payment: {
        Args: {
          p_actor?: string
          p_checkout_id: string
          p_razorpay_payment_id: string
        }
        Returns: Json
      }
      record_shipment_pickup: {
        Args: {
          p_actor?: string
          p_pickup_token: string
          p_raw?: Json
          p_scheduled_at?: string
          p_shipment_id: string
        }
        Returns: Json
      }
      remove_admin_user: {
        Args: { p_actor: string; p_admin_id: string }
        Returns: Json
      }
      retry_outbox: {
        Args: { p_actor: string; p_id: string }
        Returns: undefined
      }
      set_admin_access: {
        Args: { p_actor: string; p_admin_id: string; p_revoke: boolean }
        Returns: Json
      }
      set_admin_role: {
        Args: { p_actor: string; p_admin_id: string; p_role: string }
        Returns: undefined
      }
      set_shiprocket_token: {
        Args: { p_expires_at: string; p_token: string }
        Returns: undefined
      }
      store_analytics: { Args: { p_days?: number }; Returns: Json }
      update_shipment_status: {
        Args: {
          p_actor?: string
          p_awb_code?: string
          p_detail?: string
          p_occurred_at?: string
          p_raw?: Json
          p_remote_status?: string
          p_shipment_id?: string
          p_status: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
