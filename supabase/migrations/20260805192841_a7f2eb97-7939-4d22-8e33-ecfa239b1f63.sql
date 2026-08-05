CREATE POLICY "Operador cria rubrica rascunho"
ON public.rubricas_autorizadas FOR INSERT TO authenticated
WITH CHECK (
  status = 'RASCUNHO'
  AND criado_por = auth.uid()
  AND aprovado_por IS NULL
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'master')
    OR (
      cod_empresa IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.user_empresa_permissions uep
        WHERE uep.user_id = auth.uid()
          AND uep.cod_empresa = rubricas_autorizadas.cod_empresa
      )
    )
  )
);

CREATE POLICY "Criador edita proprio rascunho"
ON public.rubricas_autorizadas FOR UPDATE TO authenticated
USING (criado_por = auth.uid() AND status = 'RASCUNHO')
WITH CHECK (criado_por = auth.uid() AND status = 'RASCUNHO' AND aprovado_por IS NULL);

CREATE POLICY "Criador exclui proprio rascunho"
ON public.rubricas_autorizadas FOR DELETE TO authenticated
USING (criado_por = auth.uid() AND status = 'RASCUNHO');

NOTIFY pgrst, 'reload schema';