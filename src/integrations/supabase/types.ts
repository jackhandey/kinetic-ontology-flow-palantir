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
      ontology_alerts: {
        Row: {
          category: string
          created_at: string
          description: string | null
          detected_at: string
          evaluation_model: string | null
          evaluation_payload: Json | null
          exposure_usd: number | null
          headline: string
          id: string
          impacted_asset_ids: string[]
          impacted_route_ids: string[]
          organization_id: string
          resolved_at: string | null
          severity: string
          source_asset_id: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          detected_at?: string
          evaluation_model?: string | null
          evaluation_payload?: Json | null
          exposure_usd?: number | null
          headline: string
          id?: string
          impacted_asset_ids?: string[]
          impacted_route_ids?: string[]
          organization_id: string
          resolved_at?: string | null
          severity: string
          source_asset_id: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          detected_at?: string
          evaluation_model?: string | null
          evaluation_payload?: Json | null
          exposure_usd?: number | null
          headline?: string
          id?: string
          impacted_asset_ids?: string[]
          impacted_route_ids?: string[]
          organization_id?: string
          resolved_at?: string | null
          severity?: string
          source_asset_id?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      raw_asset_status: {
        Row: {
          id: string
          ingested_at: string
          organization_id: string
          processed_at: string | null
          processed_status: boolean
          raw_payload: Json
          source_system: string | null
        }
        Insert: {
          id?: string
          ingested_at?: string
          organization_id: string
          processed_at?: string | null
          processed_status?: boolean
          raw_payload: Json
          source_system?: string | null
        }
        Update: {
          id?: string
          ingested_at?: string
          organization_id?: string
          processed_at?: string | null
          processed_status?: boolean
          raw_payload?: Json
          source_system?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "raw_asset_status_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_driver_logs: {
        Row: {
          id: string
          ingested_at: string
          organization_id: string
          processed_at: string | null
          processed_status: boolean
          raw_payload: Json
          source_system: string | null
        }
        Insert: {
          id?: string
          ingested_at?: string
          organization_id: string
          processed_at?: string | null
          processed_status?: boolean
          raw_payload: Json
          source_system?: string | null
        }
        Update: {
          id?: string
          ingested_at?: string
          organization_id?: string
          processed_at?: string | null
          processed_status?: boolean
          raw_payload?: Json
          source_system?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "raw_driver_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_fleet_status: {
        Row: {
          id: string
          ingested_at: string
          organization_id: string
          processed_at: string | null
          processed_status: boolean
          raw_payload: Json
          source_system: string | null
        }
        Insert: {
          id?: string
          ingested_at?: string
          organization_id: string
          processed_at?: string | null
          processed_status?: boolean
          raw_payload: Json
          source_system?: string | null
        }
        Update: {
          id?: string
          ingested_at?: string
          organization_id?: string
          processed_at?: string | null
          processed_status?: boolean
          raw_payload?: Json
          source_system?: string | null
        }
        Relationships: []
      }
      raw_freight_orders: {
        Row: {
          id: string
          ingested_at: string
          organization_id: string
          processed_at: string | null
          processed_status: boolean
          raw_payload: Json
          source_system: string | null
        }
        Insert: {
          id?: string
          ingested_at?: string
          organization_id: string
          processed_at?: string | null
          processed_status?: boolean
          raw_payload: Json
          source_system?: string | null
        }
        Update: {
          id?: string
          ingested_at?: string
          organization_id?: string
          processed_at?: string | null
          processed_status?: boolean
          raw_payload?: Json
          source_system?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "raw_freight_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_inventory_batches: {
        Row: {
          id: string
          ingested_at: string
          organization_id: string
          processed_at: string | null
          processed_status: boolean
          raw_payload: Json
          source_system: string | null
        }
        Insert: {
          id?: string
          ingested_at?: string
          organization_id: string
          processed_at?: string | null
          processed_status?: boolean
          raw_payload: Json
          source_system?: string | null
        }
        Update: {
          id?: string
          ingested_at?: string
          organization_id?: string
          processed_at?: string | null
          processed_status?: boolean
          raw_payload?: Json
          source_system?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "raw_inventory_batches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_route_plans: {
        Row: {
          id: string
          ingested_at: string
          organization_id: string
          processed_at: string | null
          processed_status: boolean
          raw_payload: Json
          source_system: string | null
        }
        Insert: {
          id?: string
          ingested_at?: string
          organization_id: string
          processed_at?: string | null
          processed_status?: boolean
          raw_payload: Json
          source_system?: string | null
        }
        Update: {
          id?: string
          ingested_at?: string
          organization_id?: string
          processed_at?: string | null
          processed_status?: boolean
          raw_payload?: Json
          source_system?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "raw_route_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_shipping_manifests: {
        Row: {
          id: string
          ingested_at: string
          organization_id: string
          processed_at: string | null
          processed_status: boolean
          raw_payload: Json
          source_system: string | null
        }
        Insert: {
          id?: string
          ingested_at?: string
          organization_id: string
          processed_at?: string | null
          processed_status?: boolean
          raw_payload: Json
          source_system?: string | null
        }
        Update: {
          id?: string
          ingested_at?: string
          organization_id?: string
          processed_at?: string | null
          processed_status?: boolean
          raw_payload?: Json
          source_system?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "raw_shipping_manifests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_telemetry_logs: {
        Row: {
          id: string
          ingested_at: string
          organization_id: string
          processed_at: string | null
          processed_status: boolean
          raw_payload: Json
          source_system: string | null
        }
        Insert: {
          id?: string
          ingested_at?: string
          organization_id: string
          processed_at?: string | null
          processed_status?: boolean
          raw_payload: Json
          source_system?: string | null
        }
        Update: {
          id?: string
          ingested_at?: string
          organization_id?: string
          processed_at?: string | null
          processed_status?: boolean
          raw_payload?: Json
          source_system?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "raw_telemetry_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_tickets: {
        Row: {
          id: string
          ingested_at: string
          organization_id: string
          processed_at: string | null
          processed_status: boolean
          raw_payload: Json
          source_system: string | null
        }
        Insert: {
          id?: string
          ingested_at?: string
          organization_id: string
          processed_at?: string | null
          processed_status?: boolean
          raw_payload: Json
          source_system?: string | null
        }
        Update: {
          id?: string
          ingested_at?: string
          organization_id?: string
          processed_at?: string | null
          processed_status?: boolean
          raw_payload?: Json
          source_system?: string | null
        }
        Relationships: []
      }
      raw_traffic_incidents: {
        Row: {
          id: string
          ingested_at: string
          organization_id: string
          processed_at: string | null
          processed_status: boolean
          raw_payload: Json
          source_system: string | null
        }
        Insert: {
          id?: string
          ingested_at?: string
          organization_id: string
          processed_at?: string | null
          processed_status?: boolean
          raw_payload: Json
          source_system?: string | null
        }
        Update: {
          id?: string
          ingested_at?: string
          organization_id?: string
          processed_at?: string | null
          processed_status?: boolean
          raw_payload?: Json
          source_system?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "raw_traffic_incidents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_transactions: {
        Row: {
          id: string
          ingested_at: string
          organization_id: string
          processed_at: string | null
          processed_status: boolean
          raw_payload: Json
          source_system: string | null
        }
        Insert: {
          id?: string
          ingested_at?: string
          organization_id: string
          processed_at?: string | null
          processed_status?: boolean
          raw_payload: Json
          source_system?: string | null
        }
        Update: {
          id?: string
          ingested_at?: string
          organization_id?: string
          processed_at?: string | null
          processed_status?: boolean
          raw_payload?: Json
          source_system?: string | null
        }
        Relationships: []
      }
      raw_weather_conditions: {
        Row: {
          id: string
          ingested_at: string
          organization_id: string
          processed_at: string | null
          processed_status: boolean
          raw_payload: Json
          source_system: string | null
        }
        Insert: {
          id?: string
          ingested_at?: string
          organization_id: string
          processed_at?: string | null
          processed_status?: boolean
          raw_payload: Json
          source_system?: string | null
        }
        Update: {
          id?: string
          ingested_at?: string
          organization_id?: string
          processed_at?: string | null
          processed_status?: boolean
          raw_payload?: Json
          source_system?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "raw_weather_conditions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_orgs: { Args: never; Returns: string[] }
      has_role: {
        Args: {
          _org_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "operator" | "viewer"
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
      app_role: ["admin", "operator", "viewer"],
    },
  },
} as const
