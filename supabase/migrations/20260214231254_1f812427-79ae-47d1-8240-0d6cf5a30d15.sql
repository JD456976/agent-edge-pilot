
-- Enable pgcrypto for encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create crm_integrations table
CREATE TABLE public.crm_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'follow_up_boss',
  api_key_encrypted TEXT,
  api_key_last4 TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected','connected','invalid','error')),
  last_validated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.crm_integrations ENABLE ROW LEVEL SECURITY;

-- Users can view their own row (but NOT the encrypted key column - handled via edge function)
CREATE POLICY "Users can view own integration"
ON public.crm_integrations FOR SELECT
USING (user_id = auth.uid());

-- Users can insert their own row
CREATE POLICY "Users can insert own integration"
ON public.crm_integrations FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Users can update their own row
CREATE POLICY "Users can update own integration"
ON public.crm_integrations FOR UPDATE
USING (user_id = auth.uid());

-- Users can delete their own row
CREATE POLICY "Users can delete own integration"
ON public.crm_integrations FOR DELETE
USING (user_id = auth.uid());

-- Trigger for updated_at
CREATE TRIGGER update_crm_integrations_updated_at
BEFORE UPDATE ON public.crm_integrations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create a server-side function to encrypt and store the API key (called from edge functions only)
CREATE OR REPLACE FUNCTION public.store_encrypted_api_key(
  p_user_id UUID,
  p_api_key TEXT,
  p_encryption_key TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.crm_integrations (user_id, api_key_encrypted, api_key_last4, status)
  VALUES (
    p_user_id,
    pgcrypto.encrypt(p_api_key::bytea, p_encryption_key::bytea, 'aes'),
    RIGHT(p_api_key, 4),
    'disconnected'
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    api_key_encrypted = pgcrypto.encrypt(p_api_key::bytea, p_encryption_key::bytea, 'aes'),
    api_key_last4 = RIGHT(p_api_key, 4),
    status = 'disconnected',
    updated_at = now();
END;
$$;

-- Create a server-side function to decrypt the API key (called from edge functions only)
CREATE OR REPLACE FUNCTION public.get_decrypted_api_key(
  p_user_id UUID,
  p_encryption_key TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_encrypted BYTEA;
  v_decrypted TEXT;
BEGIN
  SELECT api_key_encrypted::bytea INTO v_encrypted
  FROM public.crm_integrations
  WHERE user_id = p_user_id;

  IF v_encrypted IS NULL THEN
    RETURN NULL;
  END IF;

  v_decrypted := convert_from(pgcrypto.decrypt(v_encrypted, p_encryption_key::bytea, 'aes'), 'UTF8');
  RETURN v_decrypted;
END;
$$;
