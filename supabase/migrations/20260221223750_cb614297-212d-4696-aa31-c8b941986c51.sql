
-- Table to persist AI-generated intel briefs for leads and deals
CREATE TABLE public.intel_briefs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  entity_id UUID NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'lead',
  brief_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  activity_count INTEGER NOT NULL DEFAULT 0,
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, entity_id)
);

ALTER TABLE public.intel_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own intel briefs"
ON public.intel_briefs FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE TRIGGER update_intel_briefs_updated_at
BEFORE UPDATE ON public.intel_briefs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
