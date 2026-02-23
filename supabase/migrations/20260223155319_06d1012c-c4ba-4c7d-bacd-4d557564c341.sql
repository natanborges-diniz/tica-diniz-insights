-- Fix: policy must check user_empresa_permissions for multi-store users
DROP POLICY IF EXISTS "Gestor read own company pedidos" ON public.pedidos_fornecedor;

CREATE POLICY "User read permitted company pedidos"
  ON public.pedidos_fornecedor
  FOR SELECT
  USING (
    cod_empresa IN (
      SELECT uep.cod_empresa FROM public.user_empresa_permissions uep WHERE uep.user_id = auth.uid()
    )
  );