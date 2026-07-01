
-- FASE 1: Corrigir policies "Service role full access" que estavam TO public
-- Restringir apenas ao role service_role

-- btg_tokens
DROP POLICY IF EXISTS "Service role full access btg_tokens" ON public.btg_tokens;
CREATE POLICY "Service role full access btg_tokens"
  ON public.btg_tokens FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- btg_contas_bancarias
DROP POLICY IF EXISTS "Service role full access btg_contas_bancarias" ON public.btg_contas_bancarias;
CREATE POLICY "Service role full access btg_contas_bancarias"
  ON public.btg_contas_bancarias FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- btg_extrato
DROP POLICY IF EXISTS "Service role full access btg_extrato" ON public.btg_extrato;
CREATE POLICY "Service role full access btg_extrato"
  ON public.btg_extrato FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- fornecedor_configuracao
DROP POLICY IF EXISTS "Service role full access fornecedor_configuracao" ON public.fornecedor_configuracao;
CREATE POLICY "Service role full access fornecedor_configuracao"
  ON public.fornecedor_configuracao FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- user_empresa_permissions
DROP POLICY IF EXISTS "Service role full access user_empresa_permissions" ON public.user_empresa_permissions;
CREATE POLICY "Service role full access user_empresa_permissions"
  ON public.user_empresa_permissions FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- user_module_permissions
DROP POLICY IF EXISTS "Service role full access user_module_permissions" ON public.user_module_permissions;
CREATE POLICY "Service role full access user_module_permissions"
  ON public.user_module_permissions FOR ALL
  TO service_role USING (true) WITH CHECK (true);
