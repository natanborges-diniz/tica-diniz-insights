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