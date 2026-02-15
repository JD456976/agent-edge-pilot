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
      alerts: {
        Row: {
          created_at: string
          detail: string | null
          expires_at: string
          id: string
          organization_id: string | null
          related_deal_id: string | null
          related_lead_id: string | null
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
          risk_flags: string[] | null
          risk_level: Database["public"]["Enums"]["risk_level"]
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
          risk_flags?: string[] | null
          risk_level?: Database["public"]["Enums"]["risk_level"]
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
          risk_flags?: string[] | null
          risk_level?: Database["public"]["Enums"]["risk_level"]
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
          lead_temperature:
            | Database["public"]["Enums"]["lead_temperature"]
            | null
          lost_at: string | null
          name: string
          notes: string | null
          organization_id: string | null
          outcome_note: string | null
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
          lead_temperature?:
            | Database["public"]["Enums"]["lead_temperature"]
            | null
          lost_at?: string | null
          name: string
          notes?: string | null
          organization_id?: string | null
          outcome_note?: string | null
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
          lead_temperature?:
            | Database["public"]["Enums"]["lead_temperature"]
            | null
          lost_at?: string | null
          name?: string
          notes?: string | null
          organization_id?: string | null
          outcome_note?: string | null
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
      profiles: {
        Row: {
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          email: string
          id: string
          is_deleted: boolean
          is_protected: boolean
          name: string
          onboarding_completed: boolean
          organization_id: string | null
          status: string
          theme_preference: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string
          id?: string
          is_deleted?: boolean
          is_protected?: boolean
          name?: string
          onboarding_completed?: boolean
          organization_id?: string | null
          status?: string
          theme_preference?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string
          id?: string
          is_deleted?: boolean
          is_protected?: boolean
          name?: string
          onboarding_completed?: boolean
          organization_id?: string | null
          status?: string
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
      is_last_admin_in_org: { Args: { p_user_id: string }; Returns: boolean }
      store_encrypted_api_key: {
        Args: { p_api_key: string; p_encryption_key: string; p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      alert_type: "speed" | "urgent" | "risk" | "opportunity"
      app_role: "admin" | "agent" | "reviewer" | "beta"
      deal_stage: "offer" | "offer_accepted" | "pending" | "closed"
      lead_temperature: "cold" | "warm" | "hot"
      participant_role:
        | "primary_agent"
        | "co_agent"
        | "referral_partner"
        | "showing_agent"
      risk_level: "green" | "yellow" | "red"
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
      alert_type: ["speed", "urgent", "risk", "opportunity"],
      app_role: ["admin", "agent", "reviewer", "beta"],
      deal_stage: ["offer", "offer_accepted", "pending", "closed"],
      lead_temperature: ["cold", "warm", "hot"],
      participant_role: [
        "primary_agent",
        "co_agent",
        "referral_partner",
        "showing_agent",
      ],
      risk_level: ["green", "yellow", "red"],
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
    },
  },
} as const
