-- Saneamento de crons para ativação do banking (auditoria de 31/07):
-- 1) Agendar os crons do P1 que nunca existiram no banco (a migration de 03/07
--    não os executou): polling de retorno BTG, import diário do extrato e motor.
-- 2) Remover duplicados (token BTG e Hoya com par 30min+hourly) e o
--    sync-parcelas-incremental de 30min (cópia Firebird atualiza 1x/dia).

-- ── Limpeza (idempotente, por padrão de nome) ──
DO $$
DECLARE
  v_job TEXT;
BEGIN
  FOR v_job IN
    SELECT jobname FROM cron.job
    WHERE jobname IN ('btg-token-refresh-hourly', 'sync-parcelas-incremental')
       OR (jobname LIKE 'hoya-tracking%hourly%')
       -- evita duplicar os que vamos agendar abaixo, caso rodem 2x esta migration
       OR jobname IN ('btg-poll-status-30min', 'btg-importar-extratos-diario', 'conciliar-extrato-diario')
  LOOP
    PERFORM cron.unschedule(v_job);
    RAISE NOTICE 'cron removido: %', v_job;
  END LOOP;
END $$;

-- ── P1: retorno automático BTG a cada 30 min ──
SELECT cron.schedule(
  'btg-poll-status-30min',
  '*/30 * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://zmsfntqgxsstnbpzdled.supabase.co/functions/v1/btg-poll-status?action=executar',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inptc2ZudHFneHNzdG5icHpkbGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MzI0NTEsImV4cCI6MjA4MDEwODQ1MX0.Ek7_2uk0SXrcEnl1HT8ORELZyyvUQEfD8p-rq1r_Tt0"}'::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- ── P1: import diário do extrato (janela D-3..D) — 09:20 UTC = 06:20 BRT ──
SELECT cron.schedule(
  'btg-importar-extratos-diario',
  '20 9 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://zmsfntqgxsstnbpzdled.supabase.co/functions/v1/btg-poll-status?action=importar_extratos',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inptc2ZudHFneHNzdG5icHpkbGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MzI0NTEsImV4cCI6MjA4MDEwODQ1MX0.Ek7_2uk0SXrcEnl1HT8ORELZyyvUQEfD8p-rq1r_Tt0"}'::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- ── P1: motor de conciliação — 12:10 UTC (09:10 BRT), depois do extrato
--    (06:20) e do sync do ledger (08:20/08:50 BRT) ──
SELECT cron.schedule(
  'conciliar-extrato-diario',
  '10 12 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://zmsfntqgxsstnbpzdled.supabase.co/functions/v1/conciliar-extrato?action=executar',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inptc2ZudHFneHNzdG5icHpkbGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MzI0NTEsImV4cCI6MjA4MDEwODQ1MX0.Ek7_2uk0SXrcEnl1HT8ORELZyyvUQEfD8p-rq1r_Tt0"}'::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
