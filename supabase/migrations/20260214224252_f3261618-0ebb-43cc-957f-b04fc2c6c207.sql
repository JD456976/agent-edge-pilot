
-- Add onboarding and protection flags to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_protected boolean NOT NULL DEFAULT false;

-- Create admin audit events table
CREATE TABLE public.admin_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  action text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit events"
ON public.admin_audit_events
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert audit events"
ON public.admin_audit_events
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Update handle_new_user to set is_protected for the default admin email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  admin_exists BOOLEAN;
  is_default_admin BOOLEAN;
BEGIN
  is_default_admin := (NEW.email = 'jason.craig@chinattirealty.com');
  
  INSERT INTO public.profiles (user_id, name, email, is_protected)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.email, ''),
    is_default_admin
  );
  
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO admin_exists;
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN admin_exists AND NOT is_default_admin THEN 'agent'::app_role ELSE 'admin'::app_role END);
  
  RETURN NEW;
END;
$function$;
