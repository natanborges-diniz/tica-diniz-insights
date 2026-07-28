-- Alinha as regras seed de tarifa ao padrão do DRE (natureza = grupo_dre,
-- categoria = categoria do dre_plano_contas), em vez do valor inventado
-- 'DESPESAS_FINANCEIRAS' que o classificarGrupoDre não reconhece.
-- TARIFA/JUROS → 3.6.x (DESPESAS_OPERACIONAIS / FINANCEIRO_OPERACIONAL)
-- IOF → 4.3 (OUTRAS_DESPESAS / FINANCEIRO)

UPDATE public.extrato_regras_classificacao
SET natureza = 'DESPESAS_OPERACIONAIS', categoria = 'FINANCEIRO_OPERACIONAL'
WHERE natureza = 'DESPESAS_FINANCEIRAS'
  AND (padrao_descricao ILIKE '%TARIFA%' OR padrao_descricao ILIKE '%JUROS%');

UPDATE public.extrato_regras_classificacao
SET natureza = 'OUTRAS_DESPESAS', categoria = 'FINANCEIRO'
WHERE natureza = 'DESPESAS_FINANCEIRAS'
  AND padrao_descricao ILIKE '%IOF%';

-- Lançamentos de tarifa já criados com a natureza antiga (se houver)
UPDATE public.lancamentos_financeiros
SET natureza = 'DESPESAS_OPERACIONAIS', categoria = 'FINANCEIRO_OPERACIONAL'
WHERE origem = 'EXTRATO' AND natureza = 'DESPESAS_FINANCEIRAS';
