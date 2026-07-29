ALTER TABLE public.rubricas_autorizadas
  ADD COLUMN IF NOT EXISTS dia_vencimento INTEGER,
  ADD COLUMN IF NOT EXISTS provisionar BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.lancamentos_financeiros
  ADD COLUMN IF NOT EXISTS competencia_rubrica TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_lanc_rubrica_competencia
  ON public.lancamentos_financeiros (cod_empresa, rubrica_id, competencia_rubrica);

SELECT cron.schedule(
  'provisionar-rubricas-mensal',
  '0 12 1 * *',
  $$
  SELECT
    net.http_post(
      url := 'https://zmsfntqgxsstnbpzdled.supabase.co/functions/v1/sync-ledger?mode=provisionar',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inptc2ZudHFneHNzdG5icHpkbGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MzI0NTEsImV4cCI6MjA4MDEwODQ1MX0.Ek7_2uk0SXrcEnl1HT8ORELZyyvUQEfD8p-rq1r_Tt0"}'::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);