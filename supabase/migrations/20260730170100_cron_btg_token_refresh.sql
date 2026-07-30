-- Renovação automática dos tokens BTG — agendamento do btg-token-refresh.
-- A edge function já existia (renova via refresh_token todo token a <2h de
-- expirar, estendendo ~24h e preservando escopos), mas não havia cron
-- registrado em migration chamando-a. Este agendamento garante a renovação
-- sem depender de job criado manualmente no painel.
--
-- Mesmo padrão das crons existentes (sync-os-hub 20260205215420,
-- btg-poll 20260703121000, sync-recebimentos 20260728170100):
-- pg_cron + pg_net com o anon key.
--
-- De hora em hora: janela de renovação é 2h, então nunca há gap.

SELECT cron.schedule(
  'btg-token-refresh-hourly',
  '0 * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://zmsfntqgxsstnbpzdled.supabase.co/functions/v1/btg-token-refresh',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inptc2ZudHFneHNzdG5icHpkbGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MzI0NTEsImV4cCI6MjA4MDEwODQ1MX0.Ek7_2uk0SXrcEnl1HT8ORELZyyvUQEfD8p-rq1r_Tt0"}'::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
