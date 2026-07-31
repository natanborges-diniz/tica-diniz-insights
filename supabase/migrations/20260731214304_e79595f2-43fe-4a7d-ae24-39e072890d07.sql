ALTER TABLE public.lancamentos_legado_sombra_backup ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.lancamentos_legado_sombra_backup FROM anon, authenticated;
GRANT SELECT ON public.lancamentos_legado_sombra_backup TO authenticated;
GRANT ALL ON public.lancamentos_legado_sombra_backup TO service_role;

CREATE POLICY "Admins podem ver backup legado"
ON public.lancamentos_legado_sombra_backup
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));