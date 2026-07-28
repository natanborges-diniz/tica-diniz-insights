-- P2/E2 — Fecha o elo que faltava: parcelas_cache não tinha cron (só auto-healing
-- do módulo Compras). Sem isto, o sync-ledger não tem o que sincronizar.
-- Pipeline automático completo: Firebird → cache (aqui) → ledger (sync-ledger :15/:45).

-- Incremental de hora em hora (janela venc -45d..+90d / emissão -90d)
SELECT cron.schedule(
  'sync-parcelas-hourly',
  '5 * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://zmsfntqgxsstnbpzdled.supabase.co/functions/v1/sync-parcelas?mode=incremental&codEmpresa=ALL',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inptc2ZudHFneHNzdG5icHpkbGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MzI0NTEsImV4cCI6MjA4MDEwODQ1MX0.Ek7_2uk0SXrcEnl1HT8ORELZyyvUQEfD8p-rq1r_Tt0"}'::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- Backfill diário 11:00 UTC (08:00 BRT) — depois do restore diário da cópia
-- Firebird (~07:00 BRT), garantindo dados do dia.
SELECT cron.schedule(
  'sync-parcelas-backfill-diario',
  '0 11 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://zmsfntqgxsstnbpzdled.supabase.co/functions/v1/sync-parcelas?mode=backfill&codEmpresa=ALL',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inptc2ZudHFneHNzdG5icHpkbGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MzI0NTEsImV4cCI6MjA4MDEwODQ1MX0.Ek7_2uk0SXrcEnl1HT8ORELZyyvUQEfD8p-rq1r_Tt0"}'::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- Kickstart único pós-deploy (auto-desagenda após rodar): um backfill agora e um
-- sync-ledger full logo depois, para não esperar o cron da madrugada.
SELECT cron.schedule(
  'p2-kickstart-parcelas',
  (to_char(now() + interval '5 minutes', 'MI HH24') || ' * * *'),
  $$
  SELECT
    net.http_post(
      url := 'https://zmsfntqgxsstnbpzdled.supabase.co/functions/v1/sync-parcelas?mode=backfill&codEmpresa=ALL',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inptc2ZudHFneHNzdG5icHpkbGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MzI0NTEsImV4cCI6MjA4MDEwODQ1MX0.Ek7_2uk0SXrcEnl1HT8ORELZyyvUQEfD8p-rq1r_Tt0"}'::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  SELECT cron.unschedule('p2-kickstart-parcelas');
  $$
);

SELECT cron.schedule(
  'p2-kickstart-ledger',
  (to_char(now() + interval '25 minutes', 'MI HH24') || ' * * *'),
  $$
  SELECT
    net.http_post(
      url := 'https://zmsfntqgxsstnbpzdled.supabase.co/functions/v1/sync-ledger?mode=full',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inptc2ZudHFneHNzdG5icHpkbGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MzI0NTEsImV4cCI6MjA4MDEwODQ1MX0.Ek7_2uk0SXrcEnl1HT8ORELZyyvUQEfD8p-rq1r_Tt0"}'::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  SELECT cron.unschedule('p2-kickstart-ledger');
  $$
);
