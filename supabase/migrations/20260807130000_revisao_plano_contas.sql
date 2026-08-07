-- Revisão do plano de contas (docs/REVISAO_PLANO_CONTAS.md) — 07/08/2026.
-- Alinha o plano ao padrão de controladoria de varejo e re-etiqueta o
-- HISTÓRICO (backfill por conta_numero). Não toca em status, valores,
-- pagamentos ou conciliações — só natureza/categoria de relatório.

-- ─── 1. Receita limpa: transferência e empréstimo NÃO são receita ──────────
-- Hoje inflam a RECEITA_BRUTA do DRE. Viram movimentações de caixa (grupo
-- próprio, fora do resultado — exibido ao final, como INVESTIMENTOS).
UPDATE public.dre_plano_contas
SET grupo_dre = 'MOVIMENTACOES_CAIXA', categoria = 'MOVIMENTACOES', sinal = '+'
WHERE conta_numero IN ('1.10', '1.11');

-- ─── 2. Deduções só com o que deduz receita ────────────────────────────────
-- Comissão de vendedor é despesa de PESSOAL (padrão de mercado), não dedução.
UPDATE public.dre_plano_contas
SET grupo_dre = 'DESPESAS_OPERACIONAIS', categoria = 'PESSOAL'
WHERE conta_numero = '2.2';

-- Taxas municipais (alvará, licenças) são despesa administrativa.
UPDATE public.dre_plano_contas
SET grupo_dre = 'DESPESAS_OPERACIONAIS', categoria = 'ADMINISTRATIVO'
WHERE conta_numero = '3.1.1';

-- IRRF (folha) acompanha PESSOAL. (Validar com contabilidade: se for IR de
-- sócio pessoa física, o correto é movimentação de sócios.)
UPDATE public.dre_plano_contas
SET grupo_dre = 'DESPESAS_OPERACIONAIS', categoria = 'PESSOAL'
WHERE conta_numero = '3.1.3';

-- Créditos devolvidos a clientes = redutor de receita (devoluções).
UPDATE public.dre_plano_contas
SET grupo_dre = 'DEDUCOES', categoria = 'DEVOLUCOES', sinal = '-'
WHERE conta_numero = '3.11';

-- ─── 3. CAPEX unificado em INVESTIMENTOS ───────────────────────────────────
-- 5.5/5.7/5.8 estavam em OUTRAS_DESPESAS (grupo legado) — são investimento.
UPDATE public.dre_plano_contas
SET grupo_dre = 'INVESTIMENTOS', categoria = 'CAPEX', sinal = '-'
WHERE conta_numero IN ('5.5', '5.7', '5.8');

-- Normaliza a categoria de todo o grupo (havia INVESTIMENTOS e CAPEX mistos).
UPDATE public.dre_plano_contas
SET categoria = 'CAPEX'
WHERE grupo_dre = 'INVESTIMENTOS';

-- ─── 4. Sócios: pró-labore no resultado, distribuição FORA dele ────────────
-- Pró-labore formal (fixo, INSS) é despesa de pessoal. Só cria se não existir.
INSERT INTO public.dre_plano_contas (conta_numero, conta_descricao, grupo_dre, categoria, sinal)
SELECT '3.4.90', 'PRO-LABORE SOCIOS', 'DESPESAS_OPERACIONAIS', 'PESSOAL', '-'
WHERE NOT EXISTS (
  SELECT 1 FROM public.dre_plano_contas WHERE conta_descricao ILIKE '%LABORE%'
);

-- Distribuição de lucros / retiradas variáveis: NÃO passam pelo resultado —
-- grupo próprio, exibido após o resultado líquido (senão o lucro da loja
-- oscila conforme o quanto os sócios sacam).
INSERT INTO public.dre_plano_contas (conta_numero, conta_descricao, grupo_dre, categoria, sinal)
SELECT '7.1', 'DISTRIBUICAO DE LUCROS / RETIRADAS', 'MOVIMENTACOES_SOCIOS', 'SOCIOS', '-'
WHERE NOT EXISTS (SELECT 1 FROM public.dre_plano_contas WHERE conta_numero = '7.1');

INSERT INTO public.dre_plano_contas (conta_numero, conta_descricao, grupo_dre, categoria, sinal)
SELECT '7.2', 'APORTE DE SOCIOS', 'MOVIMENTACOES_SOCIOS', 'SOCIOS', '+'
WHERE NOT EXISTS (SELECT 1 FROM public.dre_plano_contas WHERE conta_numero = '7.2');

-- ─── 5. Bar da loja (experiência do cliente → MARKETING) ───────────────────
INSERT INTO public.dre_plano_contas (conta_numero, conta_descricao, grupo_dre, categoria, sinal)
SELECT '3.5.17', 'MATERIAL BAR / EXPERIENCIA DA LOJA', 'DESPESAS_OPERACIONAIS', 'MARKETING', '-'
WHERE NOT EXISTS (
  SELECT 1 FROM public.dre_plano_contas WHERE conta_descricao ILIKE '%BAR%'
);

-- ─── 6. BACKFILL: histórico re-etiquetado a partir do número da conta ──────
-- Todo lançamento classificado guarda dados_extras.conta_numero; re-deriva
-- natureza (grupo) e categoria do plano revisado. Idempotente.
UPDATE public.lancamentos_financeiros lf
SET natureza = p.grupo_dre,
    categoria = p.categoria
FROM public.dre_plano_contas p
WHERE p.conta_numero = lf.dados_extras->>'conta_numero'
  AND (lf.natureza IS DISTINCT FROM p.grupo_dre
       OR lf.categoria IS DISTINCT FROM p.categoria);

NOTIFY pgrst, 'reload schema';
