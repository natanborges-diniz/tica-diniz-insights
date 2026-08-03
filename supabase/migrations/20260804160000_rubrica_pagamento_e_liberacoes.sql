-- Rubrica passa a carregar a forma de pagamento, e a liberação ganha escopo.
--
-- DUAS DORES DA OPERAÇÃO:
--
-- 1. Os dados bancários viviam só em lancamentos_financeiros.dados_extras, ou
--    seja: no lançamento daquele mês. Toda competência nova nascia sem forma de
--    pagamento e alguém redigitava banco, agência, conta, nome e CNPJ do mesmo
--    fornecedor de sempre. A rubrica já guarda favorecido e conta do DRE — falta
--    guardar COMO se paga.
--
-- 2. Liberar um item fora da faixa valia só para aquele borderô. Se o aluguel
--    subiu de vez, o admin liberava de novo todo mês, e a repetição transforma
--    a conferência em carimbo — que é justamente o oposto do controle.

-- ── Forma de pagamento na rubrica ──
ALTER TABLE public.rubricas_autorizadas
  ADD COLUMN IF NOT EXISTS forma_pagamento TEXT,              -- PIX_KEY | TED | BANKSLIP
  ADD COLUMN IF NOT EXISTS favorecido_banco TEXT,
  ADD COLUMN IF NOT EXISTS favorecido_agencia TEXT,
  ADD COLUMN IF NOT EXISTS favorecido_conta TEXT,
  ADD COLUMN IF NOT EXISTS favorecido_tipo_conta TEXT DEFAULT 'CC';

COMMENT ON COLUMN public.rubricas_autorizadas.forma_pagamento IS
  'Como esta despesa e paga (PIX_KEY, TED, BANKSLIP). A provisao mensal copia isto e os dados do favorecido para o lancamento, evitando redigitacao.';

-- ── Liberações com escopo ──
--
-- Crédito de liberações concedido pelo admin. Enquanto houver saldo, um item
-- fora da faixa daquela rubrica entra como se estivesse dentro — e cada envio
-- consome um. Zero significa "volta a pedir conferência".
--
-- NULL em liberacoes_restantes e 0 são equivalentes; usamos 0 como padrão para
-- a aritmética não precisar de coalesce em todo lugar.
ALTER TABLE public.rubricas_autorizadas
  ADD COLUMN IF NOT EXISTS liberacoes_restantes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS liberacao_concedida_por UUID,
  ADD COLUMN IF NOT EXISTS liberacao_concedida_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS liberacao_motivo TEXT;

COMMENT ON COLUMN public.rubricas_autorizadas.liberacoes_restantes IS
  'Quantos lancamentos fora da faixa ainda passam sem nova conferencia. Cada envio consome um. Concedido na tela de liberacao do bordero.';

NOTIFY pgrst, 'reload schema';
