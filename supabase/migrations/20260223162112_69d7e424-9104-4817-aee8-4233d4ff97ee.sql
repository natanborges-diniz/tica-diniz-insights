-- Fix os_hub_receitas SELECT policy to support multi-company access
DROP POLICY IF EXISTS "Tenant or admin read os_hub_receitas" ON public.os_hub_receitas;

CREATE POLICY "Tenant or admin read os_hub_receitas"
  ON public.os_hub_receitas
  FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR cod_empresa IN (
      SELECT uep.cod_empresa
      FROM public.user_empresa_permissions uep
      WHERE uep.user_id = auth.uid()
    )
  );