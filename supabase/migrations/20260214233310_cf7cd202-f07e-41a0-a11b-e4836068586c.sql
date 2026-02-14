
-- Add committed_counts and committed_at to fub_import_runs for report persistence
ALTER TABLE public.fub_import_runs
  ADD COLUMN IF NOT EXISTS committed_counts jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS committed_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS duration_ms integer DEFAULT NULL;
