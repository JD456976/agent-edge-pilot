
-- Add trigger_bucket to existing telemetry table
ALTER TABLE public.network_telemetry_events
  ADD COLUMN IF NOT EXISTS trigger_bucket text
  CHECK (trigger_bucket IS NULL OR trigger_bucket IN (
    'overdue_task','untouched_hot_lead','closing_soon','high_money_risk',
    'lead_decay','drift_conflict','none'
  ));

-- Playbook situation templates (system-defined, no PII)
CREATE TABLE public.network_playbook_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  situation_key text NOT NULL UNIQUE CHECK (char_length(situation_key) <= 60),
  description text NOT NULL CHECK (char_length(description) <= 200),
  required_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  eligible_cohort_min int NOT NULL DEFAULT 25,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.network_playbook_templates ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read templates
CREATE POLICY "Authenticated can view playbook templates"
  ON public.network_playbook_templates FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only service role writes templates (no user INSERT/UPDATE/DELETE policies)

-- Derived playbooks from aggregated patterns
CREATE TABLE public.network_playbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_key text NOT NULL CHECK (char_length(cohort_key) <= 100),
  situation_key text NOT NULL CHECK (char_length(situation_key) <= 60),
  cohort_size int NOT NULL CHECK (cohort_size >= 25),
  period text NOT NULL CHECK (period IN ('weekly','monthly')),
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  playbook_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  effectiveness_band text NOT NULL CHECK (effectiveness_band IN ('low','medium','high')),
  confidence_band text NOT NULL CHECK (confidence_band IN ('LOW','MEDIUM','HIGH')),
  guardrails jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_net_playbooks_situation ON public.network_playbooks(situation_key, cohort_key, window_end DESC);

ALTER TABLE public.network_playbooks ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read playbooks
CREATE POLICY "Authenticated can view playbooks"
  ON public.network_playbooks FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Seed situation templates
INSERT INTO public.network_playbook_templates (situation_key, description, required_signals) VALUES
  ('untouched_hot_lead_48h', 'Hot lead with no contact in 48+ hours', '["lead_temperature_hot","no_touch_48h"]'::jsonb),
  ('closing_3d_open_issues', 'Deal closing within 3 days with unresolved milestones', '["closing_within_3d","open_milestones"]'::jsonb),
  ('high_money_risk_pending', 'Pending deal with high money at risk', '["risk_bucket_high","stage_pending"]'::jsonb),
  ('lead_decay_spike', 'Multiple leads decaying simultaneously', '["lead_decay_count_3_plus"]'::jsonb),
  ('ghost_risk_high', 'Client showing ghosting risk signals', '["no_response_7d","engagement_declining"]'::jsonb),
  ('pipeline_gap_30_60', 'Gap in pipeline between 30-60 day window', '["pipeline_gap_30_60d"]'::jsonb);

-- Add show_playbooks to network_participation
ALTER TABLE public.network_participation
  ADD COLUMN IF NOT EXISTS show_playbooks boolean NOT NULL DEFAULT true;
