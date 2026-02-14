
-- 1) Add last_modified_at and last_modified_by to core tables for edit tracking
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS last_modified_at timestamp with time zone DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_modified_by uuid DEFAULT NULL;

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS last_modified_at timestamp with time zone DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_modified_by uuid DEFAULT NULL;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS last_modified_at timestamp with time zone DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_modified_by uuid DEFAULT NULL;

-- 2) Add mapping_version to import tables
ALTER TABLE public.fub_import_runs
  ADD COLUMN IF NOT EXISTS mapping_version integer NOT NULL DEFAULT 1;

ALTER TABLE public.fub_staged_leads
  ADD COLUMN IF NOT EXISTS mapping_version integer NOT NULL DEFAULT 1;

ALTER TABLE public.fub_staged_deals
  ADD COLUMN IF NOT EXISTS mapping_version integer NOT NULL DEFAULT 1;

ALTER TABLE public.fub_staged_tasks
  ADD COLUMN IF NOT EXISTS mapping_version integer NOT NULL DEFAULT 1;

-- 3) Create dedup rules table
CREATE TABLE public.import_dedup_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_email_match boolean NOT NULL DEFAULT true,
  lead_phone_match boolean NOT NULL DEFAULT false,
  lead_name_fuzzy boolean NOT NULL DEFAULT false,
  deal_title_close_date boolean NOT NULL DEFAULT true,
  deal_address_match boolean NOT NULL DEFAULT false,
  task_title_due_date boolean NOT NULL DEFAULT true,
  task_title_only boolean NOT NULL DEFAULT false,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.import_dedup_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own dedup rules"
  ON public.import_dedup_rules FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own dedup rules"
  ON public.import_dedup_rules FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own dedup rules"
  ON public.import_dedup_rules FOR UPDATE
  USING (user_id = auth.uid());

-- 4) Trigger to auto-update last_modified_at on user edits
CREATE OR REPLACE FUNCTION public.set_last_modified()
RETURNS TRIGGER AS $$
BEGIN
  -- Only set if not being set by an import (imported_at is changing means it's an import operation)
  IF OLD.last_modified_at IS DISTINCT FROM NEW.last_modified_at THEN
    RETURN NEW; -- already being set explicitly
  END IF;
  NEW.last_modified_at = now();
  NEW.last_modified_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER set_leads_last_modified
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_last_modified();

CREATE TRIGGER set_deals_last_modified
  BEFORE UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.set_last_modified();

CREATE TRIGGER set_tasks_last_modified
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_last_modified();
