
-- FIX: Corrigir policies de tabelas service-role-only
-- Problema: policies criadas com TO public ao invés de TO service_role

-- etl_controle
DROP POLICY IF EXISTS "Service role full access etl_controle" ON public.etl_controle;
CREATE POLICY "Service role full access etl_controle"
  ON public.etl_controle FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- pessoa
DROP POLICY IF EXISTS "Service role full access pessoa" ON public.pessoa;
CREATE POLICY "Service role full access pessoa"
  ON public.pessoa FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- produto
DROP POLICY IF EXISTS "Service role full access produto" ON public.produto;
CREATE POLICY "Service role full access produto"
  ON public.produto FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- venda_item
DROP POLICY IF EXISTS "Service role full access venda_item" ON public.venda_item;
CREATE POLICY "Service role full access venda_item"
  ON public.venda_item FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
