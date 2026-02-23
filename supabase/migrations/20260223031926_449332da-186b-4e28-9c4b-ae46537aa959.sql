
-- ============================================================
-- Preference Intelligence Tables
-- ============================================================

-- 1. preference_profiles: stores computed preference profiles per contact
CREATE TABLE public.preference_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entity_id uuid NOT NULL,
  entity_type text NOT NULL DEFAULT 'lead',
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric NOT NULL DEFAULT 0.3,
  reasons jsonb NOT NULL DEFAULT '{}'::jsonb,
  overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_computed_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, entity_id)
);

ALTER TABLE public.preference_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own preference profiles"
  ON public.preference_profiles FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER update_preference_profiles_updated_at
  BEFORE UPDATE ON public.preference_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. preference_feedback: user confirmations/rejections/edits
CREATE TABLE public.preference_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entity_id uuid NOT NULL,
  field text NOT NULL,
  value jsonb,
  action text NOT NULL CHECK (action IN ('confirm', 'reject', 'edit')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.preference_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own preference feedback"
  ON public.preference_feedback FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Index for fast lookups
CREATE INDEX idx_preference_profiles_user_entity ON public.preference_profiles(user_id, entity_id);
CREATE INDEX idx_preference_feedback_user_entity ON public.preference_feedback(user_id, entity_id);
CREATE INDEX idx_preference_feedback_created ON public.preference_feedback(created_at DESC);
