
-- Fix overly permissive INSERT policy on alerts
DROP POLICY "Users can insert alerts" ON public.alerts;
CREATE POLICY "Authenticated users can insert alerts" ON public.alerts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
