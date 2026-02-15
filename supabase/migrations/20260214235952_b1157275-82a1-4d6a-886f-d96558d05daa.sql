
-- 1) Sync state tracking table
CREATE TABLE public.fub_sync_state (
  user_id uuid PRIMARY KEY,
  last_validated_at timestamptz,
  last_preview_at timestamptz,
  last_stage_at timestamptz,
  last_commit_at timestamptz,
  last_delta_check_at timestamptz,
  last_seen_fub_updated_at timestamptz,
  last_delta_summary jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fub_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own sync state"
  ON public.fub_sync_state FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 2) Watchlist table
CREATE TABLE public.fub_watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entity_type text NOT NULL, -- 'lead', 'deal', 'task'
  fub_id text,
  entity_id uuid,
  label text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fub_watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own watchlist"
  ON public.fub_watchlist FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 3) Ignored changes table (with TTL concept via expires_at)
CREATE TABLE public.fub_ignored_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entity_type text NOT NULL,
  fub_id text NOT NULL,
  ignored_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

ALTER TABLE public.fub_ignored_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own ignored changes"
  ON public.fub_ignored_changes FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 4) Conflict resolutions table
CREATE TABLE public.fub_conflict_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  fub_id text,
  resolution text NOT NULL, -- 'keep_local', 'accept_fub_fields'
  accepted_fields text[] DEFAULT '{}',
  resolved_at timestamptz NOT NULL DEFAULT now(),
  delta_check_at timestamptz
);

ALTER TABLE public.fub_conflict_resolutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own conflict resolutions"
  ON public.fub_conflict_resolutions FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
