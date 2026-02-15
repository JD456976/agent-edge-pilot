
-- Add seeded tracking columns to leads, deals, tasks, alerts
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS seeded boolean NOT NULL DEFAULT false;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS seed_batch_id text;

ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS seeded boolean NOT NULL DEFAULT false;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS seed_batch_id text;

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS seeded boolean NOT NULL DEFAULT false;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS seed_batch_id text;

ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS seeded boolean NOT NULL DEFAULT false;
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS seed_batch_id text;

-- Index for efficient batch cleanup
CREATE INDEX IF NOT EXISTS idx_leads_seed_batch ON public.leads(seed_batch_id) WHERE seeded = true;
CREATE INDEX IF NOT EXISTS idx_deals_seed_batch ON public.deals(seed_batch_id) WHERE seeded = true;
CREATE INDEX IF NOT EXISTS idx_tasks_seed_batch ON public.tasks(seed_batch_id) WHERE seeded = true;
CREATE INDEX IF NOT EXISTS idx_alerts_seed_batch ON public.alerts(seed_batch_id) WHERE seeded = true;
