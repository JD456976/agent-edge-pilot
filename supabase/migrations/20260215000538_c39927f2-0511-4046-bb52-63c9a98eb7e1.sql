
-- Add scope and field_rule columns to fub_ignored_changes
ALTER TABLE public.fub_ignored_changes
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'item',
  ADD COLUMN IF NOT EXISTS field_rule jsonb;

-- Add drift_reason to fub_sync_state
ALTER TABLE public.fub_sync_state
  ADD COLUMN IF NOT EXISTS last_successful_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS drift_reason text;
