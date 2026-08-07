-- Integração Conect$flow → Crediário (SPEC_CREDIARIO_LOJA.md §Integração).
-- A solicitação de boleto do Conect$flow emite via endpoint m2m; a liberação
-- local vira o ledger espelho, idempotente pela referência externa.
ALTER TABLE public.crediario_liberacoes
  ADD COLUMN IF NOT EXISTS referencia_externa TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_crediario_lib_ref_externa
  ON public.crediario_liberacoes (referencia_externa)
  WHERE referencia_externa IS NOT NULL;

NOTIFY pgrst, 'reload schema';
