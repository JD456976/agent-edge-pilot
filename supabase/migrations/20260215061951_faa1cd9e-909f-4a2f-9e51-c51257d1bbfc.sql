
-- 1. FUB webhook events (for real-time webhook listener)
CREATE TABLE public.fub_webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  fub_id TEXT,
  entity_type TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.fub_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own webhook events" ON public.fub_webhook_events FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Service can insert webhook events" ON public.fub_webhook_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own webhook events" ON public.fub_webhook_events FOR UPDATE USING (user_id = auth.uid());
CREATE INDEX idx_fub_webhook_events_user ON public.fub_webhook_events(user_id, created_at DESC);

-- 2. FUB activity log (merged timeline from FUB)
CREATE TABLE public.fub_activity_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  fub_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  activity_type TEXT NOT NULL,
  direction TEXT,
  subject TEXT,
  body_preview TEXT,
  duration_seconds INTEGER,
  occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
  synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.fub_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own FUB activity" ON public.fub_activity_log FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX idx_fub_activity_entity ON public.fub_activity_log(entity_id, occurred_at DESC);

-- 3. FUB appointments (synced from FUB)
CREATE TABLE public.fub_appointments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  fub_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  description TEXT,
  start_at TIMESTAMP WITH TIME ZONE NOT NULL,
  end_at TIMESTAMP WITH TIME ZONE,
  location TEXT,
  attendees JSONB DEFAULT '[]'::jsonb,
  related_lead_id UUID,
  related_deal_id UUID,
  synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.fub_appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own appointments" ON public.fub_appointments FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX idx_fub_appointments_user_date ON public.fub_appointments(user_id, start_at);

-- 4. Lead routing rules
CREATE TABLE public.lead_routing_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  rule_name TEXT NOT NULL,
  criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  target_user_id UUID,
  priority INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_routing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage routing rules" ON public.lead_routing_rules FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view routing rules" ON public.lead_routing_rules FOR SELECT USING (auth.uid() IS NOT NULL);

-- 5. FUB push log (two-way sync tracking)
CREATE TABLE public.fub_push_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  fub_id TEXT,
  action TEXT NOT NULL,
  fields_pushed JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  pushed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.fub_push_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own push logs" ON public.fub_push_log FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 6. AI follow-up drafts
CREATE TABLE public.ai_follow_up_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  draft_type TEXT NOT NULL DEFAULT 'email',
  subject TEXT,
  body TEXT NOT NULL,
  context_summary TEXT,
  tone TEXT DEFAULT 'professional',
  status TEXT NOT NULL DEFAULT 'draft',
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_follow_up_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own drafts" ON public.ai_follow_up_drafts FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
