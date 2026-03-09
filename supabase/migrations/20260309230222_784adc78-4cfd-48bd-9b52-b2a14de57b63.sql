
-- Add target market settings to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS target_zip_codes text DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS target_min_price numeric DEFAULT NULL;

-- Add snooze/return date to leads
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS snooze_until timestamp with time zone DEFAULT NULL;
