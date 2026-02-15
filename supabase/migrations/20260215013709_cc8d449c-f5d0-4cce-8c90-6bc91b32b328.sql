ALTER TABLE public.commission_defaults 
ADD COLUMN IF NOT EXISTS typical_price_mid numeric DEFAULT NULL;