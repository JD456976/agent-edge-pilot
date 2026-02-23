
-- Allow public (anon) reads on open_houses by intake_token for visitor form
CREATE POLICY "Public can view active open houses by token"
  ON public.open_houses FOR SELECT
  TO anon
  USING (status = 'active');

-- Allow public reads on open_house_fields for visitor form
CREATE POLICY "Public can view fields for active open houses"
  ON public.open_house_fields FOR SELECT
  TO anon
  USING (open_house_id IN (SELECT id FROM public.open_houses WHERE status = 'active'));
