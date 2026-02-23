
-- ============================================
-- Cross-App Identity Layer for Deal Pilot
-- ============================================

-- 1) Client Identities: canonical client record keyed by normalized email
CREATE TABLE public.client_identities (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email_normalized text NOT NULL UNIQUE,
  email_original text,
  first_name text,
  last_name text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Agent-Client association
CREATE TABLE public.agent_clients (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_user_id uuid NOT NULL,
  client_identity_id uuid NOT NULL REFERENCES public.client_identities(id) ON DELETE CASCADE,
  fub_contact_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agent_user_id, client_identity_id)
);

-- 3) Report share tokens for instant client access
CREATE TABLE public.report_share_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id text NOT NULL,
  report_type text NOT NULL DEFAULT 'market_compass',
  client_identity_id uuid NOT NULL REFERENCES public.client_identities(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  share_url text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_report_share_tokens_report ON public.report_share_tokens(report_id);
CREATE INDEX idx_report_share_tokens_client ON public.report_share_tokens(client_identity_id);
CREATE INDEX idx_report_share_tokens_hash ON public.report_share_tokens(token_hash);

-- Updated_at trigger for client_identities
CREATE TRIGGER update_client_identities_updated_at
  BEFORE UPDATE ON public.client_identities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- RLS Policies
-- ============================================

ALTER TABLE public.client_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_share_tokens ENABLE ROW LEVEL SECURITY;

-- client_identities: agents can view/manage identities they're associated with
CREATE POLICY "Agents can view linked client identities"
  ON public.client_identities FOR SELECT
  USING (
    id IN (SELECT client_identity_id FROM public.agent_clients WHERE agent_user_id = auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Authenticated can insert client identities"
  ON public.client_identities FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Agents can update linked client identities"
  ON public.client_identities FOR UPDATE
  USING (
    id IN (SELECT client_identity_id FROM public.agent_clients WHERE agent_user_id = auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- agent_clients: agents manage their own associations
CREATE POLICY "Agents can manage own client associations"
  ON public.agent_clients FOR ALL
  USING (agent_user_id = auth.uid())
  WITH CHECK (agent_user_id = auth.uid());

-- report_share_tokens: agents manage tokens they created
CREATE POLICY "Agents can manage own share tokens"
  ON public.report_share_tokens FOR ALL
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());
