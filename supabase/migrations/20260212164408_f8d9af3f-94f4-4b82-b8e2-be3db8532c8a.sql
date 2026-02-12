
-- =============================================
-- E0.2: RLS por tenant/empresa
-- =============================================

-- =============================================
-- 1. TENANT TABLES (cod_empresa filter + admin bypass)
-- =============================================

-- --- vendas_agregado_diario ---
DROP POLICY IF EXISTS "Public read vendas_agregado_diario" ON public.vendas_agregado_diario;

CREATE POLICY "Tenant or admin read vendas_agregado_diario"
  ON public.vendas_agregado_diario FOR SELECT TO authenticated
  USING (cod_empresa = public.get_user_empresa(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access vendas_agregado_diario"
  ON public.vendas_agregado_diario FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- --- os_hub_receitas ---
DROP POLICY IF EXISTS "Allow all access to os_hub_receitas" ON public.os_hub_receitas;

CREATE POLICY "Tenant or admin read os_hub_receitas"
  ON public.os_hub_receitas FOR SELECT TO authenticated
  USING (cod_empresa = public.get_user_empresa(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access os_hub_receitas"
  ON public.os_hub_receitas FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- --- pedidos_fornecedor ---
DROP POLICY IF EXISTS "Todos podem ler pedidos_fornecedor" ON public.pedidos_fornecedor;
DROP POLICY IF EXISTS "Todos podem inserir pedidos_fornecedor" ON public.pedidos_fornecedor;
DROP POLICY IF EXISTS "Todos podem atualizar pedidos_fornecedor" ON public.pedidos_fornecedor;

CREATE POLICY "Tenant or admin read pedidos_fornecedor"
  ON public.pedidos_fornecedor FOR SELECT TO authenticated
  USING (cod_empresa = public.get_user_empresa(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Tenant or admin insert pedidos_fornecedor"
  ON public.pedidos_fornecedor FOR INSERT TO authenticated
  WITH CHECK (cod_empresa = public.get_user_empresa(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Tenant or admin update pedidos_fornecedor"
  ON public.pedidos_fornecedor FOR UPDATE TO authenticated
  USING (cod_empresa = public.get_user_empresa(auth.uid()) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (cod_empresa = public.get_user_empresa(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access pedidos_fornecedor"
  ON public.pedidos_fornecedor FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- --- lojas_configuracao ---
DROP POLICY IF EXISTS "Public read lojas_configuracao" ON public.lojas_configuracao;
DROP POLICY IF EXISTS "Service role full access lojas_configuracao" ON public.lojas_configuracao;

CREATE POLICY "Tenant or admin read lojas_configuracao"
  ON public.lojas_configuracao FOR SELECT TO authenticated
  USING (cod_empresa = public.get_user_empresa(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access lojas_configuracao"
  ON public.lojas_configuracao FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- --- lojas_excecoes ---
DROP POLICY IF EXISTS "Public read lojas_excecoes" ON public.lojas_excecoes;
DROP POLICY IF EXISTS "Service role full access lojas_excecoes" ON public.lojas_excecoes;

CREATE POLICY "Tenant or admin read lojas_excecoes"
  ON public.lojas_excecoes FOR SELECT TO authenticated
  USING (cod_empresa = public.get_user_empresa(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access lojas_excecoes"
  ON public.lojas_excecoes FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- --- estoque_minimo_loja ---
DROP POLICY IF EXISTS "Public read estoque_minimo_loja" ON public.estoque_minimo_loja;
DROP POLICY IF EXISTS "Service role full access estoque_minimo_loja" ON public.estoque_minimo_loja;

CREATE POLICY "Tenant or admin read estoque_minimo_loja"
  ON public.estoque_minimo_loja FOR SELECT TO authenticated
  USING (cod_empresa = public.get_user_empresa(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access estoque_minimo_loja"
  ON public.estoque_minimo_loja FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- --- venda (tenant read + service_role full) ---
DROP POLICY IF EXISTS "Service role full access venda" ON public.venda;

CREATE POLICY "Tenant or admin read venda"
  ON public.venda FOR SELECT TO authenticated
  USING (cod_empresa = public.get_user_empresa(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access venda"
  ON public.venda FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================
-- 2. GLOBAL TABLES (authenticated read, admin/gestor write)
-- =============================================

-- --- empresa (remove anon access) ---
DROP POLICY IF EXISTS "Public read empresa" ON public.empresa;
DROP POLICY IF EXISTS "Service role full access empresa" ON public.empresa;

CREATE POLICY "Authenticated read empresa"
  ON public.empresa FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Service role full access empresa"
  ON public.empresa FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- --- metas_vendas ---
DROP POLICY IF EXISTS "Public read metas_vendas" ON public.metas_vendas;
DROP POLICY IF EXISTS "Service role full access metas_vendas" ON public.metas_vendas;

CREATE POLICY "Authenticated read metas_vendas"
  ON public.metas_vendas FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admin gestor write metas_vendas"
  ON public.metas_vendas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Service role full access metas_vendas"
  ON public.metas_vendas FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- --- metas_periodos ---
DROP POLICY IF EXISTS "Public read metas_periodos" ON public.metas_periodos;
DROP POLICY IF EXISTS "Service role full access metas_periodos" ON public.metas_periodos;

CREATE POLICY "Authenticated read metas_periodos"
  ON public.metas_periodos FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admin gestor write metas_periodos"
  ON public.metas_periodos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Service role full access metas_periodos"
  ON public.metas_periodos FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- --- calendario_feriados ---
DROP POLICY IF EXISTS "Public read calendario_feriados" ON public.calendario_feriados;
DROP POLICY IF EXISTS "Service role full access calendario_feriados" ON public.calendario_feriados;

CREATE POLICY "Authenticated read calendario_feriados"
  ON public.calendario_feriados FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admin gestor write calendario_feriados"
  ON public.calendario_feriados FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Service role full access calendario_feriados"
  ON public.calendario_feriados FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- --- fornecedor_marca ---
DROP POLICY IF EXISTS "Public read fornecedor_marca" ON public.fornecedor_marca;
DROP POLICY IF EXISTS "Service role full access fornecedor_marca" ON public.fornecedor_marca;

CREATE POLICY "Authenticated read fornecedor_marca"
  ON public.fornecedor_marca FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admin gestor write fornecedor_marca"
  ON public.fornecedor_marca FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Service role full access fornecedor_marca"
  ON public.fornecedor_marca FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- --- fornecedor_produto_depara ---
DROP POLICY IF EXISTS "Todos podem ler depara" ON public.fornecedor_produto_depara;
DROP POLICY IF EXISTS "Todos podem inserir depara" ON public.fornecedor_produto_depara;
DROP POLICY IF EXISTS "Todos podem atualizar depara" ON public.fornecedor_produto_depara;
DROP POLICY IF EXISTS "Todos podem deletar depara" ON public.fornecedor_produto_depara;

CREATE POLICY "Authenticated read fornecedor_produto_depara"
  ON public.fornecedor_produto_depara FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admin gestor write fornecedor_produto_depara"
  ON public.fornecedor_produto_depara FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Service role full access fornecedor_produto_depara"
  ON public.fornecedor_produto_depara FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================
-- 3. SERVICE-ROLE ONLY (already correct, no changes needed)
-- pessoa, produto, venda_item, etl_controle already have only service_role policies
-- =============================================
