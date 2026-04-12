ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS phone_primary TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS phone_mobile TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS email_primary TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS email_secondary TEXT;