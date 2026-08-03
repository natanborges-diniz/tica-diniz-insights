ALTER TABLE public.rubricas_autorizadas
  ADD COLUMN IF NOT EXISTS forma_pagamento TEXT,
  ADD COLUMN IF NOT EXISTS favorecido_banco TEXT,
  ADD COLUMN IF NOT EXISTS favorecido_agencia TEXT,
  ADD COLUMN IF NOT EXISTS favorecido_conta TEXT,
  ADD COLUMN IF NOT EXISTS favorecido_tipo_conta TEXT DEFAULT 'CC';

COMMENT ON COLUMN public.rubricas_autorizadas.forma_pagamento IS
  'Como esta despesa e paga (PIX_KEY, TED, BANKSLIP). A provisao mensal copia isto e os dados do favorecido para o lancamento, evitando redigitacao.';

ALTER TABLE public.rubricas_autorizadas
  ADD COLUMN IF NOT EXISTS liberacoes_restantes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS liberacao_concedida_por UUID,
  ADD COLUMN IF NOT EXISTS liberacao_concedida_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS liberacao_motivo TEXT;

COMMENT ON COLUMN public.rubricas_autorizadas.liberacoes_restantes IS
  'Quantos lancamentos fora da faixa ainda passam sem nova conferencia. Cada envio consome um. Concedido na tela de liberacao do bordero.';

NOTIFY pgrst, 'reload schema';