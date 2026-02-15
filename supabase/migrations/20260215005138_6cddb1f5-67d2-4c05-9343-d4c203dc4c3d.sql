
-- 1. Add status and soft-delete columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

-- 2. Create user_invitations table
CREATE TABLE public.user_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text,
  role text NOT NULL DEFAULT 'agent',
  organization_id uuid REFERENCES public.organizations(id),
  team_ids uuid[] DEFAULT '{}',
  invited_by uuid NOT NULL,
  invite_token text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  status text NOT NULL DEFAULT 'pending',
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

-- Admins can manage invitations
CREATE POLICY "Admins can manage invitations"
  ON public.user_invitations FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 3. Add organization_id to profiles for org scoping
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

-- 4. Create a function to check if user is the last admin in their org
CREATE OR REPLACE FUNCTION public.is_last_admin_in_org(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    SELECT count(*) FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.role = 'admin'
      AND p.organization_id = (SELECT organization_id FROM public.profiles WHERE user_id = p_user_id)
      AND p.is_deleted = false
      AND p.status = 'active'
  ) <= 1
$$;
