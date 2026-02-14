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
          close_date: string
          commission_amount: number
          commission_rate: number | null
          created_at: string
          id: string
          last_touched_at: string | null
          milestone_appraisal: string | null
          milestone_financing: string | null
          milestone_inspection: string | null
          organization_id: string | null
          price: number
          referral_fee_percent: number | null
          risk_flags: string[] | null
          risk_level: Database["public"]["Enums"]["risk_level"]
          stage: Database["public"]["Enums"]["deal_stage"]
          title: string
        }
        Insert: {
          assigned_to_user_id?: string | null
          close_date?: string
          commission_amount?: number
          commission_rate?: number | null
          created_at?: string
          id?: string
          last_touched_at?: string | null
          milestone_appraisal?: string | null
          milestone_financing?: string | null
          milestone_inspection?: string | null
          organization_id?: string | null
          price?: number
          referral_fee_percent?: number | null
          risk_flags?: string[] | null
          risk_level?: Database["public"]["Enums"]["risk_level"]
          stage?: Database["public"]["Enums"]["deal_stage"]
          title: string
        }
        Update: {
          assigned_to_user_id?: string | null
          close_date?: string
          commission_amount?: number
          commission_rate?: number | null
          created_at?: string
          id?: string
          last_touched_at?: string | null
          milestone_appraisal?: string | null
          milestone_financing?: string | null
          milestone_inspection?: string | null
          organization_id?: string | null
          price?: number
          referral_fee_percent?: number | null
          risk_flags?: string[] | null
          risk_level?: Database["public"]["Enums"]["risk_level"]
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
      fub_import_runs: {
        Row: {
          committed_at: string | null
          committed_counts: Json | null
          created_at: string
          duration_ms: number | null
          id: string
          notes: string | null
          source_counts: Json | null
          status: string
          user_id: string
        }
        Insert: {
          committed_at?: string | null
          committed_counts?: Json | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          notes?: string | null
          source_counts?: Json | null
          status?: string
          user_id: string
        }
        Update: {
          committed_at?: string | null
          committed_counts?: Json | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          notes?: string | null
          source_counts?: Json | null
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
      leads: {
        Row: {
          assigned_to_user_id: string | null
          created_at: string
          engagement_score: number
          id: string
          last_activity_at: string | null
          last_contact_at: string
          lead_temperature:
            | Database["public"]["Enums"]["lead_temperature"]
            | null
          name: string
          notes: string | null
          organization_id: string | null
          source: string
          status_tags: string[] | null
        }
        Insert: {
          assigned_to_user_id?: string | null
          created_at?: string
          engagement_score?: number
          id?: string
          last_activity_at?: string | null
          last_contact_at?: string
          lead_temperature?:
            | Database["public"]["Enums"]["lead_temperature"]
            | null
          name: string
          notes?: string | null
          organization_id?: string | null
          source?: string
          status_tags?: string[] | null
        }
        Update: {
          assigned_to_user_id?: string | null
          created_at?: string
          engagement_score?: number
          id?: string
          last_activity_at?: string | null
          last_contact_at?: string
          lead_temperature?:
            | Database["public"]["Enums"]["lead_temperature"]
            | null
          name?: string
          notes?: string | null
          organization_id?: string | null
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
          email: string
          id: string
          is_protected: boolean
          name: string
          onboarding_completed: boolean
          theme_preference: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string
          id?: string
          is_protected?: boolean
          name?: string
          onboarding_completed?: boolean
          theme_preference?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_protected?: boolean
          name?: string
          onboarding_completed?: boolean
          theme_preference?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assigned_to_user_id: string | null
          completed_at: string | null
          created_at: string
          due_at: string
          id: string
          related_deal_id: string | null
          related_lead_id: string | null
          title: string
          type: Database["public"]["Enums"]["task_type"]
        }
        Insert: {
          assigned_to_user_id?: string | null
          completed_at?: string | null
          created_at?: string
          due_at?: string
          id?: string
          related_deal_id?: string | null
          related_lead_id?: string | null
          title: string
          type?: Database["public"]["Enums"]["task_type"]
        }
        Update: {
          assigned_to_user_id?: string | null
          completed_at?: string | null
          created_at?: string
          due_at?: string
          id?: string
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
