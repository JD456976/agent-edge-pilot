
-- Open Houses table
CREATE TABLE public.open_houses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  property_address text NOT NULL,
  event_date timestamptz,
  notes text,
  intake_token text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  status text NOT NULL DEFAULT 'active',
  template_id uuid,
  agent_name text,
  agent_phone text,
  agent_email text,
  brokerage text,
  form_settings jsonb NOT NULL DEFAULT '{"require_all": false, "allow_anonymous": true, "show_contact_card": true}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT open_houses_intake_token_key UNIQUE (intake_token)
);

ALTER TABLE public.open_houses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own open houses"
  ON public.open_houses FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_open_houses_user ON public.open_houses (user_id);
CREATE INDEX idx_open_houses_token ON public.open_houses (intake_token);

-- Open House Fields (configurable form fields)
CREATE TABLE public.open_house_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  open_house_id uuid NOT NULL REFERENCES public.open_houses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  field_key text NOT NULL,
  field_label text NOT NULL,
  field_type text NOT NULL DEFAULT 'text',
  is_required boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  options jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.open_house_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own open house fields"
  ON public.open_house_fields FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_oh_fields_oh ON public.open_house_fields (open_house_id);

-- Open House Visitors (captured submissions)
CREATE TABLE public.open_house_visitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  open_house_id uuid NOT NULL REFERENCES public.open_houses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  full_name text NOT NULL,
  email text,
  phone text,
  responses jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_existing_contact boolean NOT NULL DEFAULT false,
  fub_contact_id text,
  fub_match_status text DEFAULT 'pending',
  follow_up_status text NOT NULL DEFAULT 'uncontacted',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.open_house_visitors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own visitors"
  ON public.open_house_visitors FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Public insert policy for visitor form (no auth required, but we handle via edge function)
-- We'll use service role in edge function instead

CREATE INDEX idx_oh_visitors_oh ON public.open_house_visitors (open_house_id);
CREATE INDEX idx_oh_visitors_user ON public.open_house_visitors (user_id);

-- Open House Templates
CREATE TABLE public.open_house_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  form_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.open_house_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own templates"
  ON public.open_house_templates FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_oh_templates_user ON public.open_house_templates (user_id);

-- Trigger for updated_at
CREATE TRIGGER update_open_houses_updated_at
  BEFORE UPDATE ON public.open_houses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_oh_templates_updated_at
  BEFORE UPDATE ON public.open_house_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
