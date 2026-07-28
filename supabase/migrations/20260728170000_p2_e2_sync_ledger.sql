-- P2/E2 — Vínculo duro ERP no ledger + cron do sync-ledger (SPEC_P2_LEDGER_UNICO.md §3.2/§4)

ALTER TABLE public.lancamentos_financeiros
  ADD COLUMN IF NOT EXISTS erp_parcela_id BIGINT,
  ADD COLUMN IF NOT EXISTS erp_cod_lancamento BIGINT;

-- Unique cheia (não parcial) para o ON CONFLICT do PostgREST; NULLs não conflitam.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lanc_erp_parcela
  ON public.lancamentos_financeiros (cod_empresa, erp_parcela_id);

CREATE INDEX IF NOT EXISTS idx_lanc_erp_cod_lancamento
  ON public.lancamentos_financeiros (cod_empresa, erp_cod_lancamento);

-- Cron: sync ERP→ledger a cada 30 min, defasado 15 min do btg-poll-status
-- (mesmo padrão da migration 20260703121000).
SELECT cron.schedule(
  'sync-ledger-30min',
  '15,45 * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://zmsfntqgxsstnbpzdled.supabase.co/functions/v1/sync-ledger?mode=incremental',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inptc2ZudHFneHNzdG5icHpkbGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MzI0NTEsImV4cCI6MjA4MDEwODQ1MX0.Ek7_2uk0SXrcEnl1HT8ORELZyyvUQEfD8p-rq1r_Tt0"}'::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
