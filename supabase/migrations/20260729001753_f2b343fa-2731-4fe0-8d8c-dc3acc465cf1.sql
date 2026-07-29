ALTER TABLE public.parcelas_cache
  ADD COLUMN IF NOT EXISTS cod_lancamento BIGINT,
  ADD COLUMN IF NOT EXISTS parcela_id BIGINT,
  ADD COLUMN IF NOT EXISTS cod_pessoa BIGINT,
  ADD COLUMN IF NOT EXISTS valor_original NUMERIC,
  ADD COLUMN IF NOT EXISTS data_recebimento DATE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_parcelas_cache_parcela
  ON public.parcelas_cache (cod_empresa, parcela_id);

CREATE INDEX IF NOT EXISTS idx_parcelas_cache_lancamento
  ON public.parcelas_cache (cod_empresa, cod_lancamento);

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
  END LOOP;
END $$;