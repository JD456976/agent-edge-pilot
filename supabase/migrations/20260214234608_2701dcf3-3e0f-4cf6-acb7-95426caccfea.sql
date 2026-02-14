
-- Add traceability metadata to core tables
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS imported_from text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS import_run_id uuid DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS imported_at timestamp with time zone DEFAULT NULL;

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS imported_from text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS import_run_id uuid DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS imported_at timestamp with time zone DEFAULT NULL;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS imported_from text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS import_run_id uuid DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS imported_at timestamp with time zone DEFAULT NULL;

-- Add undo fields to fub_import_runs
ALTER TABLE public.fub_import_runs
  ADD COLUMN IF NOT EXISTS undone_at timestamp with time zone DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS undone_by uuid DEFAULT NULL;
