-- Conciliação do borderô deixa de depender do relógio.
--
-- Como estava: extrato importado 1x/dia (06:20 BRT) e motor de conciliação
-- 1x/dia (09:10 BRT). Um pagamento autorizado às 10h da manhã só aparecia
-- conciliado na manhã seguinte — e, no meio disso, a tela de conciliação
-- mostrava o débito como movimento sem classificação, pedindo ao operador a
-- conta que o borderô já tinha definido.
--
-- Duas mudanças, uma em código e outra aqui:
--   • código: btg-extrato e btg-poll-status chamam o motor logo depois de
--     importar linha nova ou baixar pagamento (_shared/conciliacaoAuto.ts).
--   • aqui: o extrato passa a ser buscado de hora em hora durante o expediente,
--     porque o encadeamento só vale se a linha chegar perto do fato.
--
-- Reimportar é seguro: o upsert é por `dedupe_key` com ignoreDuplicates, e a
-- janela D-3..D existe justamente para recolher movimento lançado com atraso.
--
-- O cron diário do motor continua, como rede de segurança para o que escapar
-- dos dois gatilhos (import falho, empresa sem conta ativa no momento, etc).

-- ── Substitui o import diário pelo horário ──
DO $$
DECLARE
  v_job TEXT;
BEGIN
  FOR v_job IN
    SELECT jobname FROM cron.job
    WHERE jobname IN ('btg-importar-extratos-diario', 'btg-importar-extratos-horario')
  LOOP
    PERFORM cron.unschedule(v_job);
    RAISE NOTICE 'cron removido: %', v_job;
  END LOOP;
END $$;

-- 09:00–23:00 UTC = 06:00–20:00 BRT, de hora em hora.
--
-- Só o expediente: fora dele não há borderô sendo autorizado, e o diário já
-- cobria a virada. Dez contas por rodada, quinze rodadas por dia — bem dentro
-- do que a API de banking aguenta, e sem gastar chamada de madrugada.
SELECT cron.schedule(
  'btg-importar-extratos-horario',
  '0 9-23 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://zmsfntqgxsstnbpzdled.supabase.co/functions/v1/btg-poll-status?action=importar_extratos',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inptc2ZudHFneHNzdG5icHpkbGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MzI0NTEsImV4cCI6MjA4MDEwODQ1MX0.Ek7_2uk0SXrcEnl1HT8ORELZyyvUQEfD8p-rq1r_Tt0"}'::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
