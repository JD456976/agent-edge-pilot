-- Per-user commission defaults
CREATE TABLE public.commission_defaults (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  default_commission_rate NUMERIC DEFAULT 3.0,
  default_split NUMERIC DEFAULT 100,
  default_referral_fee NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.commission_defaults ENABLE ROW LEVEL SECURITY;

-- Users can manage their own defaults
CREATE POLICY "Users can manage own commission defaults"
ON public.commission_defaults
FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Trigger for updated_at
CREATE TRIGGER update_commission_defaults_updated_at
BEFORE UPDATE ON public.commission_defaults
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();