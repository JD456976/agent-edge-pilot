
-- Add Stripe columns to user_entitlements
ALTER TABLE public.user_entitlements 
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;

-- Update default source to 'stripe'
ALTER TABLE public.user_entitlements ALTER COLUMN source SET DEFAULT 'stripe';
