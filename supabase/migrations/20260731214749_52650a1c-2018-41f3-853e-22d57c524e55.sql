-- recebiveis_cartao_parcelas: escopo por loja via recebivel pai
DROP POLICY IF EXISTS "Authenticated read recebiveis_cartao_parcelas" ON public.recebiveis_cartao_parcelas;
DROP POLICY IF EXISTS "Authenticated insert recebiveis_cartao_parcelas" ON public.recebiveis_cartao_parcelas;

CREATE POLICY "Tenant read recebiveis_cartao_parcelas"
ON public.recebiveis_cartao_parcelas FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.recebiveis_cartao rc
    JOIN public.user_empresa_permissions uep
      ON uep.cod_empresa = rc.cod_empresa AND uep.user_id = auth.uid()
    WHERE rc.id = recebiveis_cartao_parcelas.recebivel_id
  )
);

CREATE POLICY "Tenant insert recebiveis_cartao_parcelas"
ON public.recebiveis_cartao_parcelas FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.recebiveis_cartao rc
    JOIN public.user_empresa_permissions uep
      ON uep.cod_empresa = rc.cod_empresa AND uep.user_id = auth.uid()
    WHERE rc.id = recebiveis_cartao_parcelas.recebivel_id
  )
);

-- rubricas_autorizadas: escopo por loja (rubrica global = cod_empresa nulo)
DROP POLICY IF EXISTS "Authenticated read rubricas" ON public.rubricas_autorizadas;

CREATE POLICY "Tenant read rubricas"
ON public.rubricas_autorizadas FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'master')
  OR cod_empresa IS NULL
  OR EXISTS (
    SELECT 1 FROM public.user_empresa_permissions uep
    WHERE uep.user_id = auth.uid() AND uep.cod_empresa = rubricas_autorizadas.cod_empresa
  )
);

-- sync_log: somente admin
DROP POLICY IF EXISTS "Public read sync_log" ON public.sync_log;

CREATE POLICY "Admin read sync_log"
ON public.sync_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));