-- E3 — Conciliação 3 vias: RPCs transacionais + cron do motor (SPEC_P1_CONCILIACAO_3VIAS.md §4.3)
-- fn_conciliar_extrato: aplica alocações e efeitos colaterais numa transação única
-- (os loops de UPDATEs soltos do código antigo deixavam estado inconsistente ao falhar no meio).
-- fn_desconciliar_extrato: desfaz por snapshot guardado em btg_extrato.dados_extras.e3_snapshot.

CREATE OR REPLACE FUNCTION public.fn_conciliar_extrato(
  p_extrato_id uuid,
  p_alocacoes jsonb,   -- [{alvo_tipo, alvo_id, valor_alocado, natureza?, categoria?, descricao?, observacao?}]
  p_metodo text,       -- EXATO | TOLERANCIA | AGRUPADO | REGRA | MANUAL
  p_score numeric,
  p_status text,       -- CONCILIADO_AUTO | CONCILIADO_MANUAL
  p_user uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_extrato public.btg_extrato%ROWTYPE;
  v_aloc jsonb;
  v_soma numeric := 0;
  v_snapshot jsonb := '[]'::jsonb;
  v_lanc public.lancamentos_financeiros%ROWTYPE;
  v_pag public.btg_pagamentos%ROWTYPE;
  v_cob public.btg_cobrancas%ROWTYPE;
  v_rec public.recebiveis_cartao%ROWTYPE;
  v_alvo_id uuid;
  v_novo_lanc_id uuid;
  v_count int := 0;
BEGIN
  SELECT * INTO v_extrato FROM public.btg_extrato WHERE id = p_extrato_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Extrato % não encontrado', p_extrato_id;
  END IF;
  IF v_extrato.status_conciliacao <> 'PENDENTE' THEN
    RAISE EXCEPTION 'Extrato % não está PENDENTE (status atual: %)', p_extrato_id, v_extrato.status_conciliacao;
  END IF;
  IF p_status NOT IN ('CONCILIADO_AUTO', 'CONCILIADO_MANUAL') THEN
    RAISE EXCEPTION 'Status de conciliação inválido: %', p_status;
  END IF;

  SELECT coalesce(sum((a->>'valor_alocado')::numeric), 0)
  INTO v_soma
  FROM jsonb_array_elements(p_alocacoes) a;
  IF abs(v_soma - v_extrato.valor) > 0.011 THEN
    RAISE EXCEPTION 'Soma das alocações (%) difere do valor do extrato (%)', v_soma, v_extrato.valor;
  END IF;

  FOR v_aloc IN SELECT * FROM jsonb_array_elements(p_alocacoes) LOOP
    v_count := v_count + 1;
    v_alvo_id := nullif(v_aloc->>'alvo_id', '')::uuid;

    CASE v_aloc->>'alvo_tipo'

      WHEN 'LANCAMENTO' THEN
        SELECT * INTO v_lanc FROM public.lancamentos_financeiros WHERE id = v_alvo_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento % não encontrado', v_alvo_id; END IF;
        v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
          'tabela', 'lancamentos_financeiros', 'id', v_lanc.id, 'acao', 'update',
          'status', v_lanc.status, 'valor_pago', v_lanc.valor_pago,
          'data_pagamento', v_lanc.data_pagamento, 'data_baixa', v_lanc.data_baixa,
          'baixado_por', v_lanc.baixado_por, 'baixado_em', v_lanc.baixado_em,
          'btg_extrato_id', v_lanc.btg_extrato_id));
        IF v_lanc.status = 'BAIXADO' THEN
          -- já baixado (ex.: via polling): apenas vincula ao extrato — fecha o triângulo
          UPDATE public.lancamentos_financeiros
          SET btg_extrato_id = p_extrato_id
          WHERE id = v_lanc.id;
        ELSE
          UPDATE public.lancamentos_financeiros
          SET status = 'BAIXADO',
              valor_pago = (v_aloc->>'valor_alocado')::numeric,
              data_pagamento = v_extrato.data_lancamento,
              data_baixa = v_extrato.data_lancamento,
              baixado_por = p_user,
              baixado_em = now(),
              btg_extrato_id = p_extrato_id
          WHERE id = v_lanc.id;
        END IF;

      WHEN 'PAGAMENTO_BTG' THEN
        SELECT * INTO v_pag FROM public.btg_pagamentos WHERE id = v_alvo_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Pagamento BTG % não encontrado', v_alvo_id; END IF;
        v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
          'tabela', 'btg_pagamentos', 'id', v_pag.id, 'acao', 'update', 'status', v_pag.status));
        UPDATE public.btg_pagamentos SET status = 'PAGO' WHERE id = v_alvo_id;
        FOR v_lanc IN
          SELECT * FROM public.lancamentos_financeiros
          WHERE btg_pagamento_id = v_alvo_id AND status NOT IN ('BAIXADO', 'CANCELADO')
          FOR UPDATE
        LOOP
          v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
            'tabela', 'lancamentos_financeiros', 'id', v_lanc.id, 'acao', 'update',
            'status', v_lanc.status, 'valor_pago', v_lanc.valor_pago,
            'data_pagamento', v_lanc.data_pagamento, 'data_baixa', v_lanc.data_baixa,
            'baixado_por', v_lanc.baixado_por, 'baixado_em', v_lanc.baixado_em,
            'btg_extrato_id', v_lanc.btg_extrato_id));
          UPDATE public.lancamentos_financeiros
          SET status = 'BAIXADO', valor_pago = v_lanc.valor,
              data_pagamento = v_extrato.data_lancamento, data_baixa = v_extrato.data_lancamento,
              baixado_por = p_user, baixado_em = now(), btg_extrato_id = p_extrato_id
          WHERE id = v_lanc.id;
        END LOOP;

      WHEN 'COBRANCA_BTG' THEN
        SELECT * INTO v_cob FROM public.btg_cobrancas WHERE id = v_alvo_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Cobrança BTG % não encontrada', v_alvo_id; END IF;
        v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
          'tabela', 'btg_cobrancas', 'id', v_cob.id, 'acao', 'update',
          'status', v_cob.status, 'valor_pago', v_cob.valor_pago, 'data_pagamento', v_cob.data_pagamento));
        UPDATE public.btg_cobrancas
        SET status = 'PAGO',
            valor_pago = (v_aloc->>'valor_alocado')::numeric,
            data_pagamento = v_extrato.data_lancamento
        WHERE id = v_alvo_id;
        FOR v_lanc IN
          SELECT * FROM public.lancamentos_financeiros
          WHERE btg_cobranca_id = v_alvo_id AND status NOT IN ('BAIXADO', 'CANCELADO')
          FOR UPDATE
        LOOP
          v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
            'tabela', 'lancamentos_financeiros', 'id', v_lanc.id, 'acao', 'update',
            'status', v_lanc.status, 'valor_pago', v_lanc.valor_pago,
            'data_pagamento', v_lanc.data_pagamento, 'data_baixa', v_lanc.data_baixa,
            'baixado_por', v_lanc.baixado_por, 'baixado_em', v_lanc.baixado_em,
            'btg_extrato_id', v_lanc.btg_extrato_id));
          UPDATE public.lancamentos_financeiros
          SET status = 'BAIXADO', valor_pago = v_lanc.valor,
              data_pagamento = v_extrato.data_lancamento, data_baixa = v_extrato.data_lancamento,
              baixado_por = p_user, baixado_em = now(), btg_extrato_id = p_extrato_id
          WHERE id = v_lanc.id;
        END LOOP;

      WHEN 'RECEBIVEL_CARTAO' THEN
        SELECT * INTO v_rec FROM public.recebiveis_cartao WHERE id = v_alvo_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Recebível % não encontrado', v_alvo_id; END IF;
        v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
          'tabela', 'recebiveis_cartao', 'id', v_rec.id, 'acao', 'update',
          'status', v_rec.status, 'btg_extrato_id', v_rec.btg_extrato_id));
        UPDATE public.recebiveis_cartao
        SET status = 'RECEBIDO', btg_extrato_id = p_extrato_id
        WHERE id = v_alvo_id;
        FOR v_lanc IN
          SELECT l.* FROM public.lancamentos_financeiros l
          JOIN public.recebiveis_cartao_parcelas p ON p.lancamento_id = l.id
          WHERE p.recebivel_id = v_alvo_id AND l.status NOT IN ('BAIXADO', 'CANCELADO')
          FOR UPDATE OF l
        LOOP
          v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
            'tabela', 'lancamentos_financeiros', 'id', v_lanc.id, 'acao', 'update',
            'status', v_lanc.status, 'valor_pago', v_lanc.valor_pago,
            'data_pagamento', v_lanc.data_pagamento, 'data_baixa', v_lanc.data_baixa,
            'baixado_por', v_lanc.baixado_por, 'baixado_em', v_lanc.baixado_em,
            'btg_extrato_id', v_lanc.btg_extrato_id));
          UPDATE public.lancamentos_financeiros
          SET status = 'BAIXADO', valor_pago = v_lanc.valor,
              data_pagamento = v_extrato.data_lancamento, data_baixa = v_extrato.data_lancamento,
              baixado_por = p_user, baixado_em = now(), btg_extrato_id = p_extrato_id
          WHERE id = v_lanc.id;
        END LOOP;

      WHEN 'TARIFA' THEN
        -- Único caminho de criação automática de lançamento a partir do extrato (regra explícita)
        INSERT INTO public.lancamentos_financeiros (
          cod_empresa, tipo, descricao, valor, data_vencimento, data_emissao,
          natureza, categoria, origem, origem_id, btg_extrato_id,
          status, valor_pago, data_pagamento, data_baixa, baixado_por, baixado_em, criado_por
        ) VALUES (
          v_extrato.cod_empresa,
          CASE WHEN v_extrato.tipo = 'CREDITO' THEN 'RECEBER' ELSE 'PAGAR' END,
          coalesce(v_aloc->>'descricao', v_extrato.descricao, 'Lançamento do extrato'),
          (v_aloc->>'valor_alocado')::numeric,
          v_extrato.data_lancamento, v_extrato.data_lancamento,
          v_aloc->>'natureza', v_aloc->>'categoria',
          'EXTRATO', p_extrato_id::text, p_extrato_id,
          'BAIXADO', (v_aloc->>'valor_alocado')::numeric,
          v_extrato.data_lancamento, v_extrato.data_lancamento,
          p_user, now(), p_user
        ) RETURNING id INTO v_novo_lanc_id;
        v_alvo_id := v_novo_lanc_id;
        v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
          'tabela', 'lancamentos_financeiros', 'id', v_novo_lanc_id, 'acao', 'delete'));

      ELSE
        RAISE EXCEPTION 'alvo_tipo inválido: %', v_aloc->>'alvo_tipo';
    END CASE;

    INSERT INTO public.conciliacao_extrato
      (cod_empresa, extrato_id, alvo_tipo, alvo_id, valor_alocado, metodo, score, observacao, criado_por)
    VALUES
      (v_extrato.cod_empresa, p_extrato_id, v_aloc->>'alvo_tipo', v_alvo_id,
       (v_aloc->>'valor_alocado')::numeric, p_metodo, p_score, v_aloc->>'observacao', p_user);
  END LOOP;

  UPDATE public.btg_extrato
  SET conciliado = true,
      status_conciliacao = p_status,
      metodo_conciliacao = p_metodo,
      conciliado_por = p_user,
      conciliado_em = now(),
      dados_extras = (dados_extras - 'sugestoes') || jsonb_build_object('e3_snapshot', v_snapshot),
      updated_at = now()
  WHERE id = p_extrato_id;

  RETURN jsonb_build_object('ok', true, 'alocacoes', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_desconciliar_extrato(
  p_extrato_id uuid,
  p_user uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_extrato public.btg_extrato%ROWTYPE;
  v_item jsonb;
  v_revertidos int := 0;
BEGIN
  SELECT * INTO v_extrato FROM public.btg_extrato WHERE id = p_extrato_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Extrato % não encontrado', p_extrato_id;
  END IF;
  IF v_extrato.status_conciliacao NOT IN ('CONCILIADO_AUTO', 'CONCILIADO_MANUAL', 'IGNORADO') THEN
    RAISE EXCEPTION 'Extrato % não está conciliado (status: %)', p_extrato_id, v_extrato.status_conciliacao;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(v_extrato.dados_extras->'e3_snapshot', '[]'::jsonb)) LOOP
    v_revertidos := v_revertidos + 1;
    IF v_item->>'acao' = 'delete' THEN
      DELETE FROM public.lancamentos_financeiros WHERE id = (v_item->>'id')::uuid;
    ELSIF v_item->>'tabela' = 'lancamentos_financeiros' THEN
      UPDATE public.lancamentos_financeiros
      SET status = v_item->>'status',
          valor_pago = (v_item->>'valor_pago')::numeric,
          data_pagamento = (v_item->>'data_pagamento')::date,
          data_baixa = (v_item->>'data_baixa')::date,
          baixado_por = (v_item->>'baixado_por')::uuid,
          baixado_em = (v_item->>'baixado_em')::timestamptz,
          btg_extrato_id = (v_item->>'btg_extrato_id')::uuid
      WHERE id = (v_item->>'id')::uuid;
    ELSIF v_item->>'tabela' = 'btg_pagamentos' THEN
      UPDATE public.btg_pagamentos SET status = v_item->>'status' WHERE id = (v_item->>'id')::uuid;
    ELSIF v_item->>'tabela' = 'btg_cobrancas' THEN
      UPDATE public.btg_cobrancas
      SET status = v_item->>'status',
          valor_pago = (v_item->>'valor_pago')::numeric,
          data_pagamento = (v_item->>'data_pagamento')::date
      WHERE id = (v_item->>'id')::uuid;
    ELSIF v_item->>'tabela' = 'recebiveis_cartao' THEN
      UPDATE public.recebiveis_cartao
      SET status = v_item->>'status',
          btg_extrato_id = (v_item->>'btg_extrato_id')::uuid
      WHERE id = (v_item->>'id')::uuid;
    END IF;
  END LOOP;

  DELETE FROM public.conciliacao_extrato WHERE extrato_id = p_extrato_id;

  UPDATE public.btg_extrato
  SET conciliado = false,
      status_conciliacao = 'PENDENTE',
      metodo_conciliacao = NULL,
      conciliado_por = NULL,
      conciliado_em = NULL,
      referencia_id = NULL,
      dados_extras = dados_extras - 'e3_snapshot',
      updated_at = now()
  WHERE id = p_extrato_id;

  RETURN jsonb_build_object('ok', true, 'revertidos', v_revertidos);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_conciliar_extrato(uuid, jsonb, text, numeric, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_desconciliar_extrato(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_conciliar_extrato(uuid, jsonb, text, numeric, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_desconciliar_extrato(uuid, uuid) TO service_role;

-- Cron: motor roda diariamente após o import do extrato (09:20 → 09:40 UTC)
SELECT cron.schedule(
  'conciliar-extrato-diario',
  '40 9 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://zmsfntqgxsstnbpzdled.supabase.co/functions/v1/conciliar-extrato?action=executar',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inptc2ZudHFneHNzdG5icHpkbGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MzI0NTEsImV4cCI6MjA4MDEwODQ1MX0.Ek7_2uk0SXrcEnl1HT8ORELZyyvUQEfD8p-rq1r_Tt0"}'::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
