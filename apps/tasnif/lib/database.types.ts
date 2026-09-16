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
  tasnif: {
    Tables: {
      codes: {
        Row: {
          attribute_ru: string | null
          barcode: string | null
          benefit_id: string | null
          benefit_name_ru: string | null
          brand_name: string | null
          class_code: string | null
          created_at: string
          details_fetched_at: string | null
          first_seen_at: string
          fixed_measure_ru: string | null
          fixed_package_ru: string | null
          fixed_unit_ru: string | null
          group_code: string | null
          ikpu: string
          inactive_since: string | null
          is_branded: boolean | null
          kind: string | null
          name_ru: string
          name_uz_cyrl: string | null
          name_uz_latn: string | null
          position_code: string | null
          recommended_measure_ru: string | null
          recommended_unit_ru: string | null
          status: string
          subposition_code: string | null
          updated_at: string
        }
        Insert: {
          attribute_ru?: string | null
          barcode?: string | null
          benefit_id?: string | null
          benefit_name_ru?: string | null
          brand_name?: string | null
          class_code?: string | null
          created_at?: string
          details_fetched_at?: string | null
          first_seen_at?: string
          fixed_measure_ru?: string | null
          fixed_package_ru?: string | null
          fixed_unit_ru?: string | null
          group_code?: string | null
          ikpu: string
          inactive_since?: string | null
          is_branded?: boolean | null
          kind?: string | null
          name_ru: string
          name_uz_cyrl?: string | null
          name_uz_latn?: string | null
          position_code?: string | null
          recommended_measure_ru?: string | null
          recommended_unit_ru?: string | null
          status?: string
          subposition_code?: string | null
          updated_at?: string
        }
        Update: {
          attribute_ru?: string | null
          barcode?: string | null
          benefit_id?: string | null
          benefit_name_ru?: string | null
          brand_name?: string | null
          class_code?: string | null
          created_at?: string
          details_fetched_at?: string | null
          first_seen_at?: string
          fixed_measure_ru?: string | null
          fixed_package_ru?: string | null
          fixed_unit_ru?: string | null
          group_code?: string | null
          ikpu?: string
          inactive_since?: string | null
          is_branded?: boolean | null
          kind?: string | null
          name_ru?: string
          name_uz_cyrl?: string | null
          name_uz_latn?: string | null
          position_code?: string | null
          recommended_measure_ru?: string | null
          recommended_unit_ru?: string | null
          status?: string
          subposition_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "codes_subposition_code_fkey"
            columns: ["subposition_code"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["code"]
          },
        ]
      }
      import_packages: {
        Row: {
          ikpu: string
          name_ru: string
          origin: string
          package_code: number
          run_id: number
        }
        Insert: {
          ikpu: string
          name_ru: string
          origin: string
          package_code: number
          run_id: number
        }
        Update: {
          ikpu?: string
          name_ru?: string
          origin?: string
          package_code?: number
          run_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_packages_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      import_rows: {
        Row: {
          attribute_ru: string | null
          barcode: string | null
          benefit_id: string | null
          brand_name: string | null
          fixed_measure_ru: string | null
          fixed_package_ru: string | null
          fixed_unit_ru: string | null
          ikpu: string
          name_ru: string
          recommended_measure_ru: string | null
          recommended_unit_ru: string | null
          run_id: number
        }
        Insert: {
          attribute_ru?: string | null
          barcode?: string | null
          benefit_id?: string | null
          brand_name?: string | null
          fixed_measure_ru?: string | null
          fixed_package_ru?: string | null
          fixed_unit_ru?: string | null
          ikpu: string
          name_ru: string
          recommended_measure_ru?: string | null
          recommended_unit_ru?: string | null
          run_id: number
        }
        Update: {
          attribute_ru?: string | null
          barcode?: string | null
          benefit_id?: string | null
          brand_name?: string | null
          fixed_measure_ru?: string | null
          fixed_package_ru?: string | null
          fixed_unit_ru?: string | null
          ikpu?: string
          name_ru?: string
          recommended_measure_ru?: string | null
          recommended_unit_ru?: string | null
          run_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      inactive_codes: {
        Row: {
          attribute_ru: string | null
          brand_name: string | null
          class_name_ru: string | null
          created_at: string
          first_listed_at: string
          group_name_ru: string | null
          ikpu: string
          name_ru: string
          position_name_ru: string | null
          subposition_code: string | null
          subposition_name_ru: string | null
          updated_at: string
        }
        Insert: {
          attribute_ru?: string | null
          brand_name?: string | null
          class_name_ru?: string | null
          created_at?: string
          first_listed_at?: string
          group_name_ru?: string | null
          ikpu: string
          name_ru: string
          position_name_ru?: string | null
          subposition_code?: string | null
          subposition_name_ru?: string | null
          updated_at?: string
        }
        Update: {
          attribute_ru?: string | null
          brand_name?: string | null
          class_name_ru?: string | null
          created_at?: string
          first_listed_at?: string
          group_name_ru?: string | null
          ikpu?: string
          name_ru?: string
          position_name_ru?: string | null
          subposition_code?: string | null
          subposition_name_ru?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      nodes: {
        Row: {
          code: string
          created_at: string
          level: string | null
          name_en: string | null
          name_ru: string
          name_uz_cyrl: string | null
          name_uz_latn: string | null
          parent_code: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          level?: string | null
          name_en?: string | null
          name_ru: string
          name_uz_cyrl?: string | null
          name_uz_latn?: string | null
          parent_code?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          level?: string | null
          name_en?: string | null
          name_ru?: string
          name_uz_cyrl?: string | null
          name_uz_latn?: string | null
          parent_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nodes_parent_code_fkey"
            columns: ["parent_code"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["code"]
          },
        ]
      }
      packages: {
        Row: {
          container_name_ru: string | null
          fetched_at: string
          ikpu: string
          is_unit_package: string | null
          name_ru: string | null
          name_uz_cyrl: string | null
          name_uz_latn: string | null
          origin: string | null
          package_code: number
          package_type: string | null
          parent_package_code: number | null
          parent_value: number | null
          unit_name_ru: string | null
        }
        Insert: {
          container_name_ru?: string | null
          fetched_at?: string
          ikpu: string
          is_unit_package?: string | null
          name_ru?: string | null
          name_uz_cyrl?: string | null
          name_uz_latn?: string | null
          origin?: string | null
          package_code: number
          package_type?: string | null
          parent_package_code?: number | null
          parent_value?: number | null
          unit_name_ru?: string | null
        }
        Update: {
          container_name_ru?: string | null
          fetched_at?: string
          ikpu?: string
          is_unit_package?: string | null
          name_ru?: string | null
          name_uz_cyrl?: string | null
          name_uz_latn?: string | null
          origin?: string | null
          package_code?: number
          package_type?: string | null
          parent_package_code?: number | null
          parent_value?: number | null
          unit_name_ru?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "packages_ikpu_fkey"
            columns: ["ikpu"]
            isOneToOne: false
            referencedRelation: "codes"
            referencedColumns: ["ikpu"]
          },
        ]
      }
      search_documents: {
        Row: {
          doc: string
          doc_tsv: unknown
          embed_text: string | null
          embedded_at: string | null
          embedding: unknown
          entity: string
          everyday_terms: string | null
          is_branded: boolean
          is_category_level: boolean
          key: string
          kind: string
          level: string
          subposition_code: string | null
          updated_at: string
        }
        Insert: {
          doc: string
          doc_tsv?: unknown
          embed_text?: string | null
          embedded_at?: string | null
          embedding?: unknown
          entity: string
          everyday_terms?: string | null
          is_branded?: boolean
          is_category_level?: boolean
          key: string
          kind: string
          level: string
          subposition_code?: string | null
          updated_at?: string
        }
        Update: {
          doc?: string
          doc_tsv?: unknown
          embed_text?: string | null
          embedded_at?: string | null
          embedding?: unknown
          entity?: string
          everyday_terms?: string | null
          is_branded?: boolean
          is_category_level?: boolean
          key?: string
          kind?: string
          level?: string
          subposition_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sync_runs: {
        Row: {
          error: string | null
          finished_at: string | null
          id: number
          notes: Json
          rows_added: number | null
          rows_changed: number | null
          rows_deactivated: number | null
          rows_seen: number | null
          source: string
          source_file: string | null
          source_sha256: string | null
          started_at: string
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: never
          notes?: Json
          rows_added?: number | null
          rows_changed?: number | null
          rows_deactivated?: number | null
          rows_seen?: number | null
          source: string
          source_file?: string | null
          source_sha256?: string | null
          started_at?: string
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: never
          notes?: Json
          rows_added?: number | null
          rows_changed?: number | null
          rows_deactivated?: number | null
          rows_seen?: number | null
          source?: string
          source_file?: string | null
          source_sha256?: string | null
          started_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      embedding_inputs: {
        Row: {
          embed_text: string | null
          embedded_text: string | null
          key: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      refresh_search_documents: {
        Args: { p_group: string }
        Returns: {
          codes_removed: number
          codes_written: number
          nodes_written: number
        }[]
      }
      search: {
        Args: { p_limit?: number; p_query: string; p_query_embedding?: unknown }
        Returns: {
          ikpu: string
          is_branded: boolean
          kind: string
          match: string
          name_ru: string
          name_uz_cyrl: string
          name_uz_latn: string
          score: number
          status: string
          subposition_code: string
        }[]
      }
      search_text: { Args: { q: string }; Returns: string }
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
  tasnif: {
    Enums: {},
  },
} as const
