
-- Tabela de permissões por módulo por usuário
CREATE TABLE public.user_module_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module)
);

-- RLS
ALTER TABLE public.user_module_permissions ENABLE ROW LEVEL SECURITY;

-- Usuários lêem suas próprias permissões
CREATE POLICY "Users read own permissions"
  ON public.user_module_permissions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Admins gerenciam tudo
CREATE POLICY "Admins manage all permissions"
  ON public.user_module_permissions
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Service role full access
CREATE POLICY "Service role full access user_module_permissions"
  ON public.user_module_permissions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Trigger updated_at
CREATE TRIGGER update_user_module_permissions_updated_at
  BEFORE UPDATE ON public.user_module_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Função helper para checar permissão de módulo (security definer)
CREATE OR REPLACE FUNCTION public.has_module_access(_user_id uuid, _module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT enabled FROM public.user_module_permissions WHERE user_id = _user_id AND module = _module),
    false
  )
$$;
