-- P2/E1 — Chave dura do ERP no parcelas_cache (SPEC_P2_LEDGER_UNICO.md §3.1)
-- A bridge já expõe cod_lancamento e cod_lancamentoparcela (PK da parcela no
-- Firebird); passamos a guardá-los. A identidade do cache muda da chave frouxa
-- (empresa+tipo+documento+venc+valor — duplica em renegociação) para
-- (cod_empresa, parcela_id).

ALTER TABLE public.parcelas_cache
  ADD COLUMN IF NOT EXISTS cod_lancamento BIGINT,
  ADD COLUMN IF NOT EXISTS parcela_id BIGINT,          -- fp.cod_lancamentoparcela
  ADD COLUMN IF NOT EXISTS cod_pessoa BIGINT,
  ADD COLUMN IF NOT EXISTS valor_original NUMERIC,
  ADD COLUMN IF NOT EXISTS data_recebimento DATE;

-- Nova identidade. Unique "cheia" (não parcial) para o ON CONFLICT do PostgREST
-- funcionar; linhas legadas com parcela_id NULL não conflitam entre si
-- (NULLS DISTINCT) e são removidas pelo sync no primeiro backfill.
CREATE UNIQUE INDEX IF NOT EXISTS uq_parcelas_cache_parcela
  ON public.parcelas_cache (cod_empresa, parcela_id);

CREATE INDEX IF NOT EXISTS idx_parcelas_cache_lancamento
  ON public.parcelas_cache (cod_empresa, cod_lancamento);

-- A unique antiga precisa sair já: com ela ativa, o primeiro upsert keyed em
-- (cod_empresa, parcela_id) colidiria com as linhas legadas pela chave frouxa.
-- Nome é auto-gerado (e truncado) pelo Postgres — drop dinâmico.
DO $$
DECLARE
  v_con TEXT;
BEGIN
  FOR v_con IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.parcelas_cache'::regclass
      AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.parcelas_cache DROP CONSTRAINT %I', v_con);
    RAISE NOTICE 'P2/E1: constraint unique antiga % removida', v_con;
  END LOOP;
END $$;
