-- ═══════════════════════════════════════════════════════════════════
-- Pix dinâmico (instant collections BTG) via pix-charges
-- Reusa payment_links com adquirente='PIX_BTG' (qr_code_pix = copia-e-cola).
-- ═══════════════════════════════════════════════════════════════════

-- Chave Pix da conta BTG por empresa (opcional — enviada ao BTG quando presente)
ALTER TABLE public.btg_contas_bancarias
  ADD COLUMN IF NOT EXISTS chave_pix text;

-- Índices para lookups do webhook/poll
CREATE INDEX IF NOT EXISTS idx_payment_links_adquirente_status
  ON public.payment_links(adquirente, status);

CREATE INDEX IF NOT EXISTS idx_payment_links_txid
  ON public.payment_links((dados_extras->>'txid'))
  WHERE dados_extras ? 'txid';

CREATE INDEX IF NOT EXISTS idx_payment_links_btg_collection
  ON public.payment_links((dados_extras->>'btg_collection_id'))
  WHERE dados_extras ? 'btg_collection_id';
