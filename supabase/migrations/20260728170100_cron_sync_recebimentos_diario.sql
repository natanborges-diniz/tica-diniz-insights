-- Fase 1 — Dados de recebimento: agendamento do sync-recebimentos-diario.
-- Mesmo padrão das crons existentes (sync-os-hub-incremental 20260205215420,
-- btg 20260703121000, conciliar-extrato-diario 20260703122000): pg_cron +
-- pg_net chamando a edge function com o anon key (a edge valida
-- service_role/admin internamente e verify_jwt = false no config.toml).
--
-- Obs.: sync-agregados-diarios não tem cron no repo (é disparada pelo
-- frontend / orchestrate-sync); para recebimentos adotamos o cron diário.
--
-- Horário: 10:30 UTC = 07:30 BRT — depois do sync 07:00 BRT do bridge.
-- Sem body: a edge usa o default [segunda-feira da semana comercial .. hoje],
-- o que mantém `origem` (VENDA_PERIODO|SALDO_ANTERIOR) relativa à semana.

SELECT cron.schedule(
  'sync-recebimentos-diario',
  '30 10 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://zmsfntqgxsstnbpzdled.supabase.co/functions/v1/sync-recebimentos-diario',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inptc2ZudHFneHNzdG5icHpkbGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MzI0NTEsImV4cCI6MjA4MDEwODQ1MX0.Ek7_2uk0SXrcEnl1HT8ORELZyyvUQEfD8p-rq1r_Tt0"}'::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
