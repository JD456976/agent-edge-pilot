-- Task 2: Add missing index for fub_activity_log queries by user_id
CREATE INDEX IF NOT EXISTS idx_fub_activity_user_occurred
  ON public.fub_activity_log(user_id, occurred_at DESC);

-- Task 3: Fix stale model_used column default
ALTER TABLE public.client_market_analyses
  ALTER COLUMN model_used SET DEFAULT 'deterministic-v1';

UPDATE public.client_market_analyses
  SET model_used = 'deterministic-v1'
  WHERE model_used = 'google/gemini-3-flash-preview'
     OR model_used IS NULL;