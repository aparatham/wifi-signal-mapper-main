CREATE TYPE public.app_role AS ENUM ('developer');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their own assigned roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_developer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
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
GRANT EXECUTE ON FUNCTION public.is_developer() TO authenticated, service_role;

CREATE TABLE public.wifi_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id text NOT NULL,
  floor_name text NOT NULL,
  x double precision NOT NULL CHECK (x >= 0 AND x <= 1000),
  y double precision NOT NULL CHECK (y >= 0 AND y <= 900),
  rssi_dbm integer NOT NULL CHECK (rssi_dbm >= -120 AND rssi_dbm <= 0),
  measured_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wifi_measurements TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.wifi_measurements TO authenticated;
GRANT ALL ON public.wifi_measurements TO service_role;
ALTER TABLE public.wifi_measurements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view Wi-Fi measurements"
  ON public.wifi_measurements FOR SELECT TO anon, authenticated
  USING (true);
CREATE POLICY "Developers can add Wi-Fi measurements"
  ON public.wifi_measurements FOR INSERT TO authenticated
  WITH CHECK (public.is_developer());
CREATE POLICY "Developers can adjust Wi-Fi measurements"
  ON public.wifi_measurements FOR UPDATE TO authenticated
  USING (public.is_developer())
  WITH CHECK (public.is_developer());
CREATE POLICY "Developers can remove Wi-Fi measurements"
  ON public.wifi_measurements FOR DELETE TO authenticated
  USING (public.is_developer());

CREATE INDEX wifi_measurements_building_floor_idx
  ON public.wifi_measurements (building_id, floor_name);