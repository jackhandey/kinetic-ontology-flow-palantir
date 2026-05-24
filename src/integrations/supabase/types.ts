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
      action_requests: {
        Row: {
          action_type_id: string
          approved_at: string | null
          approver_id: string | null
          dispatch_response: Json | null
          dispatched_at: string | null
          id: string
          organization_id: string
          payload: Json
          rejection_reason: string | null
          requested_at: string
          requested_by: string
          status: Database["public"]["Enums"]["action_request_status"]
          target_object_id: string
        }
        Insert: {
          action_type_id: string
          approved_at?: string | null
          approver_id?: string | null
          dispatch_response?: Json | null
          dispatched_at?: string | null
          id?: string
          organization_id: string
          payload?: Json
          rejection_reason?: string | null
          requested_at?: string
          requested_by: string
          status?: Database["public"]["Enums"]["action_request_status"]
          target_object_id: string
        }
        Update: {
          action_type_id?: string
          approved_at?: string | null
          approver_id?: string | null
          dispatch_response?: Json | null
          dispatched_at?: string | null
          id?: string
          organization_id?: string
          payload?: Json
          rejection_reason?: string | null
          requested_at?: string
          requested_by?: string
          status?: Database["public"]["Enums"]["action_request_status"]
          target_object_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_requests_action_type_id_fkey"
            columns: ["action_type_id"]
            isOneToOne: false
            referencedRelation: "action_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      action_types: {
        Row: {
          api_name: string
          created_at: string
          description: string | null
          display_name: string
          enabled: boolean
          id: string
          organization_id: string
          payload_schema: Json | null
          requires_approval_rule: Json | null
          rpc_function: string | null
          target_object_type: string
          validation_rules: Json
          webhook_url: string | null
        }
        Insert: {
          api_name: string
          created_at?: string
          description?: string | null
          display_name: string
          enabled?: boolean
          id?: string
          organization_id: string
          payload_schema?: Json | null
          requires_approval_rule?: Json | null
          rpc_function?: string | null
          target_object_type: string
          validation_rules?: Json
          webhook_url?: string | null
        }
        Update: {
          api_name?: string
          created_at?: string
          description?: string | null
          display_name?: string
          enabled?: boolean
          id?: string
          organization_id?: string
          payload_schema?: Json | null
          requires_approval_rule?: Json | null
          rpc_function?: string | null
          target_object_type?: string
          validation_rules?: Json
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "action_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      aip_function_invocations: {
        Row: {
          aip_function_id: string
          error: string | null
          id: string
          input: Json
          invoked_at: string
          invoked_by: string | null
          latency_ms: number | null
          model: string | null
          organization_id: string
          output: Json | null
          status: Database["public"]["Enums"]["aip_invocation_status"]
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          aip_function_id: string
          error?: string | null
          id?: string
          input: Json
          invoked_at?: string
          invoked_by?: string | null
          latency_ms?: number | null
          model?: string | null
          organization_id: string
          output?: Json | null
          status?: Database["public"]["Enums"]["aip_invocation_status"]
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          aip_function_id?: string
          error?: string | null
          id?: string
          input?: Json
          invoked_at?: string
          invoked_by?: string | null
          latency_ms?: number | null
          model?: string | null
          organization_id?: string
          output?: Json | null
          status?: Database["public"]["Enums"]["aip_invocation_status"]
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "aip_function_invocations_aip_function_id_fkey"
            columns: ["aip_function_id"]
            isOneToOne: false
            referencedRelation: "aip_functions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aip_function_invocations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      aip_functions: {
        Row: {
          api_name: string
          created_at: string
          description: string | null
          display_name: string
          enabled: boolean
          id: string
          input_schema: Json
          model: string
          organization_id: string
          output_schema: Json
          system_prompt: string
        }
        Insert: {
          api_name: string
          created_at?: string
          description?: string | null
          display_name: string
          enabled?: boolean
          id?: string
          input_schema?: Json
          model?: string
          organization_id: string
          output_schema?: Json
          system_prompt: string
        }
        Update: {
          api_name?: string
          created_at?: string
          description?: string | null
          display_name?: string
          enabled?: boolean
          id?: string
          input_schema?: Json
          model?: string
          organization_id?: string
          output_schema?: Json
          system_prompt?: string
        }
        Relationships: [
          {
            foreignKeyName: "aip_functions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          diff: Json
          id: string
          object_id: string
          object_type: string
          organization_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          diff?: Json
          id?: string
          object_id: string
          object_type: string
          organization_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          diff?: Json
          id?: string
          object_id?: string
          object_type?: string
          organization_id?: string
        }
        Relationships: []
      }
      classification_markings: {
        Row: {
          code: string
          color: string | null
          created_at: string
          description: string | null
          id: string
          organization_id: string
        }
        Insert: {
          code: string
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          organization_id: string
        }
        Update: {
          code?: string
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "classification_markings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      object_markings: {
        Row: {
          created_at: string
          id: string
          marking_id: string
          object_id: string
          object_type: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          marking_id: string
          object_id: string
          object_type: string
          organization_id: string
        }
        Update: {
          created_at?: string
          id?: string
          marking_id?: string
          object_id?: string
          object_type?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "object_markings_marking_id_fkey"
            columns: ["marking_id"]
            isOneToOne: false
            referencedRelation: "classification_markings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "object_markings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
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
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
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
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
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
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          source_asset_id?: string
        }
        Relationships: []
      }
      ontology_link_types: {
        Row: {
          api_name: string
          cardinality: Database["public"]["Enums"]["ontology_cardinality"]
          display_name: string
          from_object_type_id: string
          id: string
          organization_id: string
          to_object_type_id: string
        }
        Insert: {
          api_name: string
          cardinality?: Database["public"]["Enums"]["ontology_cardinality"]
          display_name: string
          from_object_type_id: string
          id?: string
          organization_id: string
          to_object_type_id: string
        }
        Update: {
          api_name?: string
          cardinality?: Database["public"]["Enums"]["ontology_cardinality"]
          display_name?: string
          from_object_type_id?: string
          id?: string
          organization_id?: string
          to_object_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ontology_link_types_from_object_type_id_fkey"
            columns: ["from_object_type_id"]
            isOneToOne: false
            referencedRelation: "ontology_object_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ontology_link_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ontology_link_types_to_object_type_id_fkey"
            columns: ["to_object_type_id"]
            isOneToOne: false
            referencedRelation: "ontology_object_types"
            referencedColumns: ["id"]
          },
        ]
      }
      ontology_object_links: {
        Row: {
          created_at: string
          from_object_id: string
          id: string
          link_type_id: string
          organization_id: string
          to_object_id: string
        }
        Insert: {
          created_at?: string
          from_object_id: string
          id?: string
          link_type_id: string
          organization_id: string
          to_object_id: string
        }
        Update: {
          created_at?: string
          from_object_id?: string
          id?: string
          link_type_id?: string
          organization_id?: string
          to_object_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ontology_object_links_link_type_id_fkey"
            columns: ["link_type_id"]
            isOneToOne: false
            referencedRelation: "ontology_link_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ontology_object_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ontology_object_types: {
        Row: {
          api_name: string
          created_at: string
          description: string | null
          display_name: string
          icon: string | null
          id: string
          organization_id: string
          primary_key_field: string
          title_field: string
        }
        Insert: {
          api_name: string
          created_at?: string
          description?: string | null
          display_name: string
          icon?: string | null
          id?: string
          organization_id: string
          primary_key_field?: string
          title_field?: string
        }
        Update: {
          api_name?: string
          created_at?: string
          description?: string | null
          display_name?: string
          icon?: string | null
          id?: string
          organization_id?: string
          primary_key_field?: string
          title_field?: string
        }
        Relationships: [
          {
            foreignKeyName: "ontology_object_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ontology_properties: {
        Row: {
          api_name: string
          data_type: Database["public"]["Enums"]["ontology_data_type"]
          display_name: string
          id: string
          object_type_id: string
          required: boolean
          sensitivity: string | null
        }
        Insert: {
          api_name: string
          data_type: Database["public"]["Enums"]["ontology_data_type"]
          display_name: string
          id?: string
          object_type_id: string
          required?: boolean
          sensitivity?: string | null
        }
        Update: {
          api_name?: string
          data_type?: Database["public"]["Enums"]["ontology_data_type"]
          display_name?: string
          id?: string
          object_type_id?: string
          required?: boolean
          sensitivity?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ontology_properties_object_type_id_fkey"
            columns: ["object_type_id"]
            isOneToOne: false
            referencedRelation: "ontology_object_types"
            referencedColumns: ["id"]
          },
        ]
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
      pipeline_runs: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          log: Json
          organization_id: string
          pipeline_id: string
          rows_in: number
          rows_out: number
          started_at: string
          status: Database["public"]["Enums"]["pipeline_run_status"]
          triggered_by: string | null
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          log?: Json
          organization_id: string
          pipeline_id: string
          rows_in?: number
          rows_out?: number
          started_at?: string
          status?: Database["public"]["Enums"]["pipeline_run_status"]
          triggered_by?: string | null
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          log?: Json
          organization_id?: string
          pipeline_id?: string
          rows_in?: number
          rows_out?: number
          started_at?: string
          status?: Database["public"]["Enums"]["pipeline_run_status"]
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_runs_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          name: string
          organization_id: string
          schedule_cron: string | null
          source_table: string
          target_object_type: string
          transform_sql: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          name: string
          organization_id: string
          schedule_cron?: string | null
          source_table: string
          target_object_type: string
          transform_sql?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          name?: string
          organization_id?: string
          schedule_cron?: string | null
          source_table?: string
          target_object_type?: string
          transform_sql?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipelines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
      schema_proposals: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          organization_id: string
          proposal: Json
          proposed_by: string | null
          rationale: string | null
          source: string
          status: Database["public"]["Enums"]["schema_proposal_status"]
          title: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          organization_id: string
          proposal?: Json
          proposed_by?: string | null
          rationale?: string | null
          source: string
          status?: Database["public"]["Enums"]["schema_proposal_status"]
          title: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          organization_id?: string
          proposal?: Json
          proposed_by?: string | null
          rationale?: string | null
          source?: string
          status?: Database["public"]["Enums"]["schema_proposal_status"]
          title?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          id: string
          organization_id: string
          priority: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          organization_id: string
          priority?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          organization_id?: string
          priority?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_marking_grants: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          marking_id: string
          organization_id: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          marking_id: string
          organization_id: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          marking_id?: string
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_marking_grants_marking_id_fkey"
            columns: ["marking_id"]
            isOneToOne: false
            referencedRelation: "classification_markings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_marking_grants_organization_id_fkey"
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
      bulk_set_task_status: {
        Args: { _ids: string[]; _status: string }
        Returns: number
      }
      current_user_orgs: { Args: never; Returns: string[] }
      has_role: {
        Args: {
          _org_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      mark_task_complete: {
        Args: { _alert_id: string }
        Returns: {
          completed_at: string | null
          created_at: string
          description: string | null
          id: string
          organization_id: string
          priority: string
          status: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_ontology_alert: {
        Args: { _alert_id: string; _resolution_note?: string }
        Returns: {
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
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          source_asset_id: string
        }
        SetofOptions: {
          from: "*"
          to: "ontology_alerts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_task_priority: {
        Args: { _alert_id: string; _level: string }
        Returns: {
          completed_at: string | null
          created_at: string
          description: string | null
          id: string
          organization_id: string
          priority: string
          status: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      user_has_marking: {
        Args: { _marking_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      action_request_status:
        | "pending_approval"
        | "approved"
        | "rejected"
        | "dispatched"
        | "failed"
        | "succeeded"
      aip_invocation_status: "pending" | "succeeded" | "failed"
      app_role: "admin" | "operator" | "viewer"
      ontology_cardinality: "one_to_one" | "one_to_many" | "many_to_many"
      ontology_data_type:
        | "string"
        | "number"
        | "bool"
        | "datetime"
        | "geo"
        | "enum"
        | "json"
      pipeline_run_status: "pending" | "running" | "succeeded" | "failed"
      schema_proposal_status: "pending" | "promoted" | "rejected"
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
      action_request_status: [
        "pending_approval",
        "approved",
        "rejected",
        "dispatched",
        "failed",
        "succeeded",
      ],
      aip_invocation_status: ["pending", "succeeded", "failed"],
      app_role: ["admin", "operator", "viewer"],
      ontology_cardinality: ["one_to_one", "one_to_many", "many_to_many"],
      ontology_data_type: [
        "string",
        "number",
        "bool",
        "datetime",
        "geo",
        "enum",
        "json",
      ],
      pipeline_run_status: ["pending", "running", "succeeded", "failed"],
      schema_proposal_status: ["pending", "promoted", "rejected"],
    },
  },
} as const
