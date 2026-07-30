ALTER TABLE public.btg_contas_bancarias
  ADD COLUMN IF NOT EXISTS chave_pix text;

CREATE INDEX IF NOT EXISTS idx_payment_links_adquirente_status
  ON public.payment_links(adquirente, status);

CREATE INDEX IF NOT EXISTS idx_payment_links_txid
  ON public.payment_links((dados_extras->>'txid'))
  WHERE dados_extras ? 'txid';

CREATE INDEX IF NOT EXISTS idx_payment_links_btg_collection
  ON public.payment_links((dados_extras->>'btg_collection_id'))
  WHERE dados_extras ? 'btg_collection_id';