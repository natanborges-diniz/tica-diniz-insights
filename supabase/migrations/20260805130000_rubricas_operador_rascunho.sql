-- Operador cria rubrica em RASCUNHO (SPEC P2.5 §2: operador cria, admin aprova).
-- Bug: a policy da G1 só dava escrita a admin/master — Felix (operador) tomava
-- "new row violates row-level security policy" no Criar rascunho.
--
-- Segurança preservada:
--  * INSERT só em RASCUNHO, com criado_por = auth.uid() e sem aprovado_por;
--  * operador só cria para empresa onde tem permissão; rubrica global
--    (cod_empresa NULL) continua exclusiva de admin;
--  * aprovação/ativação segue apenas via edge function (service role, valida
--    papel admin + criador<>aprovador) — nenhuma policy de UPDATE permite
--    o operador ativar a própria rubrica.

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

-- Criador edita e exclui o PRÓPRIO rascunho (nunca rubrica ativa).
CREATE POLICY "Criador edita proprio rascunho"
ON public.rubricas_autorizadas FOR UPDATE TO authenticated
USING (criado_por = auth.uid() AND status = 'RASCUNHO')
WITH CHECK (criado_por = auth.uid() AND status = 'RASCUNHO' AND aprovado_por IS NULL);

CREATE POLICY "Criador exclui proprio rascunho"
ON public.rubricas_autorizadas FOR DELETE TO authenticated
USING (criado_por = auth.uid() AND status = 'RASCUNHO');

NOTIFY pgrst, 'reload schema';
