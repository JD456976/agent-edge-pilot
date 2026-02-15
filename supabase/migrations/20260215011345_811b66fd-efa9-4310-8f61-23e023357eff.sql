-- Add side column to deals
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS side text NOT NULL DEFAULT 'buy';

-- Add comment for valid values
COMMENT ON COLUMN public.deals.side IS 'buy, sell, or dual';
