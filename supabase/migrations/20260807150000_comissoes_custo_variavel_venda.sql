-- Comissões voltam ao bloco variável de venda (decisão do stakeholder, 07/08).
--
-- A revisão 20260807130000 movia 2.2 COMISSOES para despesa de PESSOAL
-- (tratamento societário). O stakeholder corrigiu: nosso DRE é GERENCIAL e a
-- comissão é diretamente ligada à venda e variável — pertence ao bloco que
-- forma a MARGEM DE CONTRIBUIÇÃO (impostos s/ venda, taxas de cartão,
-- devoluções, comissões). Na contabilidade oficial o contador reclassifica
-- como despesa comercial; aqui o que importa é o que sobra de cada venda.
--
-- Idempotente e correta em qualquer ordem com a 20260807130000.
UPDATE public.dre_plano_contas
SET grupo_dre = 'DEDUCOES', categoria = 'COMISSOES', sinal = '-'
WHERE conta_numero = '2.2';

-- Re-alinha o histórico da 2.2 (mesma regra do backfill geral).
UPDATE public.lancamentos_financeiros lf
SET natureza = p.grupo_dre,
    categoria = p.categoria
FROM public.dre_plano_contas p
WHERE p.conta_numero = '2.2'
  AND lf.dados_extras->>'conta_numero' = '2.2'
  AND (lf.natureza IS DISTINCT FROM p.grupo_dre
       OR lf.categoria IS DISTINCT FROM p.categoria);

NOTIFY pgrst, 'reload schema';
