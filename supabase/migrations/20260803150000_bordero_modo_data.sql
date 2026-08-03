-- Modo de agendamento do borderô.
--
-- Dois cenários legítimos da operação:
--   DATA_UNICA (default, prática da casa): tudo é pago na `data_pagamento` do
--     borderô — normalmente a próxima segunda. Títulos que vencem ANTES dessa
--     data são antecipados para o próprio vencimento, para não pagar juros.
--   VENCIMENTO: cada título é agendado no seu próprio vencimento. Preserva
--     caixa, ao custo de os pagamentos ficarem espalhados na semana.
--
-- Em qualquer modo, um item pode ter data própria via
-- `lancamentos_financeiros.dados_extras.data_pagamento_item` — é o "mudar
-- apenas alguns" dentro do mesmo borderô.
--
-- A data-base de vencimento é a do DDA (btg_dda_titulos.data_vencimento)
-- sempre que o lançamento estiver vinculado a um título: o registro na CIP é
-- que vale para o fornecedor, não o vencimento importado do ERP.

ALTER TABLE public.borderos
  ADD COLUMN IF NOT EXISTS modo_data TEXT NOT NULL DEFAULT 'DATA_UNICA';

ALTER TABLE public.borderos
  DROP CONSTRAINT IF EXISTS borderos_modo_data_check;

ALTER TABLE public.borderos
  ADD CONSTRAINT borderos_modo_data_check
  CHECK (modo_data IN ('DATA_UNICA', 'VENCIMENTO'));

COMMENT ON COLUMN public.borderos.modo_data IS
  'DATA_UNICA: paga tudo em data_pagamento (antecipando o que vence antes). VENCIMENTO: paga cada titulo no proprio vencimento (do DDA quando houver). Override por item em lancamentos_financeiros.dados_extras.data_pagamento_item.';

NOTIFY pgrst, 'reload schema';
