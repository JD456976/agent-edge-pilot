
-- Ensure pgcrypto is available
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Fix: use encrypt/decrypt without schema prefix (they're available after CREATE EXTENSION)
CREATE OR REPLACE FUNCTION public.store_encrypted_api_key(
  p_user_id UUID,
  p_api_key TEXT,
  p_encryption_key TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  INSERT INTO public.crm_integrations (user_id, api_key_encrypted, api_key_last4, status)
  VALUES (
    p_user_id,
    encode(encrypt(p_api_key::bytea, p_encryption_key::bytea, 'aes'), 'base64'),
    RIGHT(p_api_key, 4),
    'disconnected'
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    api_key_encrypted = encode(encrypt(p_api_key::bytea, p_encryption_key::bytea, 'aes'), 'base64'),
    api_key_last4 = RIGHT(p_api_key, 4),
    status = 'disconnected',
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_decrypted_api_key(
  p_user_id UUID,
  p_encryption_key TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_encrypted TEXT;
BEGIN
  SELECT api_key_encrypted INTO v_encrypted
  FROM public.crm_integrations
  WHERE user_id = p_user_id;

  IF v_encrypted IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN convert_from(decrypt(decode(v_encrypted, 'base64'), p_encryption_key::bytea, 'aes'), 'UTF8');
END;
$$;
