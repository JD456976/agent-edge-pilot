
-- Optional analytics table for tracking entitlement state server-side (Part 7)
CREATE TABLE public.user_entitlements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  is_pro BOOLEAN NOT NULL DEFAULT false,
  is_trial BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  last_receipt_check_at TIMESTAMPTZ,
  product_id TEXT,
  source TEXT DEFAULT 'storekit',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.user_entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own entitlement"
  ON public.user_entitlements FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert their own entitlement"
  ON public.user_entitlements FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own entitlement"
  ON public.user_entitlements FOR UPDATE
  USING (auth.uid() = user_id);

-- Auto-update updated_at
CREATE TRIGGER update_user_entitlements_updated_at
  BEFORE UPDATE ON public.user_entitlements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
