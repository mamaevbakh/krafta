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
      catalogs: {
        Row: {
          created_at: string
          creation_method: string
          current_source_hash: string | null
          description: string | null
          id: string
          logo_path: string | null
          name: string
          org_id: string
          pricing_config: Json | null
          published_at: string | null
          published_url: string | null
          settings_behavior: Json
          settings_branding: Json
          settings_currency: Json
          settings_delivery: Json
          settings_i18n: Json
          settings_layout: Json
          settings_qr_style: Json
          slug: string
          status: Database["public"]["Enums"]["catalog_status"]
          studio_publishable_key: string | null
          tags: string[] | null
          vercel_deployment_url: string | null
          vertical: Database["public"]["Enums"]["shop_vertical"] | null
        }
        Insert: {
          created_at?: string
          creation_method?: string
          current_source_hash?: string | null
          description?: string | null
          id?: string
          logo_path?: string | null
          name: string
          org_id: string
          pricing_config?: Json | null
          published_at?: string | null
          published_url?: string | null
          settings_behavior?: Json
          settings_branding?: Json
          settings_currency?: Json
          settings_delivery?: Json
          settings_i18n?: Json
          settings_layout?: Json
          settings_qr_style?: Json
          slug: string
          status?: Database["public"]["Enums"]["catalog_status"]
          studio_publishable_key?: string | null
          tags?: string[] | null
          vercel_deployment_url?: string | null
          vertical?: Database["public"]["Enums"]["shop_vertical"] | null
        }
        Update: {
          created_at?: string
          creation_method?: string
          current_source_hash?: string | null
          description?: string | null
          id?: string
          logo_path?: string | null
          name?: string
          org_id?: string
          pricing_config?: Json | null
          published_at?: string | null
          published_url?: string | null
          settings_behavior?: Json
          settings_branding?: Json
          settings_currency?: Json
          settings_delivery?: Json
          settings_i18n?: Json
          settings_layout?: Json
          settings_qr_style?: Json
          slug?: string
          status?: Database["public"]["Enums"]["catalog_status"]
          studio_publishable_key?: string | null
          tags?: string[] | null
          vercel_deployment_url?: string | null
          vertical?: Database["public"]["Enums"]["shop_vertical"] | null
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
      draft_shop_claims: {
        Row: {
          claimed_from: string
          code: string
          created_at: string
          expires_at: string
          org_id: string
        }
        Insert: {
          claimed_from: string
          code?: string
          created_at?: string
          expires_at?: string
          org_id: string
        }
        Update: {
          claimed_from?: string
          code?: string
          created_at?: string
          expires_at?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_shop_claims_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          seeded_at: string | null
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
          seeded_at?: string | null
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
          seeded_at?: string | null
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
        Row: {
          id: string
          ip_hash: string | null
          org_id: string
          qr_code_id: string
          referrer: string | null
          scanned_at: string
          ua_hash: string | null
        }
        Insert: {
          id?: string
          ip_hash?: string | null
          org_id: string
          qr_code_id: string
          referrer?: string | null
          scanned_at?: string
          ua_hash?: string | null
        }
        Update: {
          id?: string
          ip_hash?: string | null
          org_id?: string
          qr_code_id?: string
          referrer?: string | null
          scanned_at?: string
          ua_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qr_scans_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_scans_qr_code_id_fkey"
            columns: ["qr_code_id"]
            isOneToOne: false
            referencedRelation: "qr_codes"
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
      tables: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string
          org_id: string
          position: number
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          org_id: string
          position?: number
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          org_id?: string
          position?: number
          updated_at?: string
          venue_id?: string
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
      telegram_merchant_identities: {
        Row: {
          created_at: string
          first_name: string | null
          photo_url: string | null
          telegram_user_id: string
          user_id: string
          username: string | null
        }
        Insert: {
          created_at?: string
          first_name?: string | null
          photo_url?: string | null
          telegram_user_id: string
          user_id: string
          username?: string | null
        }
        Update: {
          created_at?: string
          first_name?: string | null
          photo_url?: string | null
          telegram_user_id?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
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
          tma_enabled: boolean
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
          tma_enabled?: boolean
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
          tma_enabled?: boolean
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
      vertical_templates: {
        Row: {
          created_at: string
          key: Database["public"]["Enums"]["shop_vertical"]
          template: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          key: Database["public"]["Enums"]["shop_vertical"]
          template: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          key?: Database["public"]["Enums"]["shop_vertical"]
          template?: Json
          updated_at?: string
        }
        Relationships: []
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
          p_exact_boost?: number
          p_fts_weight?: number
          p_limit?: number
          p_org_id?: string
          p_prefix_boost?: number
          p_query: string
          p_query_embedding?: unknown
          p_rrf_k?: number
          p_trgm_threshold?: number
          p_vec_weight?: number
          p_word_boost?: number
        }
        Returns: {
          catalog_id: string
          description: string
          distance: number
          entity_id: string
          id: string
          locale: string
          mode: string
          org_id: string
          rank_fts: number
          score: number
          sim_desc: number
          sim_title: number
          source_table: string
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
      claim_draft_shop_complete: {
        Args: { p_claim_code: string }
        Returns: {
          catalog_slug: string
          org_slug: string
        }[]
      }
      claim_draft_shop_initiate: { Args: never; Returns: string }
      complete_wizard: {
        Args: {
          p_address: Json
          p_branding?: Json
          p_catalog_id: string
          p_currency: Json
          p_item_images?: string[]
          p_layout?: Json
          p_locales: Json
          p_menu: Json
          p_modes: string[]
          p_table_count: number
          p_vertical: Database["public"]["Enums"]["shop_vertical"]
        }
        Returns: undefined
      }
      create_coded_shop: {
        Args: { p_name?: string; p_org_id: string; p_slug: string }
        Returns: {
          catalog_id: string
          org_id: string
          slug: string
        }[]
      }
      create_draft_shop: {
        Args: {
          p_name?: string
          p_slug: string
          p_vertical?: Database["public"]["Enums"]["shop_vertical"]
        }
        Returns: {
          catalog_id: string
          org_id: string
        }[]
      }
      create_wizard_menu: {
        Args: { p_catalog_id: string; p_menu: Json }
        Returns: undefined
      }
      duplicate_item: {
        Args: { p_catalog_id: string; p_item_id: string }
        Returns: string
      }
      increment_translation_quota: {
        Args: {
          p_catalog_id: string
          p_tokens_used: number
          p_usd_estimated: number
        }
        Returns: undefined
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
      pg_advisory_unlock_text: { Args: { p_key: string }; Returns: boolean }
      pg_try_advisory_lock_text: { Args: { p_key: string }; Returns: boolean }
      publish_shop: {
        Args: { p_final_slug?: string; p_org_id: string }
        Returns: {
          catalog_slug: string
          org_slug: string
          venue_slug: string
        }[]
      }
      record_studio_publish: {
        Args: {
          p_catalog_id: string
          p_deployment_url?: string
          p_published_url: string
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
      translation_worker_claim_batch: {
        Args: { p_batch_size?: number }
        Returns: {
          attempts: number
          catalog_id: string
          entity_id: string
          entity_kind: Database["public"]["Enums"]["translatable_entity_kind"]
          id: string
          llm_provider: string
          max_attempts: number
          target_locale: string
        }[]
      }
      translation_worker_reset_daily_quotas: { Args: never; Returns: number }
      translation_worker_watchdog: { Args: never; Returns: number }
      update_item_with_variations: {
        Args: {
          p_item_fields: Json
          p_item_id: string
          p_variation_changes: Json
        }
        Returns: undefined
      }
      uz_cyrl_to_latn: { Args: { q: string }; Returns: string }
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
      shop_vertical: "cafe" | "restaurant" | "retail"
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
      shop_vertical: ["cafe", "restaurant", "retail"],
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
