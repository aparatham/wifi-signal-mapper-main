CREATE OR REPLACE FUNCTION public.is_developer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'developer'::public.app_role
  );
$$;
REVOKE ALL ON FUNCTION public.is_developer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_developer() TO authenticated;