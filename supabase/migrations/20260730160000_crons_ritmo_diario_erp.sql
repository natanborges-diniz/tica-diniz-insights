-- A cópia do Firebird só é restaurada de madrugada (~07:00 BRT — ver memória
-- firebird-copia-frescor): sync horário/30min contra o ERP é desperdício.
-- Ritmo novo: 1 ciclo diário logo após o restore, com uma segunda passada de
-- segurança. (O auto-healing do módulo Compras e os botões manuais continuam
-- funcionando sob demanda.)

DO $$
BEGIN
  PERFORM cron.unschedule('sync-parcelas-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('sync-ledger-30min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Backfill diário do cache já existe às 11:00 UTC (08:00 BRT) — mantido.
-- Ledger roda depois dele, com repasse de segurança 30 min mais tarde.
SELECT cron.schedule(
  'sync-ledger-diario',
  '20 11 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://zmsfntqgxsstnbpzdled.supabase.co/functions/v1/sync-ledger?mode=incremental',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inptc2ZudHFneHNzdG5icHpkbGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MzI0NTEsImV4cCI6MjA4MDEwODQ1MX0.Ek7_2uk0SXrcEnl1HT8ORELZyyvUQEfD8p-rq1r_Tt0"}'::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

SELECT cron.schedule(
  'sync-ledger-diario-retry',
  '50 11 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://zmsfntqgxsstnbpzdled.supabase.co/functions/v1/sync-ledger?mode=incremental',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inptc2ZudHFneHNzdG5icHpkbGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MzI0NTEsImV4cCI6MjA4MDEwODQ1MX0.Ek7_2uk0SXrcEnl1HT8ORELZyyvUQEfD8p-rq1r_Tt0"}'::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
