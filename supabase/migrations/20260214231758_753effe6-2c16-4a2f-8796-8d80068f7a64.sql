
-- Import runs table
CREATE TABLE public.fub_import_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'staged' CHECK (status IN ('staged','committed','failed','cancelled')),
  source_counts JSONB DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.fub_import_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own import runs"
ON public.fub_import_runs FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own import runs"
ON public.fub_import_runs FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own import runs"
ON public.fub_import_runs FOR UPDATE USING (user_id = auth.uid());

-- Staged leads
CREATE TABLE public.fub_staged_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  import_run_id UUID NOT NULL REFERENCES public.fub_import_runs(id) ON DELETE CASCADE,
  fub_id TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  normalized JSONB NOT NULL DEFAULT '{}'::jsonb,
  match_status TEXT NOT NULL DEFAULT 'new' CHECK (match_status IN ('new','matched','conflict')),
  matched_lead_id UUID,
  resolution TEXT CHECK (resolution IS NULL OR resolution IN ('create_new','match_existing','skip')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.fub_staged_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own staged leads"
ON public.fub_staged_leads FOR ALL USING (user_id = auth.uid());

CREATE INDEX idx_fub_staged_leads_user_fub ON public.fub_staged_leads(user_id, fub_id);
CREATE INDEX idx_fub_staged_leads_run ON public.fub_staged_leads(import_run_id);

-- Staged deals
CREATE TABLE public.fub_staged_deals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  import_run_id UUID NOT NULL REFERENCES public.fub_import_runs(id) ON DELETE CASCADE,
  fub_id TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  normalized JSONB NOT NULL DEFAULT '{}'::jsonb,
  match_status TEXT NOT NULL DEFAULT 'new' CHECK (match_status IN ('new','matched','conflict')),
  matched_deal_id UUID,
  resolution TEXT CHECK (resolution IS NULL OR resolution IN ('create_new','match_existing','skip')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.fub_staged_deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own staged deals"
ON public.fub_staged_deals FOR ALL USING (user_id = auth.uid());

CREATE INDEX idx_fub_staged_deals_user_fub ON public.fub_staged_deals(user_id, fub_id);
CREATE INDEX idx_fub_staged_deals_run ON public.fub_staged_deals(import_run_id);

-- Staged tasks
CREATE TABLE public.fub_staged_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  import_run_id UUID NOT NULL REFERENCES public.fub_import_runs(id) ON DELETE CASCADE,
  fub_id TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  normalized JSONB NOT NULL DEFAULT '{}'::jsonb,
  match_status TEXT NOT NULL DEFAULT 'new' CHECK (match_status IN ('new','matched','conflict')),
  matched_task_id UUID,
  resolution TEXT CHECK (resolution IS NULL OR resolution IN ('create_new','match_existing','skip')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.fub_staged_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own staged tasks"
ON public.fub_staged_tasks FOR ALL USING (user_id = auth.uid());

CREATE INDEX idx_fub_staged_tasks_user_fub ON public.fub_staged_tasks(user_id, fub_id);
CREATE INDEX idx_fub_staged_tasks_run ON public.fub_staged_tasks(import_run_id);
