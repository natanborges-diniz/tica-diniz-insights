
-- Tabela de permissões granulares por página (aditiva ao user_module_permissions)
CREATE TABLE public.user_page_permissions (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page_key TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, page_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_page_permissions TO authenticated;
GRANT ALL ON public.user_page_permissions TO service_role;

ALTER TABLE public.user_page_permissions ENABLE ROW LEVEL SECURITY;

-- Usuário lê as próprias permissões
CREATE POLICY "Users read own page permissions"
  ON public.user_page_permissions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Admin gerencia (insert/update/delete)
CREATE POLICY "Admins manage page permissions"
  ON public.user_page_permissions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Função: acesso à página (admin OR módulo liberado OR page permission explícita)
CREATE OR REPLACE FUNCTION public.has_page_access(_user_id UUID, _page_key TEXT, _module TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin')
    OR public.has_module_access(_user_id, _module)
    OR EXISTS (
      SELECT 1 FROM public.user_page_permissions
      WHERE user_id = _user_id AND page_key = _page_key
    );
$$;
