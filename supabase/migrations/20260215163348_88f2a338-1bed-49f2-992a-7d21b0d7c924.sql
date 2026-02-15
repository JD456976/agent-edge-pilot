-- Allow admins to view all entitlements
CREATE POLICY "Admins can view all entitlements"
ON public.user_entitlements
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to insert entitlements for any user
CREATE POLICY "Admins can insert entitlements"
ON public.user_entitlements
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Allow admins to update entitlements for any user
CREATE POLICY "Admins can update entitlements"
ON public.user_entitlements
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to delete entitlements
CREATE POLICY "Admins can delete entitlements"
ON public.user_entitlements
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));