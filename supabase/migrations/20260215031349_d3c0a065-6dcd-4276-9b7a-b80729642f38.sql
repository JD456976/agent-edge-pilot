
-- Network Telemetry Events: strict PII-free schema
CREATE TABLE public.network_telemetry_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  org_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  app_version text NOT NULL DEFAULT '1.0' CHECK (char_length(app_version) <= 20),
  event_type text NOT NULL CHECK (event_type IN ('task_completed','touch_logged','lead_converted','lead_lost','deal_closed','deal_cancelled','autopilot_action_started','autopilot_action_completed')),
  entity_type text NOT NULL CHECK (entity_type IN ('lead','deal','task')) CHECK (char_length(entity_type) <= 10),
  channel text CHECK (channel IN ('call','text','email','showing','note','none') OR channel IS NULL) CHECK (char_length(channel) <= 10),
  stage text CHECK (char_length(stage) <= 30),
  time_to_action_bucket text CHECK (time_to_action_bucket IN ('under_5m','under_1h','same_day','next_day','2_3_days','4_7_days','over_7_days') OR time_to_action_bucket IS NULL),
  response_time_bucket text CHECK (response_time_bucket IN ('under_5m','under_1h','same_day','next_day','2_3_days','4_7_days','over_7_days') OR response_time_bucket IS NULL),
  outcome_bucket text CHECK (outcome_bucket IN ('converted','lost','closed','cancelled','none') OR outcome_bucket IS NULL),
  money_bucket text CHECK (money_bucket IN ('under_1k','1k_3k','3k_7k','7k_15k','15k_plus') OR money_bucket IS NULL),
  risk_bucket text CHECK (risk_bucket IN ('low','medium','high') OR risk_bucket IS NULL),
  opportunity_bucket text CHECK (opportunity_bucket IN ('watch','warm','hot') OR opportunity_bucket IS NULL),
  workload_bucket text CHECK (workload_bucket IN ('stable','watch','strained','overloaded') OR workload_bucket IS NULL),
  region_bucket text CHECK (char_length(region_bucket) <= 30),
  -- PII prevention: reject strings containing @ or sequences of digits that look like phone numbers
  CONSTRAINT no_email_in_stage CHECK (stage IS NULL OR stage !~ '@'),
  CONSTRAINT no_phone_in_stage CHECK (stage IS NULL OR stage !~ '\d{7,}'),
  CONSTRAINT no_email_in_region CHECK (region_bucket IS NULL OR region_bucket !~ '@'),
  CONSTRAINT no_phone_in_region CHECK (region_bucket IS NULL OR region_bucket !~ '\d{7,}')
);

-- Indexes
CREATE INDEX idx_net_telem_user ON public.network_telemetry_events(user_id);
CREATE INDEX idx_net_telem_event ON public.network_telemetry_events(event_type, created_at);

-- RLS
ALTER TABLE public.network_telemetry_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own telemetry"
  ON public.network_telemetry_events FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own telemetry"
  ON public.network_telemetry_events FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own telemetry"
  ON public.network_telemetry_events FOR DELETE
  USING (user_id = auth.uid());

-- Network Benchmarks: aggregated data, read-only for users
CREATE TABLE public.network_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_key text NOT NULL CHECK (char_length(cohort_key) <= 100),
  cohort_size int NOT NULL CHECK (cohort_size >= 25),
  period text NOT NULL CHECK (period IN ('weekly','monthly')),
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_net_bench_cohort ON public.network_benchmarks(cohort_key, period, window_end DESC);

ALTER TABLE public.network_benchmarks ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read benchmarks
CREATE POLICY "Authenticated can view benchmarks"
  ON public.network_benchmarks FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only service role can write benchmarks (edge function)
-- No INSERT/UPDATE/DELETE policies for regular users

-- Network participation preferences
CREATE TABLE public.network_participation (
  user_id uuid PRIMARY KEY,
  opted_in boolean NOT NULL DEFAULT false,
  use_network_priors boolean NOT NULL DEFAULT false,
  opted_in_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.network_participation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own participation"
  ON public.network_participation FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
