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
    PostgrestVersion: "13.0.5"
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
      catalog_categories: {
        Row: {
          catalog_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          position: number
          slug: string
        }
        Insert: {
          catalog_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          position?: number
          slug: string
        }
        Update: {
          catalog_id?: string
          created_at?: string
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
          locale: string
          name: string
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          description?: string | null
          id?: string
          locale: string
          name: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          description?: string | null
          id?: string
          locale?: string
          name?: string
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
      catalog_locales: {
        Row: {
          catalog_id: string
          created_at: string
          id: string
          is_default: boolean
          is_enabled: boolean
          locale: string
          sort_order: number
        }
        Insert: {
          catalog_id: string
          created_at?: string
          id?: string
          is_default?: boolean
          is_enabled?: boolean
          locale: string
          sort_order?: number
        }
        Update: {
          catalog_id?: string
          created_at?: string
          id?: string
          is_default?: boolean
          is_enabled?: boolean
          locale?: string
          sort_order?: number
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
      catalogs: {
        Row: {
          created_at: string
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
          tags: string[] | null
        }
        Insert: {
          created_at?: string
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
          tags?: string[] | null
        }
        Update: {
          created_at?: string
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
      item_translations: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_alt: string | null
          item_id: string
          locale: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_alt?: string | null
          item_id: string
          locale: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_alt?: string | null
          item_id?: string
          locale?: string
          name?: string
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
      items: {
        Row: {
          catalog_id: string
          category_id: string
          created_at: string
          description: string | null
          id: string
          image_alt: string | null
          image_path: string | null
          is_active: boolean
          metadata: Json | null
          name: string
          position: number
          price_cents: number
          slug: string
          updated_at: string
        }
        Insert: {
          catalog_id: string
          category_id: string
          created_at?: string
          description?: string | null
          id?: string
          image_alt?: string | null
          image_path?: string | null
          is_active?: boolean
          metadata?: Json | null
          name: string
          position?: number
          price_cents?: number
          slug: string
          updated_at?: string
        }
        Update: {
          catalog_id?: string
          category_id?: string
          created_at?: string
          description?: string | null
          id?: string
          image_alt?: string | null
          image_path?: string | null
          is_active?: boolean
          metadata?: Json | null
          name?: string
          position?: number
          price_cents?: number
          slug?: string
          updated_at?: string
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
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          country_iso2?: string | null
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          country_iso2?: string | null
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ack_embedding_job: { Args: { p_job_id: number }; Returns: undefined }
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
      search_expand_query: { Args: { q: string }; Returns: string }
      search_normalize: { Args: { q: string }; Returns: string }
      search_simple_translit: { Args: { q: string }; Returns: string }
      set_catalog_search_doc_embedding: {
        Args: { p_embedding_text: string; p_id: string }
        Returns: undefined
      }
    }
    Enums: {
      item_media_kind: "image" | "video"
      role: "owner" | "member" | "admin"
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
  payments: {
    Enums: {
      environment: ["test", "live"],
      org_provider_account_status: ["active", "disabled"],
    },
  },
  public: {
    Enums: {
      item_media_kind: ["image", "video"],
      role: ["owner", "member", "admin"],
    },
  },
} as const
