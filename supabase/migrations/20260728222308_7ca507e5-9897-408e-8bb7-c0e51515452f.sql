
CREATE OR REPLACE FUNCTION public.fn_conciliar_extrato(
  p_extrato_id uuid,
  p_alocacoes  jsonb,
  p_metodo     text,
  p_score      numeric,
  p_status     text,
  p_user       uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF v_extrato.status_conciliacao NOT IN ('PENDENTE') THEN
    RAISE EXCEPTION 'Linha do extrato já está em status % — desfaça antes de reconciliar', v_extrato.status_conciliacao;
  END IF;

  -- valida soma
  FOR v_aloc IN SELECT * FROM jsonb_array_elements(p_alocacoes) LOOP
    v_soma := v_soma + COALESCE((v_aloc->>'valor_alocado')::numeric, 0);
  END LOOP;
  IF ABS(v_soma - v_extrato.valor) > 0.02 THEN
    RAISE EXCEPTION 'Soma das alocações (%) difere do valor do extrato (%)', v_soma, v_extrato.valor;
  END IF;

  -- grava alocações e efeitos colaterais
  FOR v_aloc IN SELECT * FROM jsonb_array_elements(p_alocacoes) LOOP
    v_alvo_tipo  := v_aloc->>'alvo_tipo';
    v_alvo_id    := NULLIF(v_aloc->>'alvo_id','')::uuid;
    v_valor      := (v_aloc->>'valor_alocado')::numeric;
    v_natureza   := v_aloc->>'natureza';
    v_categoria  := v_aloc->>'categoria';
    v_descricao  := v_aloc->>'descricao';
    v_observacao := v_aloc->>'observacao';

    -- Efeito colateral: TARIFA sem alvo cria um lançamento financeiro baixado
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
         SET status = 'BAIXADO',
             valor_pago = COALESCE(valor_pago,0) + v_valor,
             data_pagamento = COALESCE(data_pagamento, v_extrato.data_lancamento),
             data_baixa = COALESCE(data_baixa, v_extrato.data_lancamento),
             btg_extrato_id = v_extrato.id,
             baixado_por = COALESCE(baixado_por, p_user),
             baixado_em = COALESCE(baixado_em, now()),
             updated_at = now()
       WHERE id = v_alvo_id;
    END IF;

    INSERT INTO public.conciliacao_extrato (
      cod_empresa, extrato_id, alvo_tipo, alvo_id,
      valor_alocado, metodo, score, observacao, criado_por
    ) VALUES (
      v_extrato.cod_empresa, v_extrato.id, v_alvo_tipo, v_alvo_id,
      v_valor, p_metodo, p_score, v_observacao, p_user
    );
    v_ins_count := v_ins_count + 1;
  END LOOP;

  UPDATE public.btg_extrato
     SET status_conciliacao = p_status,
         metodo_conciliacao = p_metodo,
         conciliado = true,
         conciliado_por = p_user,
         conciliado_em = now(),
         updated_at = now()
   WHERE id = p_extrato_id;

  RETURN jsonb_build_object(
    'extrato_id', p_extrato_id,
    'status', p_status,
    'alocacoes', v_ins_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_desconciliar_extrato(
  p_extrato_id uuid,
  p_user       uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_extrato public.btg_extrato%ROWTYPE;
  v_aloc    record;
  v_removidos int := 0;
BEGIN
  SELECT * INTO v_extrato FROM public.btg_extrato WHERE id = p_extrato_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linha do extrato % não encontrada', p_extrato_id;
  END IF;

  FOR v_aloc IN
    SELECT * FROM public.conciliacao_extrato WHERE extrato_id = p_extrato_id
  LOOP
    IF v_aloc.alvo_tipo = 'LANCAMENTO' AND v_aloc.alvo_id IS NOT NULL THEN
      -- Se foi lançamento criado a partir do extrato (origem EXTRATO_BTG), apaga.
      -- Caso contrário, reverte a baixa.
      DELETE FROM public.lancamentos_financeiros
       WHERE id = v_aloc.alvo_id
         AND origem = 'EXTRATO_BTG'
         AND btg_extrato_id = p_extrato_id;
      IF NOT FOUND THEN
        UPDATE public.lancamentos_financeiros
           SET status = 'PREVISTO',
               valor_pago = NULL,
               data_pagamento = NULL,
               data_baixa = NULL,
               btg_extrato_id = NULL,
               baixado_por = NULL,
               baixado_em = NULL,
               updated_at = now()
         WHERE id = v_aloc.alvo_id
           AND btg_extrato_id = p_extrato_id;
      END IF;
    END IF;
    v_removidos := v_removidos + 1;
  END LOOP;

  DELETE FROM public.conciliacao_extrato WHERE extrato_id = p_extrato_id;

  UPDATE public.btg_extrato
     SET status_conciliacao = 'PENDENTE',
         metodo_conciliacao = NULL,
         conciliado = false,
         conciliado_por = NULL,
         conciliado_em = NULL,
         updated_at = now()
   WHERE id = p_extrato_id;

  RETURN jsonb_build_object(
    'extrato_id', p_extrato_id,
    'status', 'PENDENTE',
    'alocacoes_removidas', v_removidos,
    'desfeito_por', p_user
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_conciliar_extrato(uuid, jsonb, text, numeric, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_desconciliar_extrato(uuid, uuid) TO authenticated, service_role;
