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
  commerce: {
    Tables: {
      customers: {
        Row: {
          created_at: string
          creation_source: Database["commerce"]["Enums"]["customer_creation_source"]
          email: string | null
          family_name: string | null
          given_name: string | null
          id: string
          metadata: Json
          org_id: string
          phone: string | null
          preferred_locale: string | null
          updated_at: string
          user_id: string | null
          version: number
        }
        Insert: {
          created_at?: string
          creation_source?: Database["commerce"]["Enums"]["customer_creation_source"]
          email?: string | null
          family_name?: string | null
          given_name?: string | null
          id?: string
          metadata?: Json
          org_id: string
          phone?: string | null
          preferred_locale?: string | null
          updated_at?: string
          user_id?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          creation_source?: Database["commerce"]["Enums"]["customer_creation_source"]
          email?: string | null
          family_name?: string | null
          given_name?: string | null
          id?: string
          metadata?: Json
          org_id?: string
          phone?: string | null
          preferred_locale?: string | null
          updated_at?: string
          user_id?: string | null
          version?: number
        }
        Relationships: []
      }
      fulfillment_delivery_details: {
        Row: {
          accepted_at: string | null
          address: Json
          cancel_reason: string | null
          canceled_at: string | null
          courier_assigned_at: string | null
          delivered_at: string | null
          delivery_provider: Database["commerce"]["Enums"]["delivery_provider"]
          external_courier_ref: string | null
          fulfillment_id: string
          note: string | null
          picked_up_at: string | null
          placed_at: string | null
          recipient_name: string
          recipient_phone: string
          rejected_at: string | null
          scheduled_for: string | null
        }
        Insert: {
          accepted_at?: string | null
          address: Json
          cancel_reason?: string | null
          canceled_at?: string | null
          courier_assigned_at?: string | null
          delivered_at?: string | null
          delivery_provider?: Database["commerce"]["Enums"]["delivery_provider"]
          external_courier_ref?: string | null
          fulfillment_id: string
          note?: string | null
          picked_up_at?: string | null
          placed_at?: string | null
          recipient_name: string
          recipient_phone: string
          rejected_at?: string | null
          scheduled_for?: string | null
        }
        Update: {
          accepted_at?: string | null
          address?: Json
          cancel_reason?: string | null
          canceled_at?: string | null
          courier_assigned_at?: string | null
          delivered_at?: string | null
          delivery_provider?: Database["commerce"]["Enums"]["delivery_provider"]
          external_courier_ref?: string | null
          fulfillment_id?: string
          note?: string | null
          picked_up_at?: string | null
          placed_at?: string | null
          recipient_name?: string
          recipient_phone?: string
          rejected_at?: string | null
          scheduled_for?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fulfillment_delivery_details_fulfillment_id_fkey"
            columns: ["fulfillment_id"]
            isOneToOne: true
            referencedRelation: "fulfillments"
            referencedColumns: ["id"]
          },
        ]
      }
      fulfillment_dine_in_details: {
        Row: {
          closed_at: string | null
          course_number: number | null
          fulfillment_id: string
          guest_session_id: string
          party_size: number | null
          table_label: string
          table_session_id: string
        }
        Insert: {
          closed_at?: string | null
          course_number?: number | null
          fulfillment_id: string
          guest_session_id: string
          party_size?: number | null
          table_label: string
          table_session_id: string
        }
        Update: {
          closed_at?: string | null
          course_number?: number | null
          fulfillment_id?: string
          guest_session_id?: string
          party_size?: number | null
          table_label?: string
          table_session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fulfillment_dine_in_details_fulfillment_id_fkey"
            columns: ["fulfillment_id"]
            isOneToOne: true
            referencedRelation: "fulfillments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_dine_in_details_guest_session_id_fkey"
            columns: ["guest_session_id"]
            isOneToOne: false
            referencedRelation: "guest_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_dine_in_details_table_session_id_fkey"
            columns: ["table_session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      fulfillment_line_item_entries: {
        Row: {
          fulfillment_id: string
          line_item_uid: string
          quantity: number
        }
        Insert: {
          fulfillment_id: string
          line_item_uid: string
          quantity?: number
        }
        Update: {
          fulfillment_id?: string
          line_item_uid?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "fulfillment_line_item_entries_fulfillment_id_fkey"
            columns: ["fulfillment_id"]
            isOneToOne: false
            referencedRelation: "fulfillments"
            referencedColumns: ["id"]
          },
        ]
      }
      fulfillment_pickup_details: {
        Row: {
          accepted_at: string | null
          cancel_reason: string | null
          canceled_at: string | null
          expired_at: string | null
          fulfillment_id: string
          is_curbside: boolean
          note: string | null
          picked_up_at: string | null
          pickup_at: string | null
          pickup_window_minutes: number | null
          placed_at: string | null
          prep_time_minutes: number | null
          ready_at: string | null
          recipient_name: string | null
          recipient_phone: string | null
          rejected_at: string | null
          schedule_type: Database["commerce"]["Enums"]["fulfillment_schedule_type"]
        }
        Insert: {
          accepted_at?: string | null
          cancel_reason?: string | null
          canceled_at?: string | null
          expired_at?: string | null
          fulfillment_id: string
          is_curbside?: boolean
          note?: string | null
          picked_up_at?: string | null
          pickup_at?: string | null
          pickup_window_minutes?: number | null
          placed_at?: string | null
          prep_time_minutes?: number | null
          ready_at?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          rejected_at?: string | null
          schedule_type?: Database["commerce"]["Enums"]["fulfillment_schedule_type"]
        }
        Update: {
          accepted_at?: string | null
          cancel_reason?: string | null
          canceled_at?: string | null
          expired_at?: string | null
          fulfillment_id?: string
          is_curbside?: boolean
          note?: string | null
          picked_up_at?: string | null
          pickup_at?: string | null
          pickup_window_minutes?: number | null
          placed_at?: string | null
          prep_time_minutes?: number | null
          ready_at?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          rejected_at?: string | null
          schedule_type?: Database["commerce"]["Enums"]["fulfillment_schedule_type"]
        }
        Relationships: [
          {
            foreignKeyName: "fulfillment_pickup_details_fulfillment_id_fkey"
            columns: ["fulfillment_id"]
            isOneToOne: true
            referencedRelation: "fulfillments"
            referencedColumns: ["id"]
          },
        ]
      }
      fulfillments: {
        Row: {
          created_at: string
          id: string
          line_item_application: Database["commerce"]["Enums"]["fulfillment_line_item_application"]
          metadata: Json
          order_id: string
          org_id: string
          state: Database["commerce"]["Enums"]["fulfillment_state"]
          type: Database["commerce"]["Enums"]["fulfillment_type"]
          uid: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          line_item_application?: Database["commerce"]["Enums"]["fulfillment_line_item_application"]
          metadata?: Json
          order_id: string
          org_id: string
          state?: Database["commerce"]["Enums"]["fulfillment_state"]
          type: Database["commerce"]["Enums"]["fulfillment_type"]
          uid: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          line_item_application?: Database["commerce"]["Enums"]["fulfillment_line_item_application"]
          metadata?: Json
          order_id?: string
          org_id?: string
          state?: Database["commerce"]["Enums"]["fulfillment_state"]
          type?: Database["commerce"]["Enums"]["fulfillment_type"]
          uid?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fulfillments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_sessions: {
        Row: {
          customer_id: string | null
          display_name: string | null
          id: string
          joined_at: string
          left_at: string | null
          metadata: Json
          org_id: string
          table_session_id: string
          user_id: string | null
        }
        Insert: {
          customer_id?: string | null
          display_name?: string | null
          id?: string
          joined_at?: string
          left_at?: string | null
          metadata?: Json
          org_id: string
          table_session_id: string
          user_id?: string | null
        }
        Update: {
          customer_id?: string | null
          display_name?: string | null
          id?: string
          joined_at?: string
          left_at?: string | null
          metadata?: Json
          org_id?: string
          table_session_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_sessions_table_session_id_fkey"
            columns: ["table_session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      line_item_applied_discounts: {
        Row: {
          applied_money_cents: number
          line_item_id: string
          order_discount_uid: string
          order_id: string
          org_id: string
        }
        Insert: {
          applied_money_cents?: number
          line_item_id: string
          order_discount_uid: string
          order_id: string
          org_id: string
        }
        Update: {
          applied_money_cents?: number
          line_item_id?: string
          order_discount_uid?: string
          order_id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "line_item_applied_discounts_line_item_id_fkey"
            columns: ["line_item_id"]
            isOneToOne: false
            referencedRelation: "order_line_items"
            referencedColumns: ["id"]
          },
        ]
      }
      line_item_applied_taxes: {
        Row: {
          applied_money_cents: number
          line_item_id: string
          order_id: string
          order_tax_uid: string
          org_id: string
        }
        Insert: {
          applied_money_cents?: number
          line_item_id: string
          order_id: string
          order_tax_uid: string
          org_id: string
        }
        Update: {
          applied_money_cents?: number
          line_item_id?: string
          order_id?: string
          order_tax_uid?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "line_item_applied_taxes_line_item_id_fkey"
            columns: ["line_item_id"]
            isOneToOne: false
            referencedRelation: "order_line_items"
            referencedColumns: ["id"]
          },
        ]
      }
      order_discounts: {
        Row: {
          amount_cents: number | null
          catalog_discount_id: string | null
          created_at: string
          id: string
          metadata: Json
          name: string
          order_id: string
          org_id: string
          percentage: number | null
          scope: Database["commerce"]["Enums"]["applied_scope"]
          type: Database["commerce"]["Enums"]["order_discount_type"]
          uid: string
          updated_at: string
        }
        Insert: {
          amount_cents?: number | null
          catalog_discount_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          order_id: string
          org_id: string
          percentage?: number | null
          scope: Database["commerce"]["Enums"]["applied_scope"]
          type: Database["commerce"]["Enums"]["order_discount_type"]
          uid: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number | null
          catalog_discount_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          order_id?: string
          org_id?: string
          percentage?: number | null
          scope?: Database["commerce"]["Enums"]["applied_scope"]
          type?: Database["commerce"]["Enums"]["order_discount_type"]
          uid?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_discounts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_events: {
        Row: {
          actor_id: string | null
          actor_type: Database["commerce"]["Enums"]["order_event_actor"]
          after: Json | null
          before: Json | null
          event_type: string
          id: string
          occurred_at: string
          order_id: string
          org_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_type: Database["commerce"]["Enums"]["order_event_actor"]
          after?: Json | null
          before?: Json | null
          event_type: string
          id?: string
          occurred_at?: string
          order_id: string
          org_id: string
        }
        Update: {
          actor_id?: string | null
          actor_type?: Database["commerce"]["Enums"]["order_event_actor"]
          after?: Json | null
          before?: Json | null
          event_type?: string
          id?: string
          occurred_at?: string
          order_id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_line_item_modifiers: {
        Row: {
          base_price_cents_delta: number
          catalog_modifier_id: string | null
          catalog_modifier_list_id: string | null
          catalog_version: number | null
          created_at: string
          id: string
          line_item_id: string
          metadata: Json
          name: string
          order_id: string
          ordinal: number
          org_id: string
          quantity: number
          text_value: string | null
          uid: string
          updated_at: string
        }
        Insert: {
          base_price_cents_delta?: number
          catalog_modifier_id?: string | null
          catalog_modifier_list_id?: string | null
          catalog_version?: number | null
          created_at?: string
          id?: string
          line_item_id: string
          metadata?: Json
          name: string
          order_id: string
          ordinal?: number
          org_id: string
          quantity?: number
          text_value?: string | null
          uid: string
          updated_at?: string
        }
        Update: {
          base_price_cents_delta?: number
          catalog_modifier_id?: string | null
          catalog_modifier_list_id?: string | null
          catalog_version?: number | null
          created_at?: string
          id?: string
          line_item_id?: string
          metadata?: Json
          name?: string
          order_id?: string
          ordinal?: number
          org_id?: string
          quantity?: number
          text_value?: string | null
          uid?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_line_item_modifiers_catalog_modifier_list_id_fkey"
            columns: ["catalog_modifier_list_id"]
            isOneToOne: false
            referencedRelation: "modifier_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_line_item_modifiers_line_item_id_fkey"
            columns: ["line_item_id"]
            isOneToOne: false
            referencedRelation: "order_line_items"
            referencedColumns: ["id"]
          },
        ]
      }
      order_line_items: {
        Row: {
          base_price_cents: number
          catalog_item_id: string | null
          catalog_variation_id: string | null
          catalog_version: number | null
          created_at: string
          id: string
          metadata: Json
          name: string
          note: string | null
          order_id: string
          org_id: string
          pricing_blocklists: Json
          quantity: number
          quantity_unit: string | null
          total_price_cents: number
          uid: string
          updated_at: string
          variation_name: string | null
        }
        Insert: {
          base_price_cents?: number
          catalog_item_id?: string | null
          catalog_variation_id?: string | null
          catalog_version?: number | null
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          note?: string | null
          order_id: string
          org_id: string
          pricing_blocklists?: Json
          quantity?: number
          quantity_unit?: string | null
          total_price_cents?: number
          uid: string
          updated_at?: string
          variation_name?: string | null
        }
        Update: {
          base_price_cents?: number
          catalog_item_id?: string | null
          catalog_variation_id?: string | null
          catalog_version?: number | null
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          note?: string | null
          order_id?: string
          org_id?: string
          pricing_blocklists?: Json
          quantity?: number
          quantity_unit?: string | null
          total_price_cents?: number
          uid?: string
          updated_at?: string
          variation_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_line_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_payments: {
        Row: {
          amount_cents: number
          authorized_at: string | null
          autocomplete: boolean
          canceled_at: string | null
          collected_by_user_id: string | null
          completed_at: string | null
          created_at: string
          currency: string
          id: string
          krafta_pay_payment_intent_id: string | null
          metadata: Json
          order_id: string
          org_id: string
          source_details: Json
          source_type: Database["commerce"]["Enums"]["order_payment_source"]
          status: Database["commerce"]["Enums"]["order_payment_status"]
          tip_cents: number
          total_cents: number
          updated_at: string
          version: number
        }
        Insert: {
          amount_cents: number
          authorized_at?: string | null
          autocomplete?: boolean
          canceled_at?: string | null
          collected_by_user_id?: string | null
          completed_at?: string | null
          created_at?: string
          currency: string
          id?: string
          krafta_pay_payment_intent_id?: string | null
          metadata?: Json
          order_id: string
          org_id: string
          source_details?: Json
          source_type: Database["commerce"]["Enums"]["order_payment_source"]
          status?: Database["commerce"]["Enums"]["order_payment_status"]
          tip_cents?: number
          total_cents: number
          updated_at?: string
          version?: number
        }
        Update: {
          amount_cents?: number
          authorized_at?: string | null
          autocomplete?: boolean
          canceled_at?: string | null
          collected_by_user_id?: string | null
          completed_at?: string | null
          created_at?: string
          currency?: string
          id?: string
          krafta_pay_payment_intent_id?: string | null
          metadata?: Json
          order_id?: string
          org_id?: string
          source_details?: Json
          source_type?: Database["commerce"]["Enums"]["order_payment_source"]
          status?: Database["commerce"]["Enums"]["order_payment_status"]
          tip_cents?: number
          total_cents?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_refunds: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          metadata: Json
          order_id: string
          org_id: string
          payment_id: string
          reason: string | null
          refunded_by_user_id: string | null
          status: Database["commerce"]["Enums"]["order_refund_status"]
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          metadata?: Json
          order_id: string
          org_id: string
          payment_id: string
          reason?: string | null
          refunded_by_user_id?: string | null
          status?: Database["commerce"]["Enums"]["order_refund_status"]
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          metadata?: Json
          order_id?: string
          org_id?: string
          payment_id?: string
          reason?: string | null
          refunded_by_user_id?: string | null
          status?: Database["commerce"]["Enums"]["order_refund_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "order_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      order_taxes: {
        Row: {
          amount_cents: number | null
          applied_money_cents: number
          auto_applied: boolean
          catalog_tax_id: string | null
          created_at: string
          id: string
          inclusion_type: Database["public"]["Enums"]["tax_inclusion_type"]
          kind: Database["public"]["Enums"]["tax_kind"]
          metadata: Json
          name: string
          order_id: string
          org_id: string
          percentage: number | null
          scope: Database["commerce"]["Enums"]["applied_scope"]
          type: Database["commerce"]["Enums"]["order_tax_type"]
          uid: string
          updated_at: string
        }
        Insert: {
          amount_cents?: number | null
          applied_money_cents?: number
          auto_applied?: boolean
          catalog_tax_id?: string | null
          created_at?: string
          id?: string
          inclusion_type?: Database["public"]["Enums"]["tax_inclusion_type"]
          kind?: Database["public"]["Enums"]["tax_kind"]
          metadata?: Json
          name: string
          order_id: string
          org_id: string
          percentage?: number | null
          scope: Database["commerce"]["Enums"]["applied_scope"]
          type: Database["commerce"]["Enums"]["order_tax_type"]
          uid: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number | null
          applied_money_cents?: number
          auto_applied?: boolean
          catalog_tax_id?: string | null
          created_at?: string
          id?: string
          inclusion_type?: Database["public"]["Enums"]["tax_inclusion_type"]
          kind?: Database["public"]["Enums"]["tax_kind"]
          metadata?: Json
          name?: string
          order_id?: string
          org_id?: string
          percentage?: number | null
          scope?: Database["commerce"]["Enums"]["applied_scope"]
          type?: Database["commerce"]["Enums"]["order_tax_type"]
          uid?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_taxes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          catalog_id: string
          closed_at: string | null
          created_at: string
          currency: string
          customer_id: string | null
          guest_session_id: string | null
          id: string
          metadata: Json
          org_id: string
          pricing_options: Json
          reference_id: string | null
          source: Database["commerce"]["Enums"]["order_source"]
          state: Database["commerce"]["Enums"]["order_state"]
          table_session_id: string | null
          ticket_name: string | null
          timezone: string
          updated_at: string
          venue_id: string
          version: number
        }
        Insert: {
          catalog_id: string
          closed_at?: string | null
          created_at?: string
          currency: string
          customer_id?: string | null
          guest_session_id?: string | null
          id?: string
          metadata?: Json
          org_id: string
          pricing_options?: Json
          reference_id?: string | null
          source?: Database["commerce"]["Enums"]["order_source"]
          state?: Database["commerce"]["Enums"]["order_state"]
          table_session_id?: string | null
          ticket_name?: string | null
          timezone: string
          updated_at?: string
          venue_id: string
          version?: number
        }
        Update: {
          catalog_id?: string
          closed_at?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          guest_session_id?: string | null
          id?: string
          metadata?: Json
          org_id?: string
          pricing_options?: Json
          reference_id?: string | null
          source?: Database["commerce"]["Enums"]["order_source"]
          state?: Database["commerce"]["Enums"]["order_state"]
          table_session_id?: string | null
          ticket_name?: string | null
          timezone?: string
          updated_at?: string
          venue_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_guest_session_id_fkey"
            columns: ["guest_session_id"]
            isOneToOne: false
            referencedRelation: "guest_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_session_id_fkey"
            columns: ["table_session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      processed_actions: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          result: Json
        }
        Insert: {
          created_at?: string
          customer_id: string
          id: string
          result: Json
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          result?: Json
        }
        Relationships: [
          {
            foreignKeyName: "processed_actions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      table_sessions: {
        Row: {
          closed_at: string | null
          id: string
          metadata: Json
          opened_at: string
          org_id: string
          qr_code_id: string | null
          status: Database["commerce"]["Enums"]["table_session_status"]
          table_label: string
          venue_id: string
        }
        Insert: {
          closed_at?: string | null
          id?: string
          metadata?: Json
          opened_at?: string
          org_id: string
          qr_code_id?: string | null
          status?: Database["commerce"]["Enums"]["table_session_status"]
          table_label: string
          venue_id: string
        }
        Update: {
          closed_at?: string | null
          id?: string
          metadata?: Json
          opened_at?: string
          org_id?: string
          qr_code_id?: string | null
          status?: Database["commerce"]["Enums"]["table_session_status"]
          table_label?: string
          venue_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      order_belongs_to_current_user: {
        Args: { _order_id: string }
        Returns: boolean
      }
      order_org_id: { Args: { _order_id: string }; Returns: string }
    }
    Enums: {
      applied_scope: "order" | "line_item"
      customer_creation_source:
        | "instant_profile"
        | "dashboard"
        | "guest_checkout"
        | "tg_login"
      delivery_provider: "merchant" | "yandex" | "glovo" | "other"
      fulfillment_line_item_application: "all" | "entry_list"
      fulfillment_schedule_type: "asap" | "scheduled"
      fulfillment_state:
        | "proposed"
        | "reserved"
        | "prepared"
        | "completed"
        | "canceled"
        | "failed"
      fulfillment_type: "dine_in" | "pickup" | "delivery" | "digital"
      order_discount_type: "percentage" | "fixed_amount"
      order_event_actor:
        | "customer"
        | "merchant_staff"
        | "system"
        | "krafta_admin"
      order_payment_source: "cash" | "external_card_recorded" | "krafta_pay"
      order_payment_status:
        | "pending"
        | "approved"
        | "completed"
        | "canceled"
        | "failed"
      order_refund_status: "pending" | "completed" | "failed"
      order_source: "web" | "tma" | "qr_scan" | "dashboard"
      order_state: "draft" | "open" | "completed" | "canceled"
      order_tax_type: "percentage" | "fixed"
      table_session_status: "open" | "closed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  payments: {
    Tables: {
      api_keys: {
        Row: {
          created_at: string
          environment: string
          hashed_key: string
          id: string
          last4: string
          metadata: Json
          name: string
          org_id: string
          prefix: string
          revoked_at: string | null
        }
        Insert: {
          created_at?: string
          environment?: string
          hashed_key: string
          id?: string
          last4: string
          metadata?: Json
          name: string
          org_id: string
          prefix: string
          revoked_at?: string | null
        }
        Update: {
          created_at?: string
          environment?: string
          hashed_key?: string
          id?: string
          last4?: string
          metadata?: Json
          name?: string
          org_id?: string
          prefix?: string
          revoked_at?: string | null
        }
        Relationships: []
      }
      checkout_sessions: {
        Row: {
          cancel_url: string | null
          created_at: string
          customer_id: string | null
          id: string
          metadata: Json
          org_id: string
          payment_intent_id: string
          public_token: string
          return_url: string | null
          selected_attempt_id: string | null
          selected_provider_id: string | null
          status: string
          success_url: string | null
          updated_at: string
        }
        Insert: {
          cancel_url?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          metadata?: Json
          org_id: string
          payment_intent_id: string
          public_token: string
          return_url?: string | null
          selected_attempt_id?: string | null
          selected_provider_id?: string | null
          status?: string
          success_url?: string | null
          updated_at?: string
        }
        Update: {
          cancel_url?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          metadata?: Json
          org_id?: string
          payment_intent_id?: string
          public_token?: string
          return_url?: string | null
          selected_attempt_id?: string | null
          selected_provider_id?: string | null
          status?: string
          success_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkout_sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_sessions_payment_intent_id_fkey"
            columns: ["payment_intent_id"]
            isOneToOne: false
            referencedRelation: "payment_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_sessions_selected_attempt_id_fkey"
            columns: ["selected_attempt_id"]
            isOneToOne: false
            referencedRelation: "payment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_sessions_selected_provider_id_fkey"
            columns: ["selected_provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_portal_events: {
        Row: {
          created_at: string
          customer_id: string
          customer_portal_session_id: string
          event_type: string
          id: string
          org_id: string
          payload: Json
          subscription_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          customer_portal_session_id: string
          event_type: string
          id?: string
          org_id: string
          payload?: Json
          subscription_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          customer_portal_session_id?: string
          event_type?: string
          id?: string
          org_id?: string
          payload?: Json
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_portal_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_portal_events_customer_portal_session_id_fkey"
            columns: ["customer_portal_session_id"]
            isOneToOne: false
            referencedRelation: "customer_portal_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_portal_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_portal_sessions: {
        Row: {
          created_at: string
          customer_id: string
          expires_at: string
          flow_data: Json
          flow_type: string | null
          id: string
          metadata: Json
          org_id: string
          return_url: string | null
          status: string
          token_hash: string
          updated_at: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          expires_at: string
          flow_data?: Json
          flow_type?: string | null
          id?: string
          metadata?: Json
          org_id: string
          return_url?: string | null
          status?: string
          token_hash: string
          updated_at?: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          expires_at?: string
          flow_data?: Json
          flow_type?: string | null
          id?: string
          metadata?: Json
          org_id?: string
          return_url?: string | null
          status?: string
          token_hash?: string
          updated_at?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_portal_sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          customer_org_id: string | null
          customer_user_ref: string | null
          email: string | null
          id: string
          metadata: Json
          org_id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_org_id?: string | null
          customer_user_ref?: string | null
          email?: string | null
          id?: string
          metadata?: Json
          org_id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_org_id?: string | null
          customer_user_ref?: string | null
          email?: string | null
          id?: string
          metadata?: Json
          org_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount_due_minor: number
          attempt_count: number
          billing_period_end: string | null
          billing_period_start: string | null
          created_at: string
          currency: string
          due_at: string | null
          id: string
          metadata: Json
          org_id: string
          paid_at: string | null
          payment_intent_id: string | null
          status: string
          subscription_id: string
          updated_at: string
        }
        Insert: {
          amount_due_minor: number
          attempt_count?: number
          billing_period_end?: string | null
          billing_period_start?: string | null
          created_at?: string
          currency?: string
          due_at?: string | null
          id?: string
          metadata?: Json
          org_id: string
          paid_at?: string | null
          payment_intent_id?: string | null
          status?: string
          subscription_id: string
          updated_at?: string
        }
        Update: {
          amount_due_minor?: number
          attempt_count?: number
          billing_period_end?: string | null
          billing_period_start?: string | null
          created_at?: string
          currency?: string
          due_at?: string | null
          id?: string
          metadata?: Json
          org_id?: string
          paid_at?: string | null
          payment_intent_id?: string | null
          status?: string
          subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_payment_intent_id_fkey"
            columns: ["payment_intent_id"]
            isOneToOne: false
            referencedRelation: "payment_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      logs: {
        Row: {
          checkout_session_id: string | null
          created_at: string
          data: Json
          environment: string | null
          event: string
          id: number
          level: string
          org_id: string | null
          payment_attempt_id: string | null
          payment_intent_id: string | null
          provider_id: string | null
          public_token: string | null
          type: string
        }
        Insert: {
          checkout_session_id?: string | null
          created_at?: string
          data?: Json
          environment?: string | null
          event: string
          id?: number
          level?: string
          org_id?: string | null
          payment_attempt_id?: string | null
          payment_intent_id?: string | null
          provider_id?: string | null
          public_token?: string | null
          type: string
        }
        Update: {
          checkout_session_id?: string | null
          created_at?: string
          data?: Json
          environment?: string | null
          event?: string
          id?: number
          level?: string
          org_id?: string | null
          payment_attempt_id?: string | null
          payment_intent_id?: string | null
          provider_id?: string | null
          public_token?: string | null
          type?: string
        }
        Relationships: []
      }
      org_provider_account_secrets: {
        Row: {
          created_at: string
          credentials_encrypted: Json
          org_provider_account_id: string
          rotation_version: number
          updated_at: string
          webhook_secret_encrypted: Json | null
        }
        Insert: {
          created_at?: string
          credentials_encrypted: Json
          org_provider_account_id: string
          rotation_version?: number
          updated_at?: string
          webhook_secret_encrypted?: Json | null
        }
        Update: {
          created_at?: string
          credentials_encrypted?: Json
          org_provider_account_id?: string
          rotation_version?: number
          updated_at?: string
          webhook_secret_encrypted?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "org_provider_account_secrets_org_provider_account_id_fkey"
            columns: ["org_provider_account_id"]
            isOneToOne: true
            referencedRelation: "org_provider_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      org_provider_accounts: {
        Row: {
          created_at: string
          display_label: string | null
          environment: Database["payments"]["Enums"]["environment"]
          id: string
          metadata: Json
          org_id: string
          provider_id: string
          status: Database["payments"]["Enums"]["org_provider_account_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_label?: string | null
          environment: Database["payments"]["Enums"]["environment"]
          id?: string
          metadata?: Json
          org_id: string
          provider_id: string
          status: Database["payments"]["Enums"]["org_provider_account_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_label?: string | null
          environment?: Database["payments"]["Enums"]["environment"]
          id?: string
          metadata?: Json
          org_id?: string
          provider_id?: string
          status?: Database["payments"]["Enums"]["org_provider_account_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_provider_accounts_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      org_tax_profiles: {
        Row: {
          country_iso2: string
          created_at: string
          metadata: Json
          org_id: string
          schema_id: string
          tax_identity_type: string
          tax_identity_value: string
          updated_at: string
        }
        Insert: {
          country_iso2: string
          created_at?: string
          metadata?: Json
          org_id: string
          schema_id: string
          tax_identity_type: string
          tax_identity_value: string
          updated_at?: string
        }
        Update: {
          country_iso2?: string
          created_at?: string
          metadata?: Json
          org_id?: string
          schema_id?: string
          tax_identity_type?: string
          tax_identity_value?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_tax_profiles_schema_id_fkey"
            columns: ["schema_id"]
            isOneToOne: false
            referencedRelation: "tax_schemas"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_attempts: {
        Row: {
          checkout_url: string | null
          created_at: string
          id: string
          org_provider_account_id: string
          payment_intent_id: string
          payment_method_id: string | null
          provider_id: string
          provider_payment_id: string | null
          raw_init_response: Json
          status: string
          updated_at: string
        }
        Insert: {
          checkout_url?: string | null
          created_at?: string
          id?: string
          org_provider_account_id: string
          payment_intent_id: string
          payment_method_id?: string | null
          provider_id: string
          provider_payment_id?: string | null
          raw_init_response?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          checkout_url?: string | null
          created_at?: string
          id?: string
          org_provider_account_id?: string
          payment_intent_id?: string
          payment_method_id?: string | null
          provider_id?: string
          provider_payment_id?: string | null
          raw_init_response?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_attempts_org_provider_account_id_fkey"
            columns: ["org_provider_account_id"]
            isOneToOne: false
            referencedRelation: "org_provider_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_attempts_payment_intent_id_fkey"
            columns: ["payment_intent_id"]
            isOneToOne: false
            referencedRelation: "payment_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_attempts_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_attempts_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          environment: string
          event_type: string
          id: string
          org_id: string | null
          payload: Json
          processed_at: string | null
          processing_error: string | null
          provider_event_id: string | null
          provider_id: string
          provider_payment_id: string | null
          received_at: string
        }
        Insert: {
          environment?: string
          event_type: string
          id?: string
          org_id?: string | null
          payload: Json
          processed_at?: string | null
          processing_error?: string | null
          provider_event_id?: string | null
          provider_id: string
          provider_payment_id?: string | null
          received_at?: string
        }
        Update: {
          environment?: string
          event_type?: string
          id?: string
          org_id?: string | null
          payload?: Json
          processed_at?: string | null
          processing_error?: string | null
          provider_event_id?: string | null
          provider_id?: string
          provider_payment_id?: string | null
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_intents: {
        Row: {
          amount_minor: number
          client_secret: string
          created_at: string
          currency: string
          description: string | null
          id: string
          metadata: Json
          order_id: string | null
          org_id: string
          return_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_minor: number
          client_secret: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          metadata?: Json
          order_id?: string | null
          org_id: string
          return_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          client_secret?: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          metadata?: Json
          order_id?: string | null
          org_id?: string
          return_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          brand: string | null
          created_at: string
          customer_id: string
          exp_month: number | null
          exp_year: number | null
          id: string
          is_default: boolean
          last4: string | null
          metadata: Json
          org_provider_account_id: string
          provider_id: string
          provider_token: string
          status: string
          type: string
        }
        Insert: {
          brand?: string | null
          created_at?: string
          customer_id: string
          exp_month?: number | null
          exp_year?: number | null
          id?: string
          is_default?: boolean
          last4?: string | null
          metadata?: Json
          org_provider_account_id: string
          provider_id: string
          provider_token: string
          status?: string
          type?: string
        }
        Update: {
          brand?: string | null
          created_at?: string
          customer_id?: string
          exp_month?: number | null
          exp_year?: number | null
          id?: string
          is_default?: boolean
          last4?: string | null
          metadata?: Json
          org_provider_account_id?: string
          provider_id?: string
          provider_token?: string
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_methods_org_provider_account_id_fkey"
            columns: ["org_provider_account_id"]
            isOneToOne: false
            referencedRelation: "org_provider_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_methods_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_tax_classifications: {
        Row: {
          created_at: string
          metadata: Json
          package_code: string | null
          plan_id: string
          schema_id: string
          tax_code: string
          tax_code_entry_id: string | null
          updated_at: string
          vat_percent: number | null
        }
        Insert: {
          created_at?: string
          metadata?: Json
          package_code?: string | null
          plan_id: string
          schema_id: string
          tax_code: string
          tax_code_entry_id?: string | null
          updated_at?: string
          vat_percent?: number | null
        }
        Update: {
          created_at?: string
          metadata?: Json
          package_code?: string | null
          plan_id?: string
          schema_id?: string
          tax_code?: string
          tax_code_entry_id?: string | null
          updated_at?: string
          vat_percent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_tax_classifications_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: true
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_tax_classifications_schema_id_fkey"
            columns: ["schema_id"]
            isOneToOne: false
            referencedRelation: "tax_schemas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_tax_classifications_tax_code_entry_id_fkey"
            columns: ["tax_code_entry_id"]
            isOneToOne: false
            referencedRelation: "tax_code_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          amount_minor: number
          code: string
          created_at: string
          currency: string
          id: string
          interval: string
          interval_count: number
          is_active: boolean
          metadata: Json
          name: string
          org_id: string
          trial_days: number
          updated_at: string
        }
        Insert: {
          amount_minor: number
          code: string
          created_at?: string
          currency?: string
          id?: string
          interval?: string
          interval_count?: number
          is_active?: boolean
          metadata?: Json
          name: string
          org_id: string
          trial_days?: number
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          code?: string
          created_at?: string
          currency?: string
          id?: string
          interval?: string
          interval_count?: number
          is_active?: boolean
          metadata?: Json
          name?: string
          org_id?: string
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      providers: {
        Row: {
          capabilities: Json
          created_at: string
          display_name: string
          id: string
          is_active: boolean
        }
        Insert: {
          capabilities?: Json
          created_at?: string
          display_name: string
          id: string
          is_active?: boolean
        }
        Update: {
          capabilities?: Json
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
        }
        Relationships: []
      }
      subscription_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          payload: Json
          subscription_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          subscription_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          customer_id: string
          default_payment_method_id: string | null
          id: string
          metadata: Json
          org_id: string
          plan_id: string
          status: string
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          customer_id: string
          default_payment_method_id?: string | null
          id?: string
          metadata?: Json
          org_id: string
          plan_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          customer_id?: string
          default_payment_method_id?: string | null
          id?: string
          metadata?: Json
          org_id?: string
          plan_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_default_payment_method_id_fkey"
            columns: ["default_payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_code_entries: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          package_code: string
          registry_id: string
          tax_code: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          package_code: string
          registry_id: string
          tax_code: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          package_code?: string
          registry_id?: string
          tax_code?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_code_entries_registry_id_fkey"
            columns: ["registry_id"]
            isOneToOne: false
            referencedRelation: "tax_code_registries"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_code_registries: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          metadata: Json
          name: string
          org_id: string
          schema_id: string
          source: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          org_id: string
          schema_id: string
          source?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          org_id?: string
          schema_id?: string
          source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_code_registries_schema_id_fkey"
            columns: ["schema_id"]
            isOneToOne: false
            referencedRelation: "tax_schemas"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_schemas: {
        Row: {
          code: string
          country_iso2: string
          created_at: string
          id: string
          is_active: boolean
          metadata: Json
          name: string
          updated_at: string
          version: string
        }
        Insert: {
          code: string
          country_iso2: string
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          updated_at?: string
          version: string
        }
        Update: {
          code?: string
          country_iso2?: string
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      environment: "test" | "live"
      org_provider_account_status: "active" | "disabled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      auth_authorization_codes: {
        Row: {
          challenge_method: string
          client_id: string
          code_challenge: string
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          next_url: string | null
          redirect_uri: string
          scope: string
          user_id: string
        }
        Insert: {
          challenge_method?: string
          client_id: string
          code_challenge: string
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          next_url?: string | null
          redirect_uri: string
          scope?: string
          user_id: string
        }
        Update: {
          challenge_method?: string
          client_id?: string
          code_challenge?: string
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          next_url?: string | null
          redirect_uri?: string
          scope?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auth_authorization_codes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "auth_clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      auth_clients: {
        Row: {
          client_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          redirect_uris: string[]
          secret_hash: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          redirect_uris?: string[]
          secret_hash: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          redirect_uris?: string[]
          secret_hash?: string
          updated_at?: string
        }
        Relationships: []
      }
      catalog_categories: {
        Row: {
          catalog_id: string
          created_at: string
          current_source_hash: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          position: number
          slug: string
        }
        Insert: {
          catalog_id: string
          created_at?: string
          current_source_hash?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          position?: number
          slug: string
        }
        Update: {
          catalog_id?: string
          created_at?: string
          current_source_hash?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          position?: number
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_categories_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_category_translations: {
        Row: {
          category_id: string
          created_at: string
          description: string | null
          id: string
          is_ai_translated: boolean
          last_edited_by: string | null
          locale: string
          name: string
          source_hash: string | null
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_ai_translated?: boolean
          last_edited_by?: string | null
          locale: string
          name: string
          source_hash?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_ai_translated?: boolean
          last_edited_by?: string | null
          locale?: string
          name?: string
          source_hash?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_category_translations_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "catalog_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_translations: {
        Row: {
          catalog_id: string
          created_at: string
          description: string | null
          id: string
          is_ai_translated: boolean
          last_edited_by: string | null
          locale: string
          name: string
          source_hash: string | null
          updated_at: string
        }
        Insert: {
          catalog_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_ai_translated?: boolean
          last_edited_by?: string | null
          locale: string
          name: string
          source_hash?: string | null
          updated_at?: string
        }
        Update: {
          catalog_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_ai_translated?: boolean
          last_edited_by?: string | null
          locale?: string
          name?: string
          source_hash?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_translations_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_item_type_feature_requests: {
        Row: {
          catalog_id: string
          created_at: string
          id: string
          org_id: string
          product_type: Database["public"]["Enums"]["catalog_item_product_type"]
          requested_by_user_id: string
          source: string
        }
        Insert: {
          catalog_id: string
          created_at?: string
          id?: string
          org_id: string
          product_type: Database["public"]["Enums"]["catalog_item_product_type"]
          requested_by_user_id: string
          source?: string
        }
        Update: {
          catalog_id?: string
          created_at?: string
          id?: string
          org_id?: string
          product_type?: Database["public"]["Enums"]["catalog_item_product_type"]
          requested_by_user_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_item_type_feature_requests_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_locales: {
        Row: {
          catalog_id: string
          created_at: string
          display_name: string
          id: string
          is_default: boolean
          is_enabled: boolean
          locale: string
          sort_order: number
          text_direction: string
        }
        Insert: {
          catalog_id: string
          created_at?: string
          display_name: string
          id?: string
          is_default?: boolean
          is_enabled?: boolean
          locale: string
          sort_order?: number
          text_direction?: string
        }
        Update: {
          catalog_id?: string
          created_at?: string
          display_name?: string
          id?: string
          is_default?: boolean
          is_enabled?: boolean
          locale?: string
          sort_order?: number
          text_direction?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_locales_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_search_documents: {
        Row: {
          catalog_id: string | null
          created_at: string
          description: string | null
          embedding: unknown
          fts: unknown
          id: string
          locale: string | null
          org_id: string | null
          source_id: string
          source_table: string
          subtitle: string | null
          tags: string[] | null
          title: string | null
          updated_at: string
        }
        Insert: {
          catalog_id?: string | null
          created_at?: string
          description?: string | null
          embedding?: unknown
          fts?: unknown
          id?: string
          locale?: string | null
          org_id?: string | null
          source_id: string
          source_table: string
          subtitle?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          catalog_id?: string | null
          created_at?: string
          description?: string | null
          embedding?: unknown
          fts?: unknown
          id?: string
          locale?: string | null
          org_id?: string | null
          source_id?: string
          source_table?: string
          subtitle?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_search_documents_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_search_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_translation_quotas: {
        Row: {
          catalog_id: string
          daily_quota: number
          quota_reset_at: string
          total_tokens_used: number
          total_usd_estimated: number
          updated_at: string
          used_today: number
        }
        Insert: {
          catalog_id: string
          daily_quota?: number
          quota_reset_at?: string
          total_tokens_used?: number
          total_usd_estimated?: number
          updated_at?: string
          used_today?: number
        }
        Update: {
          catalog_id?: string
          daily_quota?: number
          quota_reset_at?: string
          total_tokens_used?: number
          total_usd_estimated?: number
          updated_at?: string
          used_today?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalog_translation_quotas_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: true
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogs: {
        Row: {
          created_at: string
          current_source_hash: string | null
          description: string | null
          id: string
          logo_path: string | null
          name: string
          org_id: string
          pricing_config: Json | null
          settings_behavior: Json
          settings_branding: Json
          settings_currency: Json
          settings_i18n: Json
          settings_layout: Json
          slug: string
          status: Database["public"]["Enums"]["catalog_status"]
          tags: string[] | null
        }
        Insert: {
          created_at?: string
          current_source_hash?: string | null
          description?: string | null
          id?: string
          logo_path?: string | null
          name: string
          org_id: string
          pricing_config?: Json | null
          settings_behavior?: Json
          settings_branding?: Json
          settings_currency?: Json
          settings_i18n?: Json
          settings_layout?: Json
          slug: string
          status?: Database["public"]["Enums"]["catalog_status"]
          tags?: string[] | null
        }
        Update: {
          created_at?: string
          current_source_hash?: string | null
          description?: string | null
          id?: string
          logo_path?: string | null
          name?: string
          org_id?: string
          pricing_config?: Json | null
          settings_behavior?: Json
          settings_branding?: Json
          settings_currency?: Json
          settings_i18n?: Json
          settings_layout?: Json
          slug?: string
          status?: Database["public"]["Enums"]["catalog_status"]
          tags?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "catalogs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      discounts: {
        Row: {
          amount_cents: number | null
          catalog_id: string
          created_at: string
          discount_type: Database["public"]["Enums"]["discount_type"]
          id: string
          is_active: boolean
          metadata: Json
          name: string
          percentage: number | null
          pin_required: boolean
          updated_at: string
          version: number
        }
        Insert: {
          amount_cents?: number | null
          catalog_id: string
          created_at?: string
          discount_type: Database["public"]["Enums"]["discount_type"]
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          percentage?: number | null
          pin_required?: boolean
          updated_at?: string
          version?: number
        }
        Update: {
          amount_cents?: number | null
          catalog_id?: string
          created_at?: string
          discount_type?: Database["public"]["Enums"]["discount_type"]
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          percentage?: number | null
          pin_required?: boolean
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "discounts_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
        ]
      }
      faq: {
        Row: {
          answer: string
          category: string | null
          created_at: string
          embedding: unknown
          fts: unknown
          id: string
          is_active: boolean
          question: string
          updated_at: string
        }
        Insert: {
          answer: string
          category?: string | null
          created_at?: string
          embedding?: unknown
          fts?: unknown
          id?: string
          is_active?: boolean
          question: string
          updated_at?: string
        }
        Update: {
          answer?: string
          category?: string | null
          created_at?: string
          embedding?: unknown
          fts?: unknown
          id?: string
          is_active?: boolean
          question?: string
          updated_at?: string
        }
        Relationships: []
      }
      item_media: {
        Row: {
          alt: string | null
          bucket: string
          bytes: number | null
          created_at: string
          duration_ms: number | null
          height: number | null
          id: string
          is_primary: boolean
          item_id: string
          kind: Database["public"]["Enums"]["item_media_kind"]
          mime_type: string | null
          position: number
          storage_path: string
          title: string | null
          width: number | null
        }
        Insert: {
          alt?: string | null
          bucket?: string
          bytes?: number | null
          created_at?: string
          duration_ms?: number | null
          height?: number | null
          id?: string
          is_primary?: boolean
          item_id: string
          kind: Database["public"]["Enums"]["item_media_kind"]
          mime_type?: string | null
          position?: number
          storage_path: string
          title?: string | null
          width?: number | null
        }
        Update: {
          alt?: string | null
          bucket?: string
          bytes?: number | null
          created_at?: string
          duration_ms?: number | null
          height?: number | null
          id?: string
          is_primary?: boolean
          item_id?: string
          kind?: Database["public"]["Enums"]["item_media_kind"]
          mime_type?: string | null
          position?: number
          storage_path?: string
          title?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "item_media_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      item_modifier_lists: {
        Row: {
          catalog_id: string
          created_at: string
          hidden_from_customer_override: boolean
          is_active: boolean
          item_id: string
          max_selected_override: number | null
          min_selected_override: number | null
          modifier_list_id: string
          ordinal: number
          updated_at: string
        }
        Insert: {
          catalog_id: string
          created_at?: string
          hidden_from_customer_override?: boolean
          is_active?: boolean
          item_id: string
          max_selected_override?: number | null
          min_selected_override?: number | null
          modifier_list_id: string
          ordinal?: number
          updated_at?: string
        }
        Update: {
          catalog_id?: string
          created_at?: string
          hidden_from_customer_override?: boolean
          is_active?: boolean
          item_id?: string
          max_selected_override?: number | null
          min_selected_override?: number | null
          modifier_list_id?: string
          ordinal?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_modifier_lists_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_modifier_lists_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_modifier_lists_modifier_list_id_fkey"
            columns: ["modifier_list_id"]
            isOneToOne: false
            referencedRelation: "modifier_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      item_translations: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_alt: string | null
          is_ai_translated: boolean
          item_id: string
          last_edited_by: string | null
          locale: string
          name: string
          source_hash: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_alt?: string | null
          is_ai_translated?: boolean
          item_id: string
          last_edited_by?: string | null
          locale: string
          name: string
          source_hash?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_alt?: string | null
          is_ai_translated?: boolean
          item_id?: string
          last_edited_by?: string | null
          locale?: string
          name?: string
          source_hash?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_translations_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      item_variation_translations: {
        Row: {
          created_at: string
          locale: string
          name: string
          updated_at: string
          variation_id: string
        }
        Insert: {
          created_at?: string
          locale: string
          name: string
          updated_at?: string
          variation_id: string
        }
        Update: {
          created_at?: string
          locale?: string
          name?: string
          updated_at?: string
          variation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_variation_translations_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "item_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      item_variations: {
        Row: {
          catalog_id: string
          created_at: string
          current_source_hash: string | null
          id: string
          is_active: boolean
          is_default: boolean
          is_sold_out: boolean
          item_id: string
          metadata: Json
          name: string
          ordinal: number
          price_cents: number
          pricing_type: Database["public"]["Enums"]["item_variation_pricing_type"]
          sku: string | null
          updated_at: string
          version: number
        }
        Insert: {
          catalog_id: string
          created_at?: string
          current_source_hash?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          is_sold_out?: boolean
          item_id: string
          metadata?: Json
          name: string
          ordinal?: number
          price_cents?: number
          pricing_type?: Database["public"]["Enums"]["item_variation_pricing_type"]
          sku?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          catalog_id?: string
          created_at?: string
          current_source_hash?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          is_sold_out?: boolean
          item_id?: string
          metadata?: Json
          name?: string
          ordinal?: number
          price_cents?: number
          pricing_type?: Database["public"]["Enums"]["item_variation_pricing_type"]
          sku?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "item_variations_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_variations_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          catalog_id: string
          category_id: string
          created_at: string
          current_source_hash: string | null
          description: string | null
          id: string
          image_alt: string | null
          image_path: string | null
          is_active: boolean
          is_sold_out: boolean
          metadata: Json | null
          name: string
          position: number
          product_type: Database["public"]["Enums"]["catalog_item_product_type"]
          slug: string
          updated_at: string
          version: number
        }
        Insert: {
          catalog_id: string
          category_id: string
          created_at?: string
          current_source_hash?: string | null
          description?: string | null
          id?: string
          image_alt?: string | null
          image_path?: string | null
          is_active?: boolean
          is_sold_out?: boolean
          metadata?: Json | null
          name: string
          position?: number
          product_type?: Database["public"]["Enums"]["catalog_item_product_type"]
          slug: string
          updated_at?: string
          version?: number
        }
        Update: {
          catalog_id?: string
          category_id?: string
          created_at?: string
          current_source_hash?: string | null
          description?: string | null
          id?: string
          image_alt?: string | null
          image_path?: string | null
          is_active?: boolean
          is_sold_out?: boolean
          metadata?: Json | null
          name?: string
          position?: number
          product_type?: Database["public"]["Enums"]["catalog_item_product_type"]
          slug?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "items_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "catalog_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      modifier_list_translations: {
        Row: {
          created_at: string
          id: string
          is_ai_translated: boolean
          last_edited_by: string | null
          locale: string
          modifier_list_id: string
          name: string
          source_hash: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_ai_translated?: boolean
          last_edited_by?: string | null
          locale: string
          modifier_list_id: string
          name: string
          source_hash?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_ai_translated?: boolean
          last_edited_by?: string | null
          locale?: string
          modifier_list_id?: string
          name?: string
          source_hash?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "modifier_list_translations_modifier_list_id_fkey"
            columns: ["modifier_list_id"]
            isOneToOne: false
            referencedRelation: "modifier_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      modifier_lists: {
        Row: {
          catalog_id: string
          created_at: string
          current_source_hash: string | null
          id: string
          internal_name: string | null
          is_active: boolean
          max_length: number | null
          max_selected: number | null
          metadata: Json
          min_selected: number
          modifier_type: Database["public"]["Enums"]["modifier_list_kind"]
          name: string
          text_required: boolean
          updated_at: string
          version: number
        }
        Insert: {
          catalog_id: string
          created_at?: string
          current_source_hash?: string | null
          id?: string
          internal_name?: string | null
          is_active?: boolean
          max_length?: number | null
          max_selected?: number | null
          metadata?: Json
          min_selected?: number
          modifier_type?: Database["public"]["Enums"]["modifier_list_kind"]
          name: string
          text_required?: boolean
          updated_at?: string
          version?: number
        }
        Update: {
          catalog_id?: string
          created_at?: string
          current_source_hash?: string | null
          id?: string
          internal_name?: string | null
          is_active?: boolean
          max_length?: number | null
          max_selected?: number | null
          metadata?: Json
          min_selected?: number
          modifier_type?: Database["public"]["Enums"]["modifier_list_kind"]
          name?: string
          text_required?: boolean
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "modifier_lists_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
        ]
      }
      modifier_translations: {
        Row: {
          created_at: string
          id: string
          is_ai_translated: boolean
          last_edited_by: string | null
          locale: string
          modifier_id: string
          name: string
          source_hash: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_ai_translated?: boolean
          last_edited_by?: string | null
          locale: string
          modifier_id: string
          name: string
          source_hash?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_ai_translated?: boolean
          last_edited_by?: string | null
          locale?: string
          modifier_id?: string
          name?: string
          source_hash?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "modifier_translations_modifier_id_fkey"
            columns: ["modifier_id"]
            isOneToOne: false
            referencedRelation: "modifiers"
            referencedColumns: ["id"]
          },
        ]
      }
      modifiers: {
        Row: {
          catalog_id: string
          created_at: string
          current_source_hash: string | null
          id: string
          is_active: boolean
          metadata: Json
          modifier_list_id: string
          name: string
          on_by_default: boolean
          ordinal: number
          price_cents: number
          updated_at: string
          version: number
        }
        Insert: {
          catalog_id: string
          created_at?: string
          current_source_hash?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          modifier_list_id: string
          name: string
          on_by_default?: boolean
          ordinal?: number
          price_cents?: number
          updated_at?: string
          version?: number
        }
        Update: {
          catalog_id?: string
          created_at?: string
          current_source_hash?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          modifier_list_id?: string
          name?: string
          on_by_default?: boolean
          ordinal?: number
          price_cents?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "modifiers_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modifiers_modifier_list_id_fkey"
            columns: ["modifier_list_id"]
            isOneToOne: false
            referencedRelation: "modifier_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: Database["public"]["Enums"]["role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role: Database["public"]["Enums"]["role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          country_iso2: string | null
          created_at: string
          id: string
          logo_path: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          country_iso2?: string | null
          created_at?: string
          id?: string
          logo_path?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          country_iso2?: string | null
          created_at?: string
          id?: string
          logo_path?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      qr_codes: {
        Row: {
          catalog_id: string
          created_at: string
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["qr_kind"]
          metadata: Json
          org_id: string
          shortcode: string
          table_id: string | null
          table_label: string | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          catalog_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["qr_kind"]
          metadata?: Json
          org_id: string
          shortcode?: string
          table_id?: string | null
          table_label?: string | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          catalog_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["qr_kind"]
          metadata?: Json
          org_id?: string
          shortcode?: string
          table_id?: string | null
          table_label?: string | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qr_codes_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_codes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_codes_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_codes_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      qr_scans: {
        // KRA-26 follow-up — hand-added until the next `pnpm gen:types`.
        // See supabase/migrations/20260525150000_kra26_qr_scans.sql.
        Row: {
          id: string
          qr_code_id: string
          org_id: string
          scanned_at: string
          ip_hash: string | null
          ua_hash: string | null
          referrer: string | null
        }
        Insert: {
          id?: string
          qr_code_id: string
          // BEFORE INSERT trigger fills org_id from the qr_codes row; any
          // uuid here is overwritten. Mirrors the qr_codes/tables pattern.
          org_id?: string
          scanned_at?: string
          ip_hash?: string | null
          ua_hash?: string | null
          referrer?: string | null
        }
        Update: {
          id?: string
          qr_code_id?: string
          org_id?: string
          scanned_at?: string
          ip_hash?: string | null
          ua_hash?: string | null
          referrer?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qr_scans_qr_code_id_fkey"
            columns: ["qr_code_id"]
            isOneToOne: false
            referencedRelation: "qr_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_scans_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tables: {
        Row: {
          id: string
          org_id: string
          venue_id: string
          label: string
          position: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id?: string
          venue_id: string
          label: string
          position?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          venue_id?: string
          label?: string
          position?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tables_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tables_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      search_logs: {
        Row: {
          catalog_id: string | null
          created_at: string
          has_embedding: boolean
          id: number
          mode: string
          org_id: string | null
          query: string
          results_count: number
          top_result_id: string | null
        }
        Insert: {
          catalog_id?: string | null
          created_at?: string
          has_embedding: boolean
          id?: never
          mode: string
          org_id?: string | null
          query: string
          results_count: number
          top_result_id?: string | null
        }
        Update: {
          catalog_id?: string | null
          created_at?: string
          has_embedding?: boolean
          id?: never
          mode?: string
          org_id?: string | null
          query?: string
          results_count?: number
          top_result_id?: string | null
        }
        Relationships: []
      }
      search_synonyms: {
        Row: {
          expansions: string[]
          term: string
        }
        Insert: {
          expansions?: string[]
          term: string
        }
        Update: {
          expansions?: string[]
          term?: string
        }
        Relationships: []
      }
      tax_categories: {
        Row: {
          catalog_id: string
          category_id: string
          created_at: string
          tax_id: string
        }
        Insert: {
          catalog_id: string
          category_id: string
          created_at?: string
          tax_id: string
        }
        Update: {
          catalog_id?: string
          category_id?: string
          created_at?: string
          tax_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_categories_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "catalog_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_categories_tax_id_fkey"
            columns: ["tax_id"]
            isOneToOne: false
            referencedRelation: "taxes"
            referencedColumns: ["id"]
          },
        ]
      }
      taxes: {
        Row: {
          applies_to: Database["public"]["Enums"]["tax_applies_to"]
          calculation_phase: Database["public"]["Enums"]["tax_calculation_phase"]
          catalog_id: string
          created_at: string
          id: string
          inclusion_type: Database["public"]["Enums"]["tax_inclusion_type"]
          is_active: boolean
          kind: Database["public"]["Enums"]["tax_kind"]
          metadata: Json
          name: string
          percentage: number
          updated_at: string
          version: number
        }
        Insert: {
          applies_to?: Database["public"]["Enums"]["tax_applies_to"]
          calculation_phase?: Database["public"]["Enums"]["tax_calculation_phase"]
          catalog_id: string
          created_at?: string
          id?: string
          inclusion_type?: Database["public"]["Enums"]["tax_inclusion_type"]
          is_active?: boolean
          kind?: Database["public"]["Enums"]["tax_kind"]
          metadata?: Json
          name: string
          percentage: number
          updated_at?: string
          version?: number
        }
        Update: {
          applies_to?: Database["public"]["Enums"]["tax_applies_to"]
          calculation_phase?: Database["public"]["Enums"]["tax_calculation_phase"]
          catalog_id?: string
          created_at?: string
          id?: string
          inclusion_type?: Database["public"]["Enums"]["tax_inclusion_type"]
          is_active?: boolean
          kind?: Database["public"]["Enums"]["tax_kind"]
          metadata?: Json
          name?: string
          percentage?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "taxes_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
        ]
      }
      translation_history: {
        Row: {
          edited_at: string
          edited_by: string | null
          entity_kind: Database["public"]["Enums"]["translatable_entity_kind"]
          field: string
          id: string
          locale: string
          previous_value: string | null
          translation_row_id: string
          was_ai_edit: boolean
        }
        Insert: {
          edited_at?: string
          edited_by?: string | null
          entity_kind: Database["public"]["Enums"]["translatable_entity_kind"]
          field: string
          id?: string
          locale: string
          previous_value?: string | null
          translation_row_id: string
          was_ai_edit?: boolean
        }
        Update: {
          edited_at?: string
          edited_by?: string | null
          entity_kind?: Database["public"]["Enums"]["translatable_entity_kind"]
          field?: string
          id?: string
          locale?: string
          previous_value?: string | null
          translation_row_id?: string
          was_ai_edit?: boolean
        }
        Relationships: []
      }
      translation_jobs: {
        Row: {
          attempts: number
          catalog_id: string
          completed_at: string | null
          created_at: string
          enqueued_by: string | null
          entity_id: string
          entity_kind: Database["public"]["Enums"]["translatable_entity_kind"]
          error_text: string | null
          id: string
          llm_provider: string
          max_attempts: number
          next_attempt_at: string
          started_at: string | null
          status: Database["public"]["Enums"]["translation_job_status"]
          target_locale: string
        }
        Insert: {
          attempts?: number
          catalog_id: string
          completed_at?: string | null
          created_at?: string
          enqueued_by?: string | null
          entity_id: string
          entity_kind: Database["public"]["Enums"]["translatable_entity_kind"]
          error_text?: string | null
          id?: string
          llm_provider?: string
          max_attempts?: number
          next_attempt_at?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["translation_job_status"]
          target_locale: string
        }
        Update: {
          attempts?: number
          catalog_id?: string
          completed_at?: string | null
          created_at?: string
          enqueued_by?: string | null
          entity_id?: string
          entity_kind?: Database["public"]["Enums"]["translatable_entity_kind"]
          error_text?: string | null
          id?: string
          llm_provider?: string
          max_attempts?: number
          next_attempt_at?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["translation_job_status"]
          target_locale?: string
        }
        Relationships: [
          {
            foreignKeyName: "translation_jobs_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
        ]
      }
      variation_translations: {
        Row: {
          created_at: string
          id: string
          is_ai_translated: boolean
          item_variation_id: string
          last_edited_by: string | null
          locale: string
          name: string
          source_hash: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_ai_translated?: boolean
          item_variation_id: string
          last_edited_by?: string | null
          locale: string
          name: string
          source_hash?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_ai_translated?: boolean
          item_variation_id?: string
          last_edited_by?: string | null
          locale?: string
          name?: string
          source_hash?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "variation_translations_item_variation_id_fkey"
            columns: ["item_variation_id"]
            isOneToOne: false
            referencedRelation: "item_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          address: Json
          business_hours: Json
          catalog_id: string
          created_at: string
          currency: string
          id: string
          language_code: string
          metadata: Json
          modes_enabled: string[]
          name: string
          org_id: string
          slug: string
          status: Database["public"]["Enums"]["venue_status"]
          timezone: string
          updated_at: string
          version: number
        }
        Insert: {
          address?: Json
          business_hours?: Json
          catalog_id: string
          created_at?: string
          currency?: string
          id?: string
          language_code?: string
          metadata?: Json
          modes_enabled?: string[]
          name: string
          org_id: string
          slug: string
          status?: Database["public"]["Enums"]["venue_status"]
          timezone?: string
          updated_at?: string
          version?: number
        }
        Update: {
          address?: Json
          business_hours?: Json
          catalog_id?: string
          created_at?: string
          currency?: string
          id?: string
          language_code?: string
          metadata?: Json
          modes_enabled?: string[]
          name?: string
          org_id?: string
          slug?: string
          status?: Database["public"]["Enums"]["venue_status"]
          timezone?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "venues_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: true
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venues_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      translation_completeness_view: {
        Row: {
          catalog_id: string | null
          entity_kind:
            | Database["public"]["Enums"]["translatable_entity_kind"]
            | null
          locale: string | null
          missing: number | null
          non_stale: number | null
          stale: number | null
          total: number | null
          translated: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      ack_embedding_job: { Args: { p_job_id: number }; Returns: undefined }
      catalog_is_public: { Args: { _catalog_id: string }; Returns: boolean }
      catalog_org_id: { Args: { _catalog_id: string }; Returns: string }
      catalog_search: {
        Args: {
          p_catalog_id?: string
          p_limit?: number
          p_org_id?: string
          p_query: string
          p_query_embedding?: unknown
        }
        Returns: {
          catalog_id: string
          description: string
          distance: number
          id: string
          locale: string
          org_id: string
          rank_fts: number
          score: number
          sim_desc: number
          sim_title: number
          subtitle: string
          tags: string[]
          title: string
        }[]
      }
      catalog_search_auto: {
        Args: {
          p_catalog_id?: string
          p_limit?: number
          p_org_id?: string
          p_query: string
          p_query_embedding?: unknown
        }
        Returns: {
          catalog_id: string
          description: string
          distance: number
          id: string
          locale: string
          mode: string
          org_id: string
          rank_fts: number
          score: number
          sim_desc: number
          sim_title: number
          subtitle: string
          tags: string[]
          title: string
        }[]
      }
      catalog_search_documents_embedding_input: {
        Args: {
          doc: Database["public"]["Tables"]["catalog_search_documents"]["Row"]
        }
        Returns: string
      }
      catalog_search_documents_fts_input: {
        Args: {
          doc: Database["public"]["Tables"]["catalog_search_documents"]["Row"]
        }
        Returns: string
      }
      catalog_search_sync_category_document: {
        Args: { p_category_id: string }
        Returns: undefined
      }
      catalog_search_sync_item_document: {
        Args: { p_item_id: string }
        Returns: undefined
      }
      create_draft_shop: {
        Args: { p_slug: string }
        Returns: {
          catalog_id: string
          org_id: string
        }[]
      }
      duplicate_item: {
        Args: { p_catalog_id: string; p_item_id: string }
        Returns: string
      }
      is_org_role: {
        Args: { _org_id: string; _roles?: string[] }
        Returns: boolean
      }
      log_search: {
        Args: {
          p_catalog_id: string
          p_has_embedding: boolean
          p_mode: string
          p_org_id: string
          p_query: string
          p_results_count: number
          p_top_result_id: string
        }
        Returns: undefined
      }
      reorder_categories: {
        Args: { p_catalog_id: string; p_changes: Json }
        Returns: undefined
      }
      reorder_items: {
        Args: { p_catalog_id: string; p_changes: Json }
        Returns: undefined
      }
      search_expand_query: { Args: { q: string }; Returns: string }
      search_faq: {
        Args: { p_limit?: number; p_query: string; p_query_embedding?: unknown }
        Returns: {
          answer: string
          category: string
          id: string
          question: string
          score: number
        }[]
      }
      search_normalize: { Args: { q: string }; Returns: string }
      search_simple_translit: { Args: { q: string }; Returns: string }
      set_catalog_search_doc_embedding: {
        Args: { p_embedding_text: string; p_id: string }
        Returns: undefined
      }
      update_item_with_variations: {
        Args: {
          p_item_fields: Json
          p_item_id: string
          p_variation_changes: Json
        }
        Returns: undefined
      }
    }
    Enums: {
      catalog_item_product_type:
        | "REGULAR"
        | "APPOINTMENTS_SERVICE"
        | "FOOD_AND_BEV"
        | "EVENT"
        | "DIGITAL"
        | "DONATION"
        | "ONLINE_SERVICE"
        | "ONLINE_MEMBERSHIP"
      catalog_status: "draft" | "published" | "suspended"
      discount_type:
        | "percentage"
        | "fixed_amount"
        | "variable_percentage"
        | "variable_amount"
      item_media_kind: "image" | "video"
      item_variation_pricing_type: "fixed" | "variable"
      modifier_list_kind: "list" | "text"
      qr_kind: "main" | "table" | "pickup" | "delivery"
      role: "owner" | "member" | "admin"
      tax_applies_to: "all_items" | "by_category"
      tax_calculation_phase: "subtotal" | "total"
      tax_inclusion_type: "included" | "additive"
      tax_kind: "tax" | "service_fee"
      translatable_entity_kind:
        | "item"
        | "variation"
        | "modifier"
        | "modifier_list"
        | "category"
        | "catalog"
      translation_job_status:
        | "queued"
        | "running"
        | "done"
        | "skipped"
        | "failed"
        | "dead"
      venue_status: "active" | "paused" | "archived"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  commerce: {
    Enums: {
      applied_scope: ["order", "line_item"],
      customer_creation_source: [
        "instant_profile",
        "dashboard",
        "guest_checkout",
        "tg_login",
      ],
      delivery_provider: ["merchant", "yandex", "glovo", "other"],
      fulfillment_line_item_application: ["all", "entry_list"],
      fulfillment_schedule_type: ["asap", "scheduled"],
      fulfillment_state: [
        "proposed",
        "reserved",
        "prepared",
        "completed",
        "canceled",
        "failed",
      ],
      fulfillment_type: ["dine_in", "pickup", "delivery", "digital"],
      order_discount_type: ["percentage", "fixed_amount"],
      order_event_actor: [
        "customer",
        "merchant_staff",
        "system",
        "krafta_admin",
      ],
      order_payment_source: ["cash", "external_card_recorded", "krafta_pay"],
      order_payment_status: [
        "pending",
        "approved",
        "completed",
        "canceled",
        "failed",
      ],
      order_refund_status: ["pending", "completed", "failed"],
      order_source: ["web", "tma", "qr_scan", "dashboard"],
      order_state: ["draft", "open", "completed", "canceled"],
      order_tax_type: ["percentage", "fixed"],
      table_session_status: ["open", "closed"],
    },
  },
  payments: {
    Enums: {
      environment: ["test", "live"],
      org_provider_account_status: ["active", "disabled"],
    },
  },
  public: {
    Enums: {
      catalog_item_product_type: [
        "REGULAR",
        "APPOINTMENTS_SERVICE",
        "FOOD_AND_BEV",
        "EVENT",
        "DIGITAL",
        "DONATION",
        "ONLINE_SERVICE",
        "ONLINE_MEMBERSHIP",
      ],
      catalog_status: ["draft", "published", "suspended"],
      discount_type: [
        "percentage",
        "fixed_amount",
        "variable_percentage",
        "variable_amount",
      ],
      item_media_kind: ["image", "video"],
      item_variation_pricing_type: ["fixed", "variable"],
      modifier_list_kind: ["list", "text"],
      qr_kind: ["main", "table", "pickup", "delivery"],
      role: ["owner", "member", "admin"],
      tax_applies_to: ["all_items", "by_category"],
      tax_calculation_phase: ["subtotal", "total"],
      tax_inclusion_type: ["included", "additive"],
      tax_kind: ["tax", "service_fee"],
      translatable_entity_kind: [
        "item",
        "variation",
        "modifier",
        "modifier_list",
        "category",
        "catalog",
      ],
      translation_job_status: [
        "queued",
        "running",
        "done",
        "skipped",
        "failed",
        "dead",
      ],
      venue_status: ["active", "paused", "archived"],
    },
  },
} as const
