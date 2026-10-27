CREATE OR REPLACE FUNCTION public.assign_listed_developer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL
     AND lower(NEW.email) IN ('daddy@tkmce.ac.in', 'bigdaddy@tkmce.ac.in') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'developer'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.assign_listed_developer() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER on_auth_user_developer_assign
AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.assign_listed_developer();

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'developer'::public.app_role FROM auth.users
WHERE email_confirmed_at IS NOT NULL
  AND lower(email) IN ('daddy@tkmce.ac.in', 'bigdaddy@tkmce.ac.in')
ON CONFLICT (user_id, role) DO NOTHING;