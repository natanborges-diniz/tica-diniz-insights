CREATE OR REPLACE FUNCTION public.pix_verificar_pendentes()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_disparados int := 0;
BEGIN
  FOR r IN
    SELECT id FROM payment_links
    WHERE adquirente = 'PIX_BTG'
      AND status = 'ATIVO'
      AND created_at > now() - interval '3 days'
    ORDER BY created_at DESC
    LIMIT 50
  LOOP
    PERFORM net.http_post(
      url := 'https://zmsfntqgxsstnbpzdled.supabase.co/functions/v1/pix-charges-v5',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_object('action','detalhe_publico','link_id', r.id)
    );
    v_disparados := v_disparados + 1;
  END LOOP;

  RETURN jsonb_build_object('verificados', v_disparados);
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pix-verificar-pendentes') THEN
    PERFORM cron.unschedule('pix-verificar-pendentes');
  END IF;
  PERFORM cron.schedule(
    'pix-verificar-pendentes',
    '* * * * *',
    $cron$SELECT public.pix_verificar_pendentes()$cron$
  );
END $$;