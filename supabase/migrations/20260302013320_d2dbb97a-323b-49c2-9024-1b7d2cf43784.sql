-- Add unique constraint for deduplication of FUB activity log entries
CREATE UNIQUE INDEX IF NOT EXISTS fub_activity_log_dedup_idx 
ON public.fub_activity_log (user_id, fub_id, activity_type, occurred_at);