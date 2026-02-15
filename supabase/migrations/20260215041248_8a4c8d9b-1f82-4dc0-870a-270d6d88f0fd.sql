
-- Agent Intelligence Profile (personal data moat)
CREATE TABLE public.agent_intelligence_profile (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_days_last_30 integer NOT NULL DEFAULT 0,
  avg_daily_actions numeric NOT NULL DEFAULT 0,
  best_time_of_day_bucket text,
  preferred_channel_call_pct numeric NOT NULL DEFAULT 0,
  preferred_channel_text_pct numeric NOT NULL DEFAULT 0,
  preferred_channel_email_pct numeric NOT NULL DEFAULT 0,
  avg_response_time_bucket text,
  lead_conversion_rate_estimate numeric NOT NULL DEFAULT 0,
  deal_close_rate_estimate numeric NOT NULL DEFAULT 0,
  avg_time_to_close_bucket text,
  stability_trend text NOT NULL DEFAULT 'stable',
  income_trend text NOT NULL DEFAULT 'flat',
  risk_tolerance text NOT NULL DEFAULT 'medium',
  last_updated timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_intelligence_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own intelligence profile"
  ON public.agent_intelligence_profile FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Organization Intelligence Summary (admin-only, future B2B)
CREATE TABLE public.organization_intelligence_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  total_agents integer NOT NULL DEFAULT 0,
  avg_stability_score numeric NOT NULL DEFAULT 0,
  avg_income_forecast numeric NOT NULL DEFAULT 0,
  risk_distribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  opportunity_distribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  activity_distribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_updated timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (organization_id)
);

ALTER TABLE public.organization_intelligence_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view org intelligence"
  ON public.organization_intelligence_summary FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage org intelligence"
  ON public.organization_intelligence_summary FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));
