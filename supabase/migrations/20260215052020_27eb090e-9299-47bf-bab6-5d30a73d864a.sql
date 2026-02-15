-- Fix infinite recursion between deals and deal_participants RLS policies.
-- The deals SELECT policy references deal_participants, and deal_participants SELECT references deals → loop.

-- Step 1: Create a security definer function to check deal ownership without triggering RLS
CREATE OR REPLACE FUNCTION public.is_deal_participant(_user_id uuid, _deal_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.deal_participants
    WHERE user_id = _user_id AND deal_id = _deal_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_deal_owner_or_admin(_user_id uuid, _deal_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.deals
    WHERE id = _deal_id AND assigned_to_user_id = _user_id
  ) OR public.has_role(_user_id, 'admin')
$$;

-- Step 2: Drop the recursive policies
DROP POLICY IF EXISTS "Users can view deals" ON public.deals;
DROP POLICY IF EXISTS "Users can manage assigned deals" ON public.deals;
DROP POLICY IF EXISTS "Users can view deal participants" ON public.deal_participants;
DROP POLICY IF EXISTS "Deal owners can manage participants" ON public.deal_participants;

-- Step 3: Recreate non-recursive policies for deals
CREATE POLICY "Users can view deals"
ON public.deals FOR SELECT
TO authenticated
USING (
  assigned_to_user_id = auth.uid()
  OR has_role(auth.uid(), 'admin')
  OR public.is_deal_participant(auth.uid(), id)
);

CREATE POLICY "Users can manage assigned deals"
ON public.deals FOR ALL
TO authenticated
USING (
  assigned_to_user_id = auth.uid()
  OR has_role(auth.uid(), 'admin')
);

-- Step 4: Recreate non-recursive policies for deal_participants
CREATE POLICY "Users can view deal participants"
ON public.deal_participants FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR has_role(auth.uid(), 'admin')
  OR public.is_deal_owner_or_admin(auth.uid(), deal_id)
);

CREATE POLICY "Deal owners can manage participants"
ON public.deal_participants FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'admin')
  OR public.is_deal_owner_or_admin(auth.uid(), deal_id)
);