-- Fix RLS policies on pedidos_fornecedor: change from RESTRICTIVE to PERMISSIVE
-- Currently all SELECT policies are RESTRICTIVE which requires ALL to pass (impossible for non-admin)

-- Drop the conflicting restrictive SELECT policies
DROP POLICY IF EXISTS "Admin read all pedidos" ON public.pedidos_fornecedor;
DROP POLICY IF EXISTS "Gestor read own company pedidos" ON public.pedidos_fornecedor;
DROP POLICY IF EXISTS "Tenant or admin read pedidos_fornecedor" ON public.pedidos_fornecedor;

-- Recreate as PERMISSIVE (default) — user needs to satisfy only ONE
CREATE POLICY "Admin read all pedidos"
  ON public.pedidos_fornecedor
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Gestor read own company pedidos"
  ON public.pedidos_fornecedor
  FOR SELECT
  USING (cod_empresa = get_user_empresa(auth.uid()));

-- Also fix INSERT and UPDATE policies (they were RESTRICTIVE too)
DROP POLICY IF EXISTS "Tenant or admin insert pedidos_fornecedor" ON public.pedidos_fornecedor;
DROP POLICY IF EXISTS "Tenant or admin update pedidos_fornecedor" ON public.pedidos_fornecedor;

CREATE POLICY "Tenant or admin insert pedidos_fornecedor"
  ON public.pedidos_fornecedor
  FOR INSERT
  WITH CHECK ((cod_empresa = get_user_empresa(auth.uid())) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Tenant or admin update pedidos_fornecedor"
  ON public.pedidos_fornecedor
  FOR UPDATE
  USING ((cod_empresa = get_user_empresa(auth.uid())) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK ((cod_empresa = get_user_empresa(auth.uid())) OR has_role(auth.uid(), 'admin'::app_role));