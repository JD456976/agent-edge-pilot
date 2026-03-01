
-- Add JSONB columns to store learning engine data
ALTER TABLE public.self_opt_preferences
  ADD COLUMN IF NOT EXISTS calibration_weights jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS behavioral_pattern jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS action_effectiveness jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS outcomes jsonb DEFAULT '[]'::jsonb;
