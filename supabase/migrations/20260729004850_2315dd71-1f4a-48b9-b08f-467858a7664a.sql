-- 20260728170000_p2_e2_sync_ledger.sql
ALTER TABLE public.lancamentos_financeiros
  ADD COLUMN IF NOT EXISTS erp_parcela_id BIGINT,
  ADD COLUMN IF NOT EXISTS erp_cod_lancamento BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_lanc_erp_parcela
  ON public.lancamentos_financeiros (cod_empresa, erp_parcela_id);

CREATE INDEX IF NOT EXISTS idx_lanc_erp_cod_lancamento
  ON public.lancamentos_financeiros (cod_empresa, erp_cod_lancamento);

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-ledger-30min') THEN
    PERFORM cron.schedule(
      'sync-ledger-30min',
      '15,45 * * * *',
      $cron$
      SELECT net.http_post(
        url := 'https://zmsfntqgxsstnbpzdled.supabase.co/functions/v1/sync-ledger?mode=incremental',
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inptc2ZudHFneHNzdG5icHpkbGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MzI0NTEsImV4cCI6MjA4MDEwODQ1MX0.Ek7_2uk0SXrcEnl1HT8ORELZyyvUQEfD8p-rq1r_Tt0"}'::jsonb,
        body := '{}'::jsonb
      );
      $cron$
    );
  END IF;
END
$mig$;

-- 20260729110000_rls_acompanhamento_por_perfil.sql
CREATE OR REPLACE FUNCTION public.protect_vinculos_metas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (NEW.cod_vendedor IS DISTINCT FROM OLD.cod_vendedor)
     OR (NEW.cod_grupo_supervisor IS DISTINCT FROM OLD.cod_grupo_supervisor) THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Unauthenticated';
    END IF;
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Only admins can change metas bindings (cod_vendedor / cod_grupo_supervisor)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_vinculos_metas_trigger ON public.profiles;
CREATE TRIGGER protect_vinculos_metas_trigger
  BEFORE UPDATE ON public.profiles FOR EACH ROW
  EXECUTE FUNCTION public.protect_vinculos_metas();

CREATE OR REPLACE FUNCTION public.get_user_cod_vendedor(_user_id UUID)
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT cod_vendedor FROM public.profiles WHERE id = _user_id LIMIT 1 $$;

CREATE OR REPLACE FUNCTION public.get_user_grupo_supervisor(_user_id UUID)
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT cod_grupo_supervisor FROM public.profiles WHERE id = _user_id LIMIT 1 $$;

DROP POLICY IF EXISTS "Public read recebimentos_agregado_diario"
  ON public.recebimentos_agregado_diario;
DROP POLICY IF EXISTS "Scoped read recebimentos_agregado_diario"
  ON public.recebimentos_agregado_diario;
DROP POLICY IF EXISTS "Service role full access recebimentos_agregado_diario"
  ON public.recebimentos_agregado_diario;

CREATE POLICY "Scoped read recebimentos_agregado_diario"
  ON public.recebimentos_agregado_diario FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (
      public.get_user_cod_vendedor(auth.uid()) IS NOT NULL
      AND cod_vendedor = public.get_user_cod_vendedor(auth.uid())
    )
    OR (
      public.get_user_cod_vendedor(auth.uid()) IS NULL
      AND (
        cod_empresa = public.get_user_empresa(auth.uid())
        OR cod_empresa IN (
          SELECT uep.cod_empresa FROM public.user_empresa_permissions uep
           WHERE uep.user_id = auth.uid()
        )
        OR cod_empresa IN (
          SELECT glm.cod_empresa FROM public.grupos_lojas_membros glm
           WHERE glm.cod_grupo = public.get_user_grupo_supervisor(auth.uid())
        )
      )
    )
  );

CREATE POLICY "Service role full access recebimentos_agregado_diario"
  ON public.recebimentos_agregado_diario FOR ALL TO service_role
  USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';