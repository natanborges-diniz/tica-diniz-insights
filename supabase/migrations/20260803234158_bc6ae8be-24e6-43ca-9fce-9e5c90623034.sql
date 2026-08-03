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