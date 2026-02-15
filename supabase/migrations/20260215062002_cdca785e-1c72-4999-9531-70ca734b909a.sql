
-- Fix the overly permissive INSERT policy on fub_webhook_events
-- Replace with service-role-only insert (via edge function) + user self-insert
DROP POLICY "Service can insert webhook events" ON public.fub_webhook_events;
CREATE POLICY "Authenticated can insert webhook events" ON public.fub_webhook_events FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
