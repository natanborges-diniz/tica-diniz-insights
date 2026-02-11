
-- Migration 2: user_roles + helper functions + protect_cod_empresa + admin policies

CREATE TYPE public.app_role AS ENUM ('admin', 'gestor', 'vendedor');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Helper functions (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.get_user_empresa(_user_id UUID)
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT cod_empresa FROM public.profiles WHERE id = _user_id LIMIT 1 $$;

-- Policies for user_roles
CREATE POLICY "Admins read all roles" ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admin policies for profiles (now that has_role exists)
CREATE POLICY "Admins read all profiles" ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update any profile" ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trigger protect_cod_empresa (with auth.uid() IS NULL guard)
CREATE OR REPLACE FUNCTION public.protect_cod_empresa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.cod_empresa IS DISTINCT FROM OLD.cod_empresa THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Unauthenticated';
    END IF;
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Only admins can change cod_empresa';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_cod_empresa_trigger
  BEFORE UPDATE ON public.profiles FOR EACH ROW
  EXECUTE FUNCTION public.protect_cod_empresa();
