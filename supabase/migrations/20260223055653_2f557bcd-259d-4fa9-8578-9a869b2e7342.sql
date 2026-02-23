
-- Table to persist AI-generated client market analyses
CREATE TABLE public.client_market_analyses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_user_id uuid NOT NULL,
  client_identity_id uuid NOT NULL REFERENCES public.client_identities(id),
  analysis_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  activity_count integer NOT NULL DEFAULT 0,
  model_used text DEFAULT 'google/gemini-3-flash-preview',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One analysis per agent-client pair
CREATE UNIQUE INDEX idx_client_market_analyses_unique
  ON public.client_market_analyses(agent_user_id, client_identity_id);

ALTER TABLE public.client_market_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own client analyses"
  ON public.client_market_analyses FOR ALL
  USING (agent_user_id = auth.uid())
  WITH CHECK (agent_user_id = auth.uid());

-- Auto-update timestamp
CREATE TRIGGER update_client_market_analyses_updated_at
  BEFORE UPDATE ON public.client_market_analyses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
