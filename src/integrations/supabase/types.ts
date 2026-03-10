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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activity_events: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          note: string | null
          organization_id: string
          touch_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          note?: string | null
          organization_id: string
          touch_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          note?: string | null
          organization_id?: string
          touch_type?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_audit_events: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          id: string
          metadata: Json | null
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      agent_clients: {
        Row: {
          agent_user_id: string
          client_identity_id: string
          created_at: string
          fub_contact_id: string | null
          id: string
        }
        Insert: {
          agent_user_id: string
          client_identity_id: string
          created_at?: string
          fub_contact_id?: string | null
          id?: string
        }
        Update: {
          agent_user_id?: string
          client_identity_id?: string
          created_at?: string
          fub_contact_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_clients_client_identity_id_fkey"
            columns: ["client_identity_id"]
            isOneToOne: false
            referencedRelation: "client_identities"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_intelligence_profile: {
        Row: {
          active_days_last_30: number
          avg_daily_actions: number
          avg_response_time_bucket: string | null
          avg_time_to_close_bucket: string | null
          best_time_of_day_bucket: string | null
          created_at: string
          deal_close_rate_estimate: number
          income_trend: string
          last_updated: string
          lead_conversion_rate_estimate: number
          preferred_channel_call_pct: number
          preferred_channel_email_pct: number
          preferred_channel_text_pct: number
          risk_tolerance: string
          stability_trend: string
          user_id: string
        }
        Insert: {
          active_days_last_30?: number
          avg_daily_actions?: number
          avg_response_time_bucket?: string | null
          avg_time_to_close_bucket?: string | null
          best_time_of_day_bucket?: string | null
          created_at?: string
          deal_close_rate_estimate?: number
          income_trend?: string
          last_updated?: string
          lead_conversion_rate_estimate?: number
          preferred_channel_call_pct?: number
          preferred_channel_email_pct?: number
          preferred_channel_text_pct?: number
          risk_tolerance?: string
          stability_trend?: string
          user_id: string
        }
        Update: {
          active_days_last_30?: number
          avg_daily_actions?: number
          avg_response_time_bucket?: string | null
          avg_time_to_close_bucket?: string | null
          best_time_of_day_bucket?: string | null
          created_at?: string
          deal_close_rate_estimate?: number
          income_trend?: string
          last_updated?: string
          lead_conversion_rate_estimate?: number
          preferred_channel_call_pct?: number
          preferred_channel_email_pct?: number
          preferred_channel_text_pct?: number
          risk_tolerance?: string
          stability_trend?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_follow_up_drafts: {
        Row: {
          body: string
          context_summary: string | null
          created_at: string
          draft_type: string
          entity_id: string
          entity_type: string
          id: string
          sent_at: string | null
          status: string
          subject: string | null
          tone: string | null
          user_id: string
        }
        Insert: {
          body: string
          context_summary?: string | null
          created_at?: string
          draft_type?: string
          entity_id: string
          entity_type: string
          id?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          tone?: string | null
          user_id: string
        }
        Update: {
          body?: string
          context_summary?: string | null
          created_at?: string
          draft_type?: string
          entity_id?: string
          entity_type?: string
          id?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          tone?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ai_usage_log: {
        Row: {
          created_at: string
          function_name: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          function_name: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          function_name?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      alerts: {
        Row: {
          created_at: string
          detail: string | null
          expires_at: string
          id: string
          organization_id: string | null
          related_deal_id: string | null
          related_lead_id: string | null
          seed_batch_id: string | null
          seeded: boolean
          title: string
          type: Database["public"]["Enums"]["alert_type"]
        }
        Insert: {
          created_at?: string
          detail?: string | null
          expires_at?: string
          id?: string
          organization_id?: string | null
          related_deal_id?: string | null
          related_lead_id?: string | null
          seed_batch_id?: string | null
          seeded?: boolean
          title: string
          type?: Database["public"]["Enums"]["alert_type"]
        }
        Update: {
          created_at?: string
          detail?: string | null
          expires_at?: string
          id?: string
          organization_id?: string | null
          related_deal_id?: string | null
          related_lead_id?: string | null
          seed_batch_id?: string | null
          seeded?: boolean
          title?: string
          type?: Database["public"]["Enums"]["alert_type"]
        }
        Relationships: [
          {
            foreignKeyName: "alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_related_deal_id_fkey"
            columns: ["related_deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_related_lead_id_fkey"
            columns: ["related_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      client_identities: {
        Row: {
          created_at: string
          email_normalized: string
          email_original: string | null
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email_normalized: string
          email_original?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email_normalized?: string
          email_original?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      client_market_analyses: {
        Row: {
          activity_count: number
          agent_user_id: string
          analysis_json: Json
          client_identity_id: string
          created_at: string
          id: string
          model_used: string | null
          updated_at: string
        }
        Insert: {
          activity_count?: number
          agent_user_id: string
          analysis_json?: Json
          client_identity_id: string
          created_at?: string
          id?: string
          model_used?: string | null
          updated_at?: string
        }
        Update: {
          activity_count?: number
          agent_user_id?: string
          analysis_json?: Json
          client_identity_id?: string
          created_at?: string
          id?: string
          model_used?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_market_analyses_client_identity_id_fkey"
            columns: ["client_identity_id"]
            isOneToOne: false
            referencedRelation: "client_identities"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_defaults: {
        Row: {
          created_at: string
          default_commission_rate: number | null
          default_referral_fee: number | null
          default_split: number | null
          id: string
          typical_price_mid: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_commission_rate?: number | null
          default_referral_fee?: number | null
          default_split?: number | null
          id?: string
          typical_price_mid?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          default_commission_rate?: number | null
          default_referral_fee?: number | null
          default_split?: number | null
          id?: string
          typical_price_mid?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      crm_integrations: {
        Row: {
          api_key_encrypted: string | null
          api_key_last4: string | null
          created_at: string
          id: string
          last_validated_at: string | null
          provider: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key_encrypted?: string | null
          api_key_last4?: string | null
          created_at?: string
          id?: string
          last_validated_at?: string | null
          provider?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key_encrypted?: string | null
          api_key_last4?: string | null
          created_at?: string
          id?: string
          last_validated_at?: string | null
          provider?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      deal_participants: {
        Row: {
          commission_override: number | null
          created_at: string
          deal_id: string
          id: string
          role: Database["public"]["Enums"]["participant_role"]
          split_percent: number
          user_id: string
        }
        Insert: {
          commission_override?: number | null
          created_at?: string
          deal_id: string
          id?: string
          role?: Database["public"]["Enums"]["participant_role"]
          split_percent?: number
          user_id: string
        }
        Update: {
          commission_override?: number | null
          created_at?: string
          deal_id?: string
          id?: string
          role?: Database["public"]["Enums"]["participant_role"]
          split_percent?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_participants_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          assigned_to_user_id: string | null
          cancelled_at: string | null
          close_date: string
          closed_at: string | null
          commission_amount: number
          commission_rate: number | null
          created_at: string
          id: string
          import_run_id: string | null
          imported_at: string | null
          imported_from: string | null
          last_modified_at: string | null
          last_modified_by: string | null
          last_touched_at: string | null
          milestone_appraisal: string | null
          milestone_financing: string | null
          milestone_inspection: string | null
          organization_id: string | null
          outcome_note: string | null
          price: number
          referral_fee_percent: number | null
          removed_from_fub: boolean
          removed_from_fub_at: string | null
          risk_flags: string[] | null
          risk_level: Database["public"]["Enums"]["risk_level"]
          seed_batch_id: string | null
          seeded: boolean
          side: string
          stage: Database["public"]["Enums"]["deal_stage"]
          title: string
        }
        Insert: {
          assigned_to_user_id?: string | null
          cancelled_at?: string | null
          close_date?: string
          closed_at?: string | null
          commission_amount?: number
          commission_rate?: number | null
          created_at?: string
          id?: string
          import_run_id?: string | null
          imported_at?: string | null
          imported_from?: string | null
          last_modified_at?: string | null
          last_modified_by?: string | null
          last_touched_at?: string | null
          milestone_appraisal?: string | null
          milestone_financing?: string | null
          milestone_inspection?: string | null
          organization_id?: string | null
          outcome_note?: string | null
          price?: number
          referral_fee_percent?: number | null
          removed_from_fub?: boolean
          removed_from_fub_at?: string | null
          risk_flags?: string[] | null
          risk_level?: Database["public"]["Enums"]["risk_level"]
          seed_batch_id?: string | null
          seeded?: boolean
          side?: string
          stage?: Database["public"]["Enums"]["deal_stage"]
          title: string
        }
        Update: {
          assigned_to_user_id?: string | null
          cancelled_at?: string | null
          close_date?: string
          closed_at?: string | null
          commission_amount?: number
          commission_rate?: number | null
          created_at?: string
          id?: string
          import_run_id?: string | null
          imported_at?: string | null
          imported_from?: string | null
          last_modified_at?: string | null
          last_modified_by?: string | null
          last_touched_at?: string | null
          milestone_appraisal?: string | null
          milestone_financing?: string | null
          milestone_inspection?: string | null
          organization_id?: string | null
          outcome_note?: string | null
          price?: number
          referral_fee_percent?: number | null
          removed_from_fub?: boolean
          removed_from_fub_at?: string | null
          risk_flags?: string[] | null
          risk_level?: Database["public"]["Enums"]["risk_level"]
          seed_batch_id?: string | null
          seeded?: boolean
          side?: string
          stage?: Database["public"]["Enums"]["deal_stage"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fub_activity_log: {
        Row: {
          activity_type: string
          body_preview: string | null
          direction: string | null
          duration_seconds: number | null
          entity_id: string | null
          entity_type: string
          fub_id: string
          id: string
          occurred_at: string
          subject: string | null
          synced_at: string
          user_id: string
        }
        Insert: {
          activity_type: string
          body_preview?: string | null
          direction?: string | null
          duration_seconds?: number | null
          entity_id?: string | null
          entity_type: string
          fub_id: string
          id?: string
          occurred_at: string
          subject?: string | null
          synced_at?: string
          user_id: string
        }
        Update: {
          activity_type?: string
          body_preview?: string | null
          direction?: string | null
          duration_seconds?: number | null
          entity_id?: string | null
          entity_type?: string
          fub_id?: string
          id?: string
          occurred_at?: string
          subject?: string | null
          synced_at?: string
          user_id?: string
        }
        Relationships: []
      }
      fub_appointments: {
        Row: {
          attendees: Json | null
          description: string | null
          end_at: string | null
          fub_id: string
          id: string
          location: string | null
          related_deal_id: string | null
          related_lead_id: string | null
          start_at: string
          synced_at: string
          title: string
          user_id: string
        }
        Insert: {
          attendees?: Json | null
          description?: string | null
          end_at?: string | null
          fub_id: string
          id?: string
          location?: string | null
          related_deal_id?: string | null
          related_lead_id?: string | null
          start_at: string
          synced_at?: string
          title?: string
          user_id: string
        }
        Update: {
          attendees?: Json | null
          description?: string | null
          end_at?: string | null
          fub_id?: string
          id?: string
          location?: string | null
          related_deal_id?: string | null
          related_lead_id?: string | null
          start_at?: string
          synced_at?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      fub_conflict_resolutions: {
        Row: {
          accepted_fields: string[] | null
          delta_check_at: string | null
          entity_id: string | null
          entity_type: string
          fub_id: string | null
          id: string
          resolution: string
          resolved_at: string
          user_id: string
        }
        Insert: {
          accepted_fields?: string[] | null
          delta_check_at?: string | null
          entity_id?: string | null
          entity_type: string
          fub_id?: string | null
          id?: string
          resolution: string
          resolved_at?: string
          user_id: string
        }
        Update: {
          accepted_fields?: string[] | null
          delta_check_at?: string | null
          entity_id?: string | null
          entity_type?: string
          fub_id?: string | null
          id?: string
          resolution?: string
          resolved_at?: string
          user_id?: string
        }
        Relationships: []
      }
      fub_ignored_changes: {
        Row: {
          entity_type: string
          expires_at: string
          field_rule: Json | null
          fub_id: string
          id: string
          ignored_at: string
          scope: string
          user_id: string
        }
        Insert: {
          entity_type: string
          expires_at?: string
          field_rule?: Json | null
          fub_id: string
          id?: string
          ignored_at?: string
          scope?: string
          user_id: string
        }
        Update: {
          entity_type?: string
          expires_at?: string
          field_rule?: Json | null
          fub_id?: string
          id?: string
          ignored_at?: string
          scope?: string
          user_id?: string
        }
        Relationships: []
      }
      fub_import_runs: {
        Row: {
          committed_at: string | null
          committed_counts: Json | null
          created_at: string
          duration_ms: number | null
          id: string
          mapping_version: number
          notes: string | null
          source_counts: Json | null
          status: string
          undone_at: string | null
          undone_by: string | null
          user_id: string
        }
        Insert: {
          committed_at?: string | null
          committed_counts?: Json | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          mapping_version?: number
          notes?: string | null
          source_counts?: Json | null
          status?: string
          undone_at?: string | null
          undone_by?: string | null
          user_id: string
        }
        Update: {
          committed_at?: string | null
          committed_counts?: Json | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          mapping_version?: number
          notes?: string | null
          source_counts?: Json | null
          status?: string
          undone_at?: string | null
          undone_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      fub_push_log: {
        Row: {
          action: string
          entity_id: string
          entity_type: string
          error_message: string | null
          fields_pushed: Json | null
          fub_id: string | null
          id: string
          pushed_at: string
          status: string
          user_id: string
        }
        Insert: {
          action: string
          entity_id: string
          entity_type: string
          error_message?: string | null
          fields_pushed?: Json | null
          fub_id?: string | null
          id?: string
          pushed_at?: string
          status?: string
          user_id: string
        }
        Update: {
          action?: string
          entity_id?: string
          entity_type?: string
          error_message?: string | null
          fields_pushed?: Json | null
          fub_id?: string | null
          id?: string
          pushed_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      fub_staged_deals: {
        Row: {
          created_at: string
          fub_id: string
          id: string
          import_run_id: string
          mapping_version: number
          match_status: string
          matched_deal_id: string | null
          normalized: Json
          payload: Json
          resolution: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          fub_id: string
          id?: string
          import_run_id: string
          mapping_version?: number
          match_status?: string
          matched_deal_id?: string | null
          normalized?: Json
          payload?: Json
          resolution?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          fub_id?: string
          id?: string
          import_run_id?: string
          mapping_version?: number
          match_status?: string
          matched_deal_id?: string | null
          normalized?: Json
          payload?: Json
          resolution?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fub_staged_deals_import_run_id_fkey"
            columns: ["import_run_id"]
            isOneToOne: false
            referencedRelation: "fub_import_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      fub_staged_leads: {
        Row: {
          created_at: string
          fub_id: string
          id: string
          import_run_id: string
          mapping_version: number
          match_status: string
          matched_lead_id: string | null
          normalized: Json
          payload: Json
          resolution: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          fub_id: string
          id?: string
          import_run_id: string
          mapping_version?: number
          match_status?: string
          matched_lead_id?: string | null
          normalized?: Json
          payload?: Json
          resolution?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          fub_id?: string
          id?: string
          import_run_id?: string
          mapping_version?: number
          match_status?: string
          matched_lead_id?: string | null
          normalized?: Json
          payload?: Json
          resolution?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fub_staged_leads_import_run_id_fkey"
            columns: ["import_run_id"]
            isOneToOne: false
            referencedRelation: "fub_import_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      fub_staged_tasks: {
        Row: {
          created_at: string
          fub_id: string
          id: string
          import_run_id: string
          mapping_version: number
          match_status: string
          matched_task_id: string | null
          normalized: Json
          payload: Json
          resolution: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          fub_id: string
          id?: string
          import_run_id: string
          mapping_version?: number
          match_status?: string
          matched_task_id?: string | null
          normalized?: Json
          payload?: Json
          resolution?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          fub_id?: string
          id?: string
          import_run_id?: string
          mapping_version?: number
          match_status?: string
          matched_task_id?: string | null
          normalized?: Json
          payload?: Json
          resolution?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fub_staged_tasks_import_run_id_fkey"
            columns: ["import_run_id"]
            isOneToOne: false
            referencedRelation: "fub_import_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      fub_sync_state: {
        Row: {
          drift_reason: string | null
          last_commit_at: string | null
          last_delta_check_at: string | null
          last_delta_summary: Json | null
          last_preview_at: string | null
          last_seen_fub_updated_at: string | null
          last_stage_at: string | null
          last_successful_check_at: string | null
          last_validated_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          drift_reason?: string | null
          last_commit_at?: string | null
          last_delta_check_at?: string | null
          last_delta_summary?: Json | null
          last_preview_at?: string | null
          last_seen_fub_updated_at?: string | null
          last_stage_at?: string | null
          last_successful_check_at?: string | null
          last_validated_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          drift_reason?: string | null
          last_commit_at?: string | null
          last_delta_check_at?: string | null
          last_delta_summary?: Json | null
          last_preview_at?: string | null
          last_seen_fub_updated_at?: string | null
          last_stage_at?: string | null
          last_successful_check_at?: string | null
          last_validated_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      fub_watchlist: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string
          fub_id: string | null
          id: string
          label: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type: string
          fub_id?: string | null
          id?: string
          label?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          fub_id?: string | null
          id?: string
          label?: string
          user_id?: string
        }
        Relationships: []
      }
      fub_webhook_events: {
        Row: {
          created_at: string
          entity_type: string | null
          event_type: string
          fub_id: string | null
          id: string
          payload: Json
          processed: boolean
          processed_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_type?: string | null
          event_type: string
          fub_id?: string | null
          id?: string
          payload?: Json
          processed?: boolean
          processed_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          entity_type?: string | null
          event_type?: string
          fub_id?: string | null
          id?: string
          payload?: Json
          processed?: boolean
          processed_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      import_dedup_rules: {
        Row: {
          deal_address_match: boolean
          deal_title_close_date: boolean
          id: string
          lead_email_match: boolean
          lead_name_fuzzy: boolean
          lead_phone_match: boolean
          task_title_due_date: boolean
          task_title_only: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          deal_address_match?: boolean
          deal_title_close_date?: boolean
          id?: string
          lead_email_match?: boolean
          lead_name_fuzzy?: boolean
          lead_phone_match?: boolean
          task_title_due_date?: boolean
          task_title_only?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          deal_address_match?: boolean
          deal_title_close_date?: boolean
          id?: string
          lead_email_match?: boolean
          lead_name_fuzzy?: boolean
          lead_phone_match?: boolean
          task_title_due_date?: boolean
          task_title_only?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      intel_briefs: {
        Row: {
          activity_count: number
          brief_json: Json
          created_at: string
          entity_id: string
          entity_type: string
          generated_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_count?: number
          brief_json?: Json
          created_at?: string
          entity_id: string
          entity_type?: string
          generated_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_count?: number
          brief_json?: Json
          created_at?: string
          entity_id?: string
          entity_type?: string
          generated_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lead_routing_rules: {
        Row: {
          created_at: string
          criteria: Json
          enabled: boolean
          id: string
          organization_id: string
          priority: number
          rule_name: string
          target_user_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          criteria?: Json
          enabled?: boolean
          id?: string
          organization_id: string
          priority?: number
          rule_name: string
          target_user_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          criteria?: Json
          enabled?: boolean
          id?: string
          organization_id?: string
          priority?: number
          rule_name?: string
          target_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          assigned_to_user_id: string | null
          converted_at: string | null
          created_at: string
          engagement_score: number
          id: string
          import_run_id: string | null
          imported_at: string | null
          imported_from: string | null
          last_activity_at: string | null
          last_contact_at: string
          last_modified_at: string | null
          last_modified_by: string | null
          last_touched_at: string | null
          lead_temperature:
            | Database["public"]["Enums"]["lead_temperature"]
            | null
          lost_at: string | null
          name: string
          notes: string | null
          organization_id: string | null
          outcome_note: string | null
          removed_from_fub: boolean
          removed_from_fub_at: string | null
          seed_batch_id: string | null
          seeded: boolean
          snooze_until: string | null
          source: string
          status_tags: string[] | null
        }
        Insert: {
          assigned_to_user_id?: string | null
          converted_at?: string | null
          created_at?: string
          engagement_score?: number
          id?: string
          import_run_id?: string | null
          imported_at?: string | null
          imported_from?: string | null
          last_activity_at?: string | null
          last_contact_at?: string
          last_modified_at?: string | null
          last_modified_by?: string | null
          last_touched_at?: string | null
          lead_temperature?:
            | Database["public"]["Enums"]["lead_temperature"]
            | null
          lost_at?: string | null
          name: string
          notes?: string | null
          organization_id?: string | null
          outcome_note?: string | null
          removed_from_fub?: boolean
          removed_from_fub_at?: string | null
          seed_batch_id?: string | null
          seeded?: boolean
          snooze_until?: string | null
          source?: string
          status_tags?: string[] | null
        }
        Update: {
          assigned_to_user_id?: string | null
          converted_at?: string | null
          created_at?: string
          engagement_score?: number
          id?: string
          import_run_id?: string | null
          imported_at?: string | null
          imported_from?: string | null
          last_activity_at?: string | null
          last_contact_at?: string
          last_modified_at?: string | null
          last_modified_by?: string | null
          last_touched_at?: string | null
          lead_temperature?:
            | Database["public"]["Enums"]["lead_temperature"]
            | null
          lost_at?: string | null
          name?: string
          notes?: string | null
          organization_id?: string | null
          outcome_note?: string | null
          removed_from_fub?: boolean
          removed_from_fub_at?: string | null
          seed_batch_id?: string | null
          seeded?: boolean
          snooze_until?: string | null
          source?: string
          status_tags?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      network_benchmarks: {
        Row: {
          cohort_key: string
          cohort_size: number
          created_at: string
          id: string
          metrics: Json
          period: string
          window_end: string
          window_start: string
        }
        Insert: {
          cohort_key: string
          cohort_size: number
          created_at?: string
          id?: string
          metrics?: Json
          period: string
          window_end: string
          window_start: string
        }
        Update: {
          cohort_key?: string
          cohort_size?: number
          created_at?: string
          id?: string
          metrics?: Json
          period?: string
          window_end?: string
          window_start?: string
        }
        Relationships: []
      }
      network_participation: {
        Row: {
          opted_in: boolean
          opted_in_at: string | null
          show_playbooks: boolean
          updated_at: string
          use_network_priors: boolean
          user_id: string
        }
        Insert: {
          opted_in?: boolean
          opted_in_at?: string | null
          show_playbooks?: boolean
          updated_at?: string
          use_network_priors?: boolean
          user_id: string
        }
        Update: {
          opted_in?: boolean
          opted_in_at?: string | null
          show_playbooks?: boolean
          updated_at?: string
          use_network_priors?: boolean
          user_id?: string
        }
        Relationships: []
      }
      network_playbook_templates: {
        Row: {
          created_at: string
          description: string
          eligible_cohort_min: number
          id: string
          required_signals: Json
          situation_key: string
        }
        Insert: {
          created_at?: string
          description: string
          eligible_cohort_min?: number
          id?: string
          required_signals?: Json
          situation_key: string
        }
        Update: {
          created_at?: string
          description?: string
          eligible_cohort_min?: number
          id?: string
          required_signals?: Json
          situation_key?: string
        }
        Relationships: []
      }
      network_playbooks: {
        Row: {
          cohort_key: string
          cohort_size: number
          confidence_band: string
          created_at: string
          effectiveness_band: string
          guardrails: Json
          id: string
          period: string
          playbook_steps: Json
          situation_key: string
          window_end: string
          window_start: string
        }
        Insert: {
          cohort_key: string
          cohort_size: number
          confidence_band: string
          created_at?: string
          effectiveness_band: string
          guardrails?: Json
          id?: string
          period: string
          playbook_steps?: Json
          situation_key: string
          window_end: string
          window_start: string
        }
        Update: {
          cohort_key?: string
          cohort_size?: number
          confidence_band?: string
          created_at?: string
          effectiveness_band?: string
          guardrails?: Json
          id?: string
          period?: string
          playbook_steps?: Json
          situation_key?: string
          window_end?: string
          window_start?: string
        }
        Relationships: []
      }
      network_telemetry_events: {
        Row: {
          app_version: string
          channel: string | null
          created_at: string
          entity_type: string
          event_type: string
          id: string
          money_bucket: string | null
          opportunity_bucket: string | null
          org_id: string | null
          outcome_bucket: string | null
          region_bucket: string | null
          response_time_bucket: string | null
          risk_bucket: string | null
          stage: string | null
          time_to_action_bucket: string | null
          trigger_bucket: string | null
          user_id: string
          workload_bucket: string | null
        }
        Insert: {
          app_version?: string
          channel?: string | null
          created_at?: string
          entity_type: string
          event_type: string
          id?: string
          money_bucket?: string | null
          opportunity_bucket?: string | null
          org_id?: string | null
          outcome_bucket?: string | null
          region_bucket?: string | null
          response_time_bucket?: string | null
          risk_bucket?: string | null
          stage?: string | null
          time_to_action_bucket?: string | null
          trigger_bucket?: string | null
          user_id: string
          workload_bucket?: string | null
        }
        Update: {
          app_version?: string
          channel?: string | null
          created_at?: string
          entity_type?: string
          event_type?: string
          id?: string
          money_bucket?: string | null
          opportunity_bucket?: string | null
          org_id?: string | null
          outcome_bucket?: string | null
          region_bucket?: string | null
          response_time_bucket?: string | null
          risk_bucket?: string | null
          stage?: string | null
          time_to_action_bucket?: string | null
          trigger_bucket?: string | null
          user_id?: string
          workload_bucket?: string | null
        }
        Relationships: []
      }
      open_house_fields: {
        Row: {
          created_at: string
          field_key: string
          field_label: string
          field_type: string
          id: string
          is_default: boolean
          is_required: boolean
          open_house_id: string
          options: Json | null
          sort_order: number
          user_id: string
        }
        Insert: {
          created_at?: string
          field_key: string
          field_label: string
          field_type?: string
          id?: string
          is_default?: boolean
          is_required?: boolean
          open_house_id: string
          options?: Json | null
          sort_order?: number
          user_id: string
        }
        Update: {
          created_at?: string
          field_key?: string
          field_label?: string
          field_type?: string
          id?: string
          is_default?: boolean
          is_required?: boolean
          open_house_id?: string
          options?: Json | null
          sort_order?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "open_house_fields_open_house_id_fkey"
            columns: ["open_house_id"]
            isOneToOne: false
            referencedRelation: "open_houses"
            referencedColumns: ["id"]
          },
        ]
      }
      open_house_templates: {
        Row: {
          created_at: string
          description: string | null
          fields: Json
          form_settings: Json
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          fields?: Json
          form_settings?: Json
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          fields?: Json
          form_settings?: Json
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      open_house_visitors: {
        Row: {
          created_at: string
          email: string | null
          follow_up_status: string
          fub_contact_id: string | null
          fub_match_status: string | null
          full_name: string
          id: string
          is_existing_contact: boolean
          open_house_id: string
          phone: string | null
          responses: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          follow_up_status?: string
          fub_contact_id?: string | null
          fub_match_status?: string | null
          full_name: string
          id?: string
          is_existing_contact?: boolean
          open_house_id: string
          phone?: string | null
          responses?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          follow_up_status?: string
          fub_contact_id?: string | null
          fub_match_status?: string | null
          full_name?: string
          id?: string
          is_existing_contact?: boolean
          open_house_id?: string
          phone?: string | null
          responses?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "open_house_visitors_open_house_id_fkey"
            columns: ["open_house_id"]
            isOneToOne: false
            referencedRelation: "open_houses"
            referencedColumns: ["id"]
          },
        ]
      }
      open_houses: {
        Row: {
          agent_email: string | null
          agent_name: string | null
          agent_phone: string | null
          agent_role: string
          brokerage: string | null
          created_at: string
          event_date: string | null
          form_settings: Json
          id: string
          intake_token: string
          notes: string | null
          property_address: string
          status: string
          template_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_email?: string | null
          agent_name?: string | null
          agent_phone?: string | null
          agent_role?: string
          brokerage?: string | null
          created_at?: string
          event_date?: string | null
          form_settings?: Json
          id?: string
          intake_token?: string
          notes?: string | null
          property_address: string
          status?: string
          template_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_email?: string | null
          agent_name?: string | null
          agent_phone?: string | null
          agent_role?: string
          brokerage?: string | null
          created_at?: string
          event_date?: string | null
          form_settings?: Json
          id?: string
          intake_token?: string
          notes?: string | null
          property_address?: string
          status?: string
          template_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      organization_intelligence_summary: {
        Row: {
          activity_distribution: Json
          avg_income_forecast: number
          avg_stability_score: number
          created_at: string
          id: string
          last_updated: string
          opportunity_distribution: Json
          organization_id: string
          risk_distribution: Json
          total_agents: number
        }
        Insert: {
          activity_distribution?: Json
          avg_income_forecast?: number
          avg_stability_score?: number
          created_at?: string
          id?: string
          last_updated?: string
          opportunity_distribution?: Json
          organization_id: string
          risk_distribution?: Json
          total_agents?: number
        }
        Update: {
          activity_distribution?: Json
          avg_income_forecast?: number
          avg_stability_score?: number
          created_at?: string
          id?: string
          last_updated?: string
          opportunity_distribution?: Json
          organization_id?: string
          risk_distribution?: Json
          total_agents?: number
        }
        Relationships: [
          {
            foreignKeyName: "organization_intelligence_summary_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_user_id?: string | null
        }
        Relationships: []
      }
      preference_feedback: {
        Row: {
          action: string
          created_at: string
          entity_id: string
          field: string
          id: string
          user_id: string
          value: Json | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id: string
          field: string
          id?: string
          user_id: string
          value?: Json | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string
          field?: string
          id?: string
          user_id?: string
          value?: Json | null
        }
        Relationships: []
      }
      preference_profiles: {
        Row: {
          confidence: number
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          last_computed_at: string
          overrides: Json
          profile: Json
          reasons: Json
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          confidence?: number
          created_at?: string
          entity_id: string
          entity_type?: string
          id?: string
          last_computed_at?: string
          overrides?: Json
          profile?: Json
          reasons?: Json
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          confidence?: number
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          last_computed_at?: string
          overrides?: Json
          profile?: Json
          reasons?: Json
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          command_center_layout: Json | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          email: string
          id: string
          is_deleted: boolean
          is_protected: boolean
          name: string
          notify_daily_brief: boolean
          notify_opportunities: boolean
          notify_overdue_tasks: boolean
          notify_risk_alerts: boolean
          onboarding_completed: boolean
          organization_id: string | null
          status: string
          target_min_price: number | null
          target_zip_codes: string | null
          theme_preference: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          command_center_layout?: Json | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string
          id?: string
          is_deleted?: boolean
          is_protected?: boolean
          name?: string
          notify_daily_brief?: boolean
          notify_opportunities?: boolean
          notify_overdue_tasks?: boolean
          notify_risk_alerts?: boolean
          onboarding_completed?: boolean
          organization_id?: string | null
          status?: string
          target_min_price?: number | null
          target_zip_codes?: string | null
          theme_preference?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          command_center_layout?: Json | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string
          id?: string
          is_deleted?: boolean
          is_protected?: boolean
          name?: string
          notify_daily_brief?: boolean
          notify_opportunities?: boolean
          notify_overdue_tasks?: boolean
          notify_risk_alerts?: boolean
          onboarding_completed?: boolean
          organization_id?: string | null
          status?: string
          target_min_price?: number | null
          target_zip_codes?: string | null
          theme_preference?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      report_share_tokens: {
        Row: {
          client_identity_id: string
          created_at: string
          created_by: string
          expires_at: string
          id: string
          report_id: string
          report_type: string
          revoked_at: string | null
          share_url: string | null
          token_hash: string
          used_at: string | null
        }
        Insert: {
          client_identity_id: string
          created_at?: string
          created_by: string
          expires_at?: string
          id?: string
          report_id: string
          report_type?: string
          revoked_at?: string | null
          share_url?: string | null
          token_hash: string
          used_at?: string | null
        }
        Update: {
          client_identity_id?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          report_id?: string
          report_type?: string
          revoked_at?: string | null
          share_url?: string | null
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_share_tokens_client_identity_id_fkey"
            columns: ["client_identity_id"]
            isOneToOne: false
            referencedRelation: "client_identities"
            referencedColumns: ["id"]
          },
        ]
      }
      scoring_preferences: {
        Row: {
          closing_3d_points: number
          closing_7d_points: number
          drift_conflict_points: number
          drift_new_lead_points: number
          engagement_points: number
          gap_2d_points: number
          gap_5d_points: number
          inactivity_3d_points: number
          inactivity_7d_points: number
          lead_hot_points: number
          lead_new_48h_points: number
          lead_warm_points: number
          milestone_points: number
          updated_at: string
          user_id: string
        }
        Insert: {
          closing_3d_points?: number
          closing_7d_points?: number
          drift_conflict_points?: number
          drift_new_lead_points?: number
          engagement_points?: number
          gap_2d_points?: number
          gap_5d_points?: number
          inactivity_3d_points?: number
          inactivity_7d_points?: number
          lead_hot_points?: number
          lead_new_48h_points?: number
          lead_warm_points?: number
          milestone_points?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          closing_3d_points?: number
          closing_7d_points?: number
          drift_conflict_points?: number
          drift_new_lead_points?: number
          engagement_points?: number
          gap_2d_points?: number
          gap_5d_points?: number
          inactivity_3d_points?: number
          inactivity_7d_points?: number
          lead_hot_points?: number
          lead_new_48h_points?: number
          lead_warm_points?: number
          milestone_points?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      self_opt_action_outcomes: {
        Row: {
          action_source: Database["public"]["Enums"]["action_source"]
          action_type: Database["public"]["Enums"]["self_opt_action_type"]
          channel: Database["public"]["Enums"]["self_opt_channel"]
          created_at: string
          entity_id: string
          entity_type: string
          executed: boolean
          execution_result:
            | Database["public"]["Enums"]["execution_result"]
            | null
          id: string
          long_term_effect:
            | Database["public"]["Enums"]["long_term_effect"]
            | null
          money_impact_bucket:
            | Database["public"]["Enums"]["money_impact_bucket"]
            | null
          notes_key: Database["public"]["Enums"]["self_opt_notes_key"] | null
          short_term_effect:
            | Database["public"]["Enums"]["short_term_effect"]
            | null
          time_to_execute_bucket:
            | Database["public"]["Enums"]["time_to_execute_bucket"]
            | null
          user_id: string
        }
        Insert: {
          action_source: Database["public"]["Enums"]["action_source"]
          action_type: Database["public"]["Enums"]["self_opt_action_type"]
          channel?: Database["public"]["Enums"]["self_opt_channel"]
          created_at?: string
          entity_id: string
          entity_type: string
          executed?: boolean
          execution_result?:
            | Database["public"]["Enums"]["execution_result"]
            | null
          id?: string
          long_term_effect?:
            | Database["public"]["Enums"]["long_term_effect"]
            | null
          money_impact_bucket?:
            | Database["public"]["Enums"]["money_impact_bucket"]
            | null
          notes_key?: Database["public"]["Enums"]["self_opt_notes_key"] | null
          short_term_effect?:
            | Database["public"]["Enums"]["short_term_effect"]
            | null
          time_to_execute_bucket?:
            | Database["public"]["Enums"]["time_to_execute_bucket"]
            | null
          user_id: string
        }
        Update: {
          action_source?: Database["public"]["Enums"]["action_source"]
          action_type?: Database["public"]["Enums"]["self_opt_action_type"]
          channel?: Database["public"]["Enums"]["self_opt_channel"]
          created_at?: string
          entity_id?: string
          entity_type?: string
          executed?: boolean
          execution_result?:
            | Database["public"]["Enums"]["execution_result"]
            | null
          id?: string
          long_term_effect?:
            | Database["public"]["Enums"]["long_term_effect"]
            | null
          money_impact_bucket?:
            | Database["public"]["Enums"]["money_impact_bucket"]
            | null
          notes_key?: Database["public"]["Enums"]["self_opt_notes_key"] | null
          short_term_effect?:
            | Database["public"]["Enums"]["short_term_effect"]
            | null
          time_to_execute_bucket?:
            | Database["public"]["Enums"]["time_to_execute_bucket"]
            | null
          user_id?: string
        }
        Relationships: []
      }
      self_opt_behavior_signals: {
        Row: {
          calls_count: number
          date: string
          emails_count: number
          eod_completed: boolean
          forecast_band: string | null
          id: string
          money_at_risk_band: string | null
          opportunity_heat_band: string | null
          overdue_tasks_count: number
          stability_band: string | null
          texts_count: number
          touches_count: number
          user_id: string
        }
        Insert: {
          calls_count?: number
          date: string
          emails_count?: number
          eod_completed?: boolean
          forecast_band?: string | null
          id?: string
          money_at_risk_band?: string | null
          opportunity_heat_band?: string | null
          overdue_tasks_count?: number
          stability_band?: string | null
          texts_count?: number
          touches_count?: number
          user_id: string
        }
        Update: {
          calls_count?: number
          date?: string
          emails_count?: number
          eod_completed?: boolean
          forecast_band?: string | null
          id?: string
          money_at_risk_band?: string | null
          opportunity_heat_band?: string | null
          overdue_tasks_count?: number
          stability_band?: string | null
          texts_count?: number
          touches_count?: number
          user_id?: string
        }
        Relationships: []
      }
      self_opt_preferences: {
        Row: {
          action_effectiveness: Json | null
          allow_channel_optimization: boolean
          allow_priority_reweighting: boolean
          allow_time_of_day_optimization: boolean
          behavioral_pattern: Json | null
          calibration_weights: Json | null
          coaching_tone: Database["public"]["Enums"]["coaching_tone"]
          created_at: string
          enabled: boolean
          nudge_level: Database["public"]["Enums"]["nudge_level"]
          outcomes: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          action_effectiveness?: Json | null
          allow_channel_optimization?: boolean
          allow_priority_reweighting?: boolean
          allow_time_of_day_optimization?: boolean
          behavioral_pattern?: Json | null
          calibration_weights?: Json | null
          coaching_tone?: Database["public"]["Enums"]["coaching_tone"]
          created_at?: string
          enabled?: boolean
          nudge_level?: Database["public"]["Enums"]["nudge_level"]
          outcomes?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          action_effectiveness?: Json | null
          allow_channel_optimization?: boolean
          allow_priority_reweighting?: boolean
          allow_time_of_day_optimization?: boolean
          behavioral_pattern?: Json | null
          calibration_weights?: Json | null
          coaching_tone?: Database["public"]["Enums"]["coaching_tone"]
          created_at?: string
          enabled?: boolean
          nudge_level?: Database["public"]["Enums"]["nudge_level"]
          outcomes?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assigned_to_user_id: string | null
          completed_at: string | null
          completion_note: string | null
          created_at: string
          due_at: string
          id: string
          import_run_id: string | null
          imported_at: string | null
          imported_from: string | null
          last_modified_at: string | null
          last_modified_by: string | null
          related_deal_id: string | null
          related_lead_id: string | null
          seed_batch_id: string | null
          seeded: boolean
          title: string
          type: Database["public"]["Enums"]["task_type"]
        }
        Insert: {
          assigned_to_user_id?: string | null
          completed_at?: string | null
          completion_note?: string | null
          created_at?: string
          due_at?: string
          id?: string
          import_run_id?: string | null
          imported_at?: string | null
          imported_from?: string | null
          last_modified_at?: string | null
          last_modified_by?: string | null
          related_deal_id?: string | null
          related_lead_id?: string | null
          seed_batch_id?: string | null
          seeded?: boolean
          title: string
          type?: Database["public"]["Enums"]["task_type"]
        }
        Update: {
          assigned_to_user_id?: string | null
          completed_at?: string | null
          completion_note?: string | null
          created_at?: string
          due_at?: string
          id?: string
          import_run_id?: string | null
          imported_at?: string | null
          imported_from?: string | null
          last_modified_at?: string | null
          last_modified_by?: string | null
          related_deal_id?: string | null
          related_lead_id?: string | null
          seed_batch_id?: string | null
          seeded?: boolean
          title?: string
          type?: Database["public"]["Enums"]["task_type"]
        }
        Relationships: [
          {
            foreignKeyName: "tasks_related_deal_id_fkey"
            columns: ["related_deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_related_lead_id_fkey"
            columns: ["related_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          default_split_percent: number | null
          id: string
          role: Database["public"]["Enums"]["team_role"]
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_split_percent?: number | null
          id?: string
          role?: Database["public"]["Enums"]["team_role"]
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          default_split_percent?: number | null
          id?: string
          role?: Database["public"]["Enums"]["team_role"]
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string
          team_leader_user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id: string
          team_leader_user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          team_leader_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_entitlements: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          is_pro: boolean
          is_trial: boolean
          last_receipt_check_at: string | null
          product_id: string | null
          source: string | null
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_pro?: boolean
          is_trial?: boolean
          last_receipt_check_at?: string | null
          product_id?: string | null
          source?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_pro?: boolean
          is_trial?: boolean
          last_receipt_check_at?: string | null
          product_id?: string | null
          source?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invite_token: string
          invited_by: string
          name: string | null
          organization_id: string | null
          role: string
          status: string
          team_ids: string[] | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invite_token?: string
          invited_by: string
          name?: string | null
          organization_id?: string | null
          role?: string
          status?: string
          team_ids?: string[] | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invite_token?: string
          invited_by?: string
          name?: string | null
          organization_id?: string | null
          role?: string
          status?: string
          team_ids?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "user_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_decrypted_api_key: {
        Args: { p_encryption_key: string; p_user_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_deal_owner_or_admin: {
        Args: { _deal_id: string; _user_id: string }
        Returns: boolean
      }
      is_deal_participant: {
        Args: { _deal_id: string; _user_id: string }
        Returns: boolean
      }
      is_last_admin_in_org: { Args: { p_user_id: string }; Returns: boolean }
      store_encrypted_api_key: {
        Args: { p_api_key: string; p_encryption_key: string; p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      action_source:
        | "autopilot"
        | "flight_plan"
        | "eod_sweep"
        | "prepared_actions"
        | "opportunity_radar"
        | "money_at_risk"
        | "manual"
      alert_type: "speed" | "urgent" | "risk" | "opportunity"
      app_role: "admin" | "agent" | "reviewer" | "beta"
      coaching_tone: "direct" | "friendly" | "professional"
      deal_stage: "offer" | "offer_accepted" | "pending" | "closed"
      execution_result:
        | "no_answer"
        | "spoke"
        | "scheduled"
        | "sent"
        | "completed"
        | "skipped"
        | "dismissed"
      lead_temperature: "cold" | "warm" | "hot"
      long_term_effect:
        | "lead_converted"
        | "lead_lost"
        | "deal_closed"
        | "deal_cancelled"
        | "none"
      money_impact_bucket:
        | "under_1k"
        | "1k_3k"
        | "3k_7k"
        | "7k_15k"
        | "15k_plus"
      nudge_level: "minimal" | "balanced" | "proactive"
      participant_role:
        | "primary_agent"
        | "co_agent"
        | "referral_partner"
        | "showing_agent"
      risk_level: "green" | "yellow" | "red"
      self_opt_action_type:
        | "call"
        | "text"
        | "email"
        | "schedule_task"
        | "log_touch"
        | "follow_up"
        | "recovery_plan"
      self_opt_channel: "call" | "text" | "email" | "none"
      self_opt_notes_key:
        | "worked_well"
        | "wrong_time"
        | "wrong_channel"
        | "too_pushy"
        | "too_long"
        | "unclear_next_step"
      short_term_effect:
        | "none"
        | "lead_engaged"
        | "lead_replied"
        | "risk_reduced"
        | "task_cleared"
        | "stability_improved"
      task_type:
        | "call"
        | "text"
        | "email"
        | "showing"
        | "follow_up"
        | "closing"
        | "open_house"
        | "thank_you"
      team_role: "leader" | "agent" | "isa" | "admin"
      time_to_execute_bucket:
        | "under_5m"
        | "under_1h"
        | "same_day"
        | "next_day"
        | "2_3_days"
        | "4_7_days"
        | "over_7_days"
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
      action_source: [
        "autopilot",
        "flight_plan",
        "eod_sweep",
        "prepared_actions",
        "opportunity_radar",
        "money_at_risk",
        "manual",
      ],
      alert_type: ["speed", "urgent", "risk", "opportunity"],
      app_role: ["admin", "agent", "reviewer", "beta"],
      coaching_tone: ["direct", "friendly", "professional"],
      deal_stage: ["offer", "offer_accepted", "pending", "closed"],
      execution_result: [
        "no_answer",
        "spoke",
        "scheduled",
        "sent",
        "completed",
        "skipped",
        "dismissed",
      ],
      lead_temperature: ["cold", "warm", "hot"],
      long_term_effect: [
        "lead_converted",
        "lead_lost",
        "deal_closed",
        "deal_cancelled",
        "none",
      ],
      money_impact_bucket: ["under_1k", "1k_3k", "3k_7k", "7k_15k", "15k_plus"],
      nudge_level: ["minimal", "balanced", "proactive"],
      participant_role: [
        "primary_agent",
        "co_agent",
        "referral_partner",
        "showing_agent",
      ],
      risk_level: ["green", "yellow", "red"],
      self_opt_action_type: [
        "call",
        "text",
        "email",
        "schedule_task",
        "log_touch",
        "follow_up",
        "recovery_plan",
      ],
      self_opt_channel: ["call", "text", "email", "none"],
      self_opt_notes_key: [
        "worked_well",
        "wrong_time",
        "wrong_channel",
        "too_pushy",
        "too_long",
        "unclear_next_step",
      ],
      short_term_effect: [
        "none",
        "lead_engaged",
        "lead_replied",
        "risk_reduced",
        "task_cleared",
        "stability_improved",
      ],
      task_type: [
        "call",
        "text",
        "email",
        "showing",
        "follow_up",
        "closing",
        "open_house",
        "thank_you",
      ],
      team_role: ["leader", "agent", "isa", "admin"],
      time_to_execute_bucket: [
        "under_5m",
        "under_1h",
        "same_day",
        "next_day",
        "2_3_days",
        "4_7_days",
        "over_7_days",
      ],
    },
  },
} as const
