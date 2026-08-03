-- Importação diária de DDA para todas as lojas.
--
-- Lacuna encontrada na auditoria de 03/08/2026: a importação de DDA era a única
-- rotina do banking sem agendamento — só rodava quando um admin disparava pela
-- tela, uma loja por vez. Resultado: das dez lojas com conta BTG, apenas quatro
-- tinham títulos, e as demais mostravam "sem boleto" em todos os lançamentos.
--
-- Roda antes do import do ERP (06:20 BRT) para que os títulos já estejam na
-- base quando as parcelas chegarem e a conciliação acontecer na mesma passada.
-- 08:40 UTC = 05:40 BRT.

SELECT cron.unschedule('btg-dda-importar-diario')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'btg-dda-importar-diario');

SELECT cron.schedule(
  'btg-dda-importar-diario',
  '40 8 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://zmsfntqgxsstnbpzdled.supabase.co/functions/v1/btg-dda?action=importar_todas',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inptc2ZudHFneHNzdG5icHpkbGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MzI0NTEsImV4cCI6MjA4MDEwODQ1MX0.Ek7_2uk0SXrcEnl1HT8ORELZyyvUQEfD8p-rq1r_Tt0"}'::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
