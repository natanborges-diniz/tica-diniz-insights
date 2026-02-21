
-- 1. Criar função para verificar acesso de edição por módulo
CREATE OR REPLACE FUNCTION public.has_module_edit_access(_user_id uuid, _module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    public.has_role(_user_id, 'admin') 
    OR COALESCE(
      (SELECT access_level IN ('edita', 'total') 
       FROM public.user_module_permissions 
       WHERE user_id = _user_id AND module = _module),
      false
    )
$$;

-- 2. Atualizar RLS policies de metas_vendas
DROP POLICY IF EXISTS "Admin gestor write metas_vendas" ON public.metas_vendas;
CREATE POLICY "Module edit write metas_vendas" ON public.metas_vendas
  FOR ALL USING (has_module_edit_access(auth.uid(), 'config'))
  WITH CHECK (has_module_edit_access(auth.uid(), 'config'));

-- 3. Atualizar RLS policies de metas_periodos
DROP POLICY IF EXISTS "Admin gestor write metas_periodos" ON public.metas_periodos;
CREATE POLICY "Module edit write metas_periodos" ON public.metas_periodos
  FOR ALL USING (has_module_edit_access(auth.uid(), 'config'))
  WITH CHECK (has_module_edit_access(auth.uid(), 'config'));

-- 4. Atualizar RLS policies de calendario_feriados
DROP POLICY IF EXISTS "Admin gestor write calendario_feriados" ON public.calendario_feriados;
CREATE POLICY "Module edit write calendario_feriados" ON public.calendario_feriados
  FOR ALL USING (has_module_edit_access(auth.uid(), 'config'))
  WITH CHECK (has_module_edit_access(auth.uid(), 'config'));

-- 5. Atualizar RLS policies de fornecedor_marca
DROP POLICY IF EXISTS "Admin gestor write fornecedor_marca" ON public.fornecedor_marca;
CREATE POLICY "Module edit write fornecedor_marca" ON public.fornecedor_marca
  FOR ALL USING (has_module_edit_access(auth.uid(), 'config'))
  WITH CHECK (has_module_edit_access(auth.uid(), 'config'));

-- 6. Atualizar RLS policies de fornecedor_produto_depara
DROP POLICY IF EXISTS "Admin gestor write fornecedor_produto_depara" ON public.fornecedor_produto_depara;
CREATE POLICY "Module edit write fornecedor_produto_depara" ON public.fornecedor_produto_depara
  FOR ALL USING (has_module_edit_access(auth.uid(), 'config'))
  WITH CHECK (has_module_edit_access(auth.uid(), 'config'));

-- 7. Migrar gestores existentes: dar access_level 'edita' em config para quem tinha role gestor
-- gestor@teste.com (3572d84b)
INSERT INTO public.user_module_permissions (user_id, module, access_level) 
VALUES ('3572d84b-f2c4-4b63-a570-4eb96c75451b', 'config', 'edita')
ON CONFLICT (user_id, module) DO UPDATE SET access_level = 'edita';

-- Roseane já tem monitor=total, dar config=edita para manter capacidade de gestora
INSERT INTO public.user_module_permissions (user_id, module, access_level)
VALUES ('e44f5a58-f626-46fe-ac79-510ff39c08d4', 'config', 'edita')
ON CONFLICT (user_id, module) DO UPDATE SET access_level = 'edita';

-- 8. Remover roles de gestor e vendedor (manter apenas admin)
DELETE FROM public.user_roles WHERE role IN ('gestor', 'vendedor');
