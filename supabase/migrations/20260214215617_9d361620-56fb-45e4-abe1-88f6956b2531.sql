
-- Allow all authenticated users to view profiles (for team/participant names)
CREATE POLICY "Authenticated can view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (true);

-- Allow users to delete alerts related to their data (for wipe functionality)
CREATE POLICY "Users can delete related alerts" ON public.alerts
  FOR DELETE TO authenticated
  USING (
    related_lead_id IN (SELECT id FROM public.leads WHERE assigned_to_user_id = auth.uid())
    OR related_deal_id IN (SELECT id FROM public.deals WHERE assigned_to_user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

-- Update trigger: first user gets admin role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  admin_exists BOOLEAN;
BEGIN
  INSERT INTO public.profiles (user_id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.email, '')
  );
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO admin_exists;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN admin_exists THEN 'agent'::app_role ELSE 'admin'::app_role END);
  RETURN NEW;
END;
$$;
