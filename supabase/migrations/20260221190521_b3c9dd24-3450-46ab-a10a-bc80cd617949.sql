
-- Tabela para controlar quais empresas cada usuário pode acessar
CREATE TABLE public.user_empresa_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cod_empresa integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, cod_empresa)
);

-- Enable RLS
ALTER TABLE public.user_empresa_permissions ENABLE ROW LEVEL SECURITY;

-- Users can read their own permissions
CREATE POLICY "Users read own empresa permissions"
  ON public.user_empresa_permissions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Admins full access
CREATE POLICY "Admins manage empresa permissions"
  ON public.user_empresa_permissions
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Service role full access
CREATE POLICY "Service role full access user_empresa_permissions"
  ON public.user_empresa_permissions
  FOR ALL
  USING (true)
  WITH CHECK (true);
