
-- Activity Events table
CREATE TABLE public.activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('lead', 'deal')),
  entity_id uuid NOT NULL,
  touch_type text NOT NULL CHECK (touch_type IN ('call', 'text', 'email', 'showing', 'note')),
  note text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_activity_events_user_created ON public.activity_events (user_id, created_at DESC);
CREATE INDEX idx_activity_events_entity ON public.activity_events (entity_type, entity_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

-- Users can manage own activity events
CREATE POLICY "Users can manage own activity events"
  ON public.activity_events
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Add last_touched_at to leads if missing
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS last_touched_at timestamptz NULL;
