ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS removed_from_fub boolean NOT NULL DEFAULT false;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS removed_from_fub_at timestamp with time zone;