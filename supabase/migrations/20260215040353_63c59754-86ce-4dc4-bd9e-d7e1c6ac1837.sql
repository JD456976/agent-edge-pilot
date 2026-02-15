
-- Self-Optimizing Mode: Agent-specific learning tables

-- Nudge level enum
CREATE TYPE public.nudge_level AS ENUM ('minimal', 'balanced', 'proactive');

-- Coaching tone enum
CREATE TYPE public.coaching_tone AS ENUM ('direct', 'friendly', 'professional');

-- Action source enum
CREATE TYPE public.action_source AS ENUM ('autopilot', 'flight_plan', 'eod_sweep', 'prepared_actions', 'opportunity_radar', 'money_at_risk', 'manual');

-- Action type enum for self-opt
CREATE TYPE public.self_opt_action_type AS ENUM ('call', 'text', 'email', 'schedule_task', 'log_touch', 'follow_up', 'recovery_plan');

-- Channel enum
CREATE TYPE public.self_opt_channel AS ENUM ('call', 'text', 'email', 'none');

-- Time to execute bucket
CREATE TYPE public.time_to_execute_bucket AS ENUM ('under_5m', 'under_1h', 'same_day', 'next_day', '2_3_days', '4_7_days', 'over_7_days');

-- Execution result
CREATE TYPE public.execution_result AS ENUM ('no_answer', 'spoke', 'scheduled', 'sent', 'completed', 'skipped', 'dismissed');

-- Short-term effect
CREATE TYPE public.short_term_effect AS ENUM ('none', 'lead_engaged', 'lead_replied', 'risk_reduced', 'task_cleared', 'stability_improved');

-- Long-term effect
CREATE TYPE public.long_term_effect AS ENUM ('lead_converted', 'lead_lost', 'deal_closed', 'deal_cancelled', 'none');

-- Money impact bucket
CREATE TYPE public.money_impact_bucket AS ENUM ('under_1k', '1k_3k', '3k_7k', '7k_15k', '15k_plus');

-- Notes key (predefined only)
CREATE TYPE public.self_opt_notes_key AS ENUM ('worked_well', 'wrong_time', 'wrong_channel', 'too_pushy', 'too_long', 'unclear_next_step');

-- A) self_opt_preferences
CREATE TABLE public.self_opt_preferences (
  user_id UUID NOT NULL PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  nudge_level nudge_level NOT NULL DEFAULT 'balanced',
  coaching_tone coaching_tone NOT NULL DEFAULT 'professional',
  allow_time_of_day_optimization BOOLEAN NOT NULL DEFAULT true,
  allow_channel_optimization BOOLEAN NOT NULL DEFAULT true,
  allow_priority_reweighting BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.self_opt_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own self-opt preferences"
  ON public.self_opt_preferences FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER update_self_opt_preferences_updated_at
  BEFORE UPDATE ON public.self_opt_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- B) self_opt_action_outcomes
CREATE TABLE public.self_opt_action_outcomes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  action_source action_source NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action_type self_opt_action_type NOT NULL,
  channel self_opt_channel NOT NULL DEFAULT 'none',
  time_to_execute_bucket time_to_execute_bucket,
  executed BOOLEAN NOT NULL DEFAULT false,
  execution_result execution_result,
  short_term_effect short_term_effect DEFAULT 'none',
  long_term_effect long_term_effect DEFAULT 'none',
  money_impact_bucket money_impact_bucket,
  notes_key self_opt_notes_key
);

ALTER TABLE public.self_opt_action_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own action outcomes"
  ON public.self_opt_action_outcomes FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- C) self_opt_behavior_signals (daily rollups)
CREATE TABLE public.self_opt_behavior_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  date DATE NOT NULL,
  touches_count INTEGER NOT NULL DEFAULT 0,
  calls_count INTEGER NOT NULL DEFAULT 0,
  texts_count INTEGER NOT NULL DEFAULT 0,
  emails_count INTEGER NOT NULL DEFAULT 0,
  overdue_tasks_count INTEGER NOT NULL DEFAULT 0,
  money_at_risk_band TEXT,
  opportunity_heat_band TEXT,
  stability_band TEXT,
  forecast_band TEXT,
  eod_completed BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (user_id, date)
);

ALTER TABLE public.self_opt_behavior_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own behavior signals"
  ON public.self_opt_behavior_signals FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Index for fast outcome lookups
CREATE INDEX idx_self_opt_outcomes_user_created ON public.self_opt_action_outcomes (user_id, created_at DESC);
CREATE INDEX idx_self_opt_behavior_user_date ON public.self_opt_behavior_signals (user_id, date DESC);
