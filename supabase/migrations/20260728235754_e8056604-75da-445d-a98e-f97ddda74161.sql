-- ============================================================
-- 20260728180000_p2_cron_sync_parcelas.sql
-- ============================================================
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

-- ============================================================
-- 20260729090000_regras_acao_classificar.sql
-- ============================================================
ALTER TABLE public.extrato_regras_classificacao
  ADD COLUMN IF NOT EXISTS acao TEXT NOT NULL DEFAULT 'TARIFA';

UPDATE public.extrato_regras_classificacao
SET acao = 'CLASSIFICAR'
WHERE categoria IS NULL AND valor_max IS NULL;

-- ============================================================
-- 20260729093000_metas_semana_cortes.sql
-- ============================================================
CREATE TABLE public.metas_semana_cortes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  ordem INTEGER NOT NULL,
  semana_inicio DATE NOT NULL,
  semana_fim DATE NOT NULL,
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (ano, mes, ordem),
  UNIQUE (ano, mes, semana_inicio),
  CHECK (semana_fim >= semana_inicio)
);

CREATE INDEX idx_metas_semana_cortes_ano_mes ON public.metas_semana_cortes(ano, mes);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.metas_semana_cortes TO authenticated;
GRANT ALL ON public.metas_semana_cortes TO service_role;

ALTER TABLE public.metas_semana_cortes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read metas_semana_cortes"
  ON public.metas_semana_cortes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin gestor write metas_semana_cortes"
  ON public.metas_semana_cortes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "Service role full access metas_semana_cortes"
  ON public.metas_semana_cortes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 20260729100000_fn_conciliar_valor_pago_baixado.sql
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_conciliar_extrato(p_extrato_id uuid, p_alocacoes jsonb, p_metodo text, p_score numeric, p_status text, p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_extrato       public.btg_extrato%ROWTYPE;
  v_aloc          jsonb;
  v_alvo_tipo     text;
  v_alvo_id       uuid;
  v_valor         numeric;
  v_natureza      text;
  v_categoria     text;
  v_descricao     text;
  v_observacao    text;
  v_soma          numeric := 0;
  v_novo_lanc_id  uuid;
  v_ins_count     int := 0;
  v_first_natureza text := NULL;
  v_first_ref_id  uuid  := NULL;
BEGIN
  IF p_extrato_id IS NULL THEN
    RAISE EXCEPTION 'p_extrato_id é obrigatório';
  END IF;
  IF p_alocacoes IS NULL OR jsonb_typeof(p_alocacoes) <> 'array' OR jsonb_array_length(p_alocacoes) = 0 THEN
    RAISE EXCEPTION 'p_alocacoes deve ser um array não-vazio';
  END IF;
  IF p_status NOT IN ('CONCILIADO_AUTO','CONCILIADO_MANUAL') THEN
    RAISE EXCEPTION 'p_status inválido: %', p_status;
  END IF;

  SELECT * INTO v_extrato FROM public.btg_extrato WHERE id = p_extrato_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linha do extrato % não encontrada', p_extrato_id;
  END IF;
  IF v_extrato.status_conciliacao NOT IN ('PENDENTE','CLASSIFICADO') THEN
    RAISE EXCEPTION 'Linha do extrato já está em status % — desfaça antes de reconciliar', v_extrato.status_conciliacao;
  END IF;

  FOR v_aloc IN SELECT * FROM jsonb_array_elements(p_alocacoes) LOOP
    v_soma := v_soma + COALESCE((v_aloc->>'valor_alocado')::numeric, 0);
  END LOOP;
  IF ABS(v_soma - v_extrato.valor) > 0.02 THEN
    RAISE EXCEPTION 'Soma das alocações (%) difere do valor do extrato (%)', v_soma, v_extrato.valor;
  END IF;

  FOR v_aloc IN SELECT * FROM jsonb_array_elements(p_alocacoes) LOOP
    v_alvo_tipo  := v_aloc->>'alvo_tipo';
    v_alvo_id    := NULLIF(v_aloc->>'alvo_id','')::uuid;
    v_valor      := (v_aloc->>'valor_alocado')::numeric;
    v_natureza   := v_aloc->>'natureza';
    v_categoria  := v_aloc->>'categoria';
    v_descricao  := v_aloc->>'descricao';
    v_observacao := v_aloc->>'observacao';

    IF v_alvo_tipo = 'TARIFA' AND v_alvo_id IS NULL THEN
      INSERT INTO public.lancamentos_financeiros (
        cod_empresa, tipo, status, natureza, categoria, descricao,
        valor, valor_pago, data_vencimento, data_pagamento, data_baixa,
        origem, btg_extrato_id, baixado_por, baixado_em, criado_por, observacao
      ) VALUES (
        v_extrato.cod_empresa,
        CASE WHEN v_extrato.tipo = 'DEBITO' THEN 'PAGAR' ELSE 'RECEBER' END,
        'BAIXADO',
        v_natureza,
        v_categoria,
        COALESCE(v_descricao, v_extrato.descricao, 'Tarifa bancária'),
        v_valor, v_valor,
        v_extrato.data_lancamento, v_extrato.data_lancamento, v_extrato.data_lancamento,
        'EXTRATO_BTG', v_extrato.id, p_user, now(), p_user, v_observacao
      )
      RETURNING id INTO v_novo_lanc_id;
      v_alvo_id := v_novo_lanc_id;
      v_alvo_tipo := 'LANCAMENTO';
    ELSIF v_alvo_tipo = 'LANCAMENTO' AND v_alvo_id IS NOT NULL THEN
      UPDATE public.lancamentos_financeiros
         SET valor_pago = CASE
               WHEN status = 'BAIXADO' THEN COALESCE(valor_pago, v_valor)
               ELSE COALESCE(valor_pago,0) + v_valor
             END,
             status = 'BAIXADO',
             data_pagamento = COALESCE(data_pagamento, v_extrato.data_lancamento),
             data_baixa = COALESCE(data_baixa, v_extrato.data_lancamento),
             btg_extrato_id = v_extrato.id,
             baixado_por = COALESCE(baixado_por, p_user),
             baixado_em = COALESCE(baixado_em, now()),
             updated_at = now()
       WHERE id = v_alvo_id;
      IF v_natureza IS NULL THEN
        SELECT natureza INTO v_natureza FROM public.lancamentos_financeiros WHERE id = v_alvo_id;
      END IF;
    END IF;

    INSERT INTO public.conciliacao_extrato (
      cod_empresa, extrato_id, alvo_tipo, alvo_id,
      valor_alocado, metodo, score, observacao, criado_por
    ) VALUES (
      v_extrato.cod_empresa, v_extrato.id, v_alvo_tipo, v_alvo_id,
      v_valor, p_metodo, p_score, v_observacao, p_user
    );
    v_ins_count := v_ins_count + 1;

    IF v_first_natureza IS NULL AND v_natureza IS NOT NULL THEN
      v_first_natureza := v_natureza;
    END IF;
    IF v_first_ref_id IS NULL AND v_alvo_id IS NOT NULL THEN
      v_first_ref_id := v_alvo_id;
    END IF;
  END LOOP;

  UPDATE public.btg_extrato
     SET status_conciliacao = p_status,
         metodo_conciliacao = p_metodo,
         conciliado = true,
         conciliado_por = p_user,
         conciliado_em = now(),
         natureza = COALESCE(v_first_natureza, natureza),
         referencia_id = COALESCE(v_first_ref_id, referencia_id),
         updated_at = now()
   WHERE id = p_extrato_id;

  RETURN jsonb_build_object(
    'extrato_id', p_extrato_id,
    'status', p_status,
    'alocacoes', v_ins_count,
    'natureza', v_first_natureza
  );
END;
$function$;