UPDATE public.lancamentos_financeiros
   SET competencia_rubrica = NULL
 WHERE origem = 'FOLHA' AND status = 'CANCELADO' AND competencia_rubrica IS NOT NULL;

DELETE FROM public.borderos b
 WHERE b.folha_competencia_id IS NOT NULL
   AND b.status = 'MONTAGEM'
   AND NOT EXISTS (SELECT 1 FROM public.lancamentos_financeiros l WHERE l.bordero_id = b.id);

UPDATE public.folha_competencias c
   SET status = 'RASCUNHO', fechado_por = NULL, fechado_em = NULL
 WHERE c.status = 'FECHADA'
   AND NOT EXISTS (
     SELECT 1 FROM public.lancamentos_financeiros l
      WHERE l.origem = 'FOLHA'
        AND l.status <> 'CANCELADO'
        AND l.dados_extras->>'folha_competencia_id' = c.id::text
   );