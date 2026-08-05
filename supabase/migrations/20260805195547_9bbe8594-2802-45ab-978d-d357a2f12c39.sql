-- 1. Configuracao da adquirente
ALTER TABLE public.adquirentes_config
  ADD COLUMN IF NOT EXISTS cielo_estabelecimento_matriz text,
  ADD COLUMN IF NOT EXISTS cielo_pvs text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cielo_documento text,
  ADD COLUMN IF NOT EXISTS cielo_last_healthcheck_at timestamptz,
  ADD COLUMN IF NOT EXISTS cielo_last_healthcheck_status text,
  ADD COLUMN IF NOT EXISTS cielo_last_healthcheck_message text;

COMMENT ON COLUMN public.adquirentes_config.cielo_estabelecimento_matriz IS
  'Numero do estabelecimento matriz de extrato eletronico (header, posicao 2-11). Agrupa filiais por raiz de CNPJ.';
COMMENT ON COLUMN public.adquirentes_config.cielo_pvs IS
  'Estabelecimentos submissores (PVs) desta loja. Usado para mapear registro -> cod_empresa.';
COMMENT ON COLUMN public.adquirentes_config.cielo_documento IS
  'CPF/CNPJ da matriz de extrato, usado como DocumentNumber nas chamadas de API.';

CREATE INDEX IF NOT EXISTS idx_adquirentes_cielo_pvs_gin
  ON public.adquirentes_config USING GIN (cielo_pvs);

-- 2. Controle de arquivos importados
CREATE TABLE IF NOT EXISTS public.cielo_extratos_arquivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estabelecimento_matriz text NOT NULL,
  tipo_arquivo text NOT NULL,
  data_processamento date,
  periodo_inicial date,
  periodo_final date,
  sequencia integer NOT NULL,
  reprocessamento boolean NOT NULL DEFAULT false,
  versao_layout text,
  hierarquia_cadastro text,
  cadastro_completo boolean,
  origem text NOT NULL DEFAULT 'API',
  nome_arquivo text,
  bytes integer,
  sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'PENDENTE',
  validacao jsonb NOT NULL DEFAULT '{}'::jsonb,
  totais jsonb NOT NULL DEFAULT '{}'::jsonb,
  erro text,
  importado_por uuid,
  processado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cielo_arquivos_origem_chk CHECK (origem IN ('API', 'UPLOAD')),
  CONSTRAINT cielo_arquivos_status_chk CHECK (status IN ('PENDENTE', 'PROCESSADO', 'ERRO', 'REJEITADO'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cielo_extratos_arquivos TO authenticated;
GRANT ALL ON public.cielo_extratos_arquivos TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cielo_arquivo_identidade
  ON public.cielo_extratos_arquivos (estabelecimento_matriz, tipo_arquivo, sequencia, sha256);

CREATE INDEX IF NOT EXISTS idx_cielo_arquivos_tipo_data
  ON public.cielo_extratos_arquivos (tipo_arquivo, data_processamento DESC);

-- 3. Registro D — UR Agenda (CIELO04)
CREATE TABLE IF NOT EXISTS public.cielo_urs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  arquivo_id uuid NOT NULL REFERENCES public.cielo_extratos_arquivos(id) ON DELETE CASCADE,
  cod_empresa integer,
  estabelecimento_submissor text NOT NULL,
  chave_ur text NOT NULL,
  tipo_lancamento text NOT NULL,
  tipo_lancamento_original text,
  cpf_cnpj_titular text,
  cpf_cnpj_recebedor text,
  bandeira_codigo text,
  bandeira text,
  tipo_liquidacao text,
  matriz_pagamento text,
  status_pagamento_codigo text,
  status_pagamento text,
  liquidado boolean NOT NULL DEFAULT false,
  valor_bruto numeric NOT NULL DEFAULT 0,
  valor_taxa_administrativa numeric NOT NULL DEFAULT 0,
  valor_liquido numeric NOT NULL DEFAULT 0,
  banco text,
  agencia text,
  conta text,
  digito_conta text,
  qtd_lancamentos integer NOT NULL DEFAULT 0,
  data_pagamento date,
  data_envio_banco date,
  data_vencimento_original date,
  estabelecimento_pagamento text,
  lancamento_pendente boolean NOT NULL DEFAULT false,
  reenvio_pagamento boolean NOT NULL DEFAULT false,
  negociacao_gravame boolean NOT NULL DEFAULT false,
  cpf_cnpj_negociador text,
  extrato_lancamento_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cielo_urs TO authenticated;
GRANT ALL ON public.cielo_urs TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cielo_ur_arquivo
  ON public.cielo_urs (arquivo_id, chave_ur, tipo_lancamento);

CREATE INDEX IF NOT EXISTS idx_cielo_urs_empresa_pagamento
  ON public.cielo_urs (cod_empresa, data_pagamento);
CREATE INDEX IF NOT EXISTS idx_cielo_urs_chave
  ON public.cielo_urs (chave_ur, tipo_lancamento);

-- 4. Registro E — Detalhe do lancamento (CIELO03 e CIELO04)
CREATE TABLE IF NOT EXISTS public.cielo_lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  arquivo_id uuid NOT NULL REFERENCES public.cielo_extratos_arquivos(id) ON DELETE CASCADE,
  ur_id uuid REFERENCES public.cielo_urs(id) ON DELETE SET NULL,
  cod_empresa integer,
  tipo_arquivo text NOT NULL,
  estabelecimento_submissor text NOT NULL,
  codigo_transacao_recebida text,
  numero_transacao_processada text,
  chave_ur text NOT NULL,
  tipo_lancamento text NOT NULL,
  tipo_lancamento_descricao text,
  codigo_ajuste text,
  parcela integer NOT NULL DEFAULT 0,
  total_parcelas integer NOT NULL DEFAULT 0,
  codigo_autorizacao text,
  nsu text,
  tid text,
  codigo_pedido text,
  codigo_unico_venda text,
  codigo_original_venda text,
  bandeira_liquidacao_codigo text,
  bandeira_liquidacao text,
  bandeira_autorizacao_codigo text,
  tipo_liquidacao text,
  tipo_transacao text,
  forma_pagamento text,
  bin_cartao text,
  final_cartao text,
  grupo_cartoes text,
  tipo_cartao text,
  cartao_estrangeiro boolean NOT NULL DEFAULT false,
  parcelado_cliente boolean NOT NULL DEFAULT false,
  canal_venda_codigo text,
  canal_venda text,
  numero_terminal text,
  tipo_captura_codigo text,
  tipo_captura text,
  taxa_mdr_percentual numeric,
  taxa_ra_percentual numeric,
  taxa_venda_percentual numeric,
  valor_total_venda numeric NOT NULL DEFAULT 0,
  valor_bruto numeric NOT NULL DEFAULT 0,
  valor_liquido numeric NOT NULL DEFAULT 0,
  valor_comissao numeric NOT NULL DEFAULT 0,
  valor_tarifa_administrativa numeric NOT NULL DEFAULT 0,
  valor_tarifa_mdr numeric NOT NULL DEFAULT 0,
  valor_cielo_promo numeric NOT NULL DEFAULT 0,
  valor_dcc numeric NOT NULL DEFAULT 0,
  data_autorizacao date,
  data_captura date,
  data_lancamento date,
  data_original_lancamento date,
  data_vencimento_original date,
  hora_transacao time,
  rejeitada boolean NOT NULL DEFAULT false,
  motivo_rejeicao text,
  identificador_efeito_negociacao text,
  negociacao_com_cielo boolean NOT NULL DEFAULT false,
  cpf_cnpj_negociador text,
  cpf_cnpj_recebedor text,
  banco text,
  agencia text,
  conta text,
  arn text,
  chave_rastreio text NOT NULL,
  venda_cartao_id uuid REFERENCES public.vendas_cartao(id) ON DELETE SET NULL,
  dados_extras jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cielo_lancamentos TO authenticated;
GRANT ALL ON public.cielo_lancamentos TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cielo_lancamento_arquivo
  ON public.cielo_lancamentos (arquivo_id, chave_ur, tipo_lancamento, chave_rastreio);

CREATE INDEX IF NOT EXISTS idx_cielo_lanc_rastreio
  ON public.cielo_lancamentos (chave_rastreio);
CREATE INDEX IF NOT EXISTS idx_cielo_lanc_transacao_recebida
  ON public.cielo_lancamentos (codigo_transacao_recebida);
CREATE INDEX IF NOT EXISTS idx_cielo_lanc_transacao_processada
  ON public.cielo_lancamentos (numero_transacao_processada)
  WHERE numero_transacao_processada IS NOT NULL AND numero_transacao_processada <> '';
CREATE INDEX IF NOT EXISTS idx_cielo_lanc_empresa_data
  ON public.cielo_lancamentos (cod_empresa, data_lancamento DESC);
CREATE INDEX IF NOT EXISTS idx_cielo_lanc_chave_ur
  ON public.cielo_lancamentos (chave_ur, tipo_lancamento);

-- 5. Registro 8 — Transacoes Pix (CIELO16)
CREATE TABLE IF NOT EXISTS public.cielo_pix (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  arquivo_id uuid NOT NULL REFERENCES public.cielo_extratos_arquivos(id) ON DELETE CASCADE,
  cod_empresa integer,
  estabelecimento_submissor text NOT NULL,
  tipo_transacao text NOT NULL,
  id_pix text NOT NULL,
  id_pix_original text,
  tx_id text,
  id_recorrencia text,
  id_pagamento_pix text,
  nsu text,
  nsu_longo text,
  data_transacao date,
  hora_transacao time,
  data_captura date,
  data_pagamento date,
  data_pagamento_conta_cielo date,
  valor_bruto numeric NOT NULL DEFAULT 0,
  valor_taxa_administrativa numeric NOT NULL DEFAULT 0,
  valor_liquido numeric NOT NULL DEFAULT 0,
  taxa_administrativa_percentual numeric,
  tarifa_administrativa numeric,
  banco text,
  agencia text,
  conta text,
  canal_venda_codigo text,
  numero_terminal text,
  indicativo_troco_saque text,
  origem_ajuste_codigo text,
  origem_ajuste text,
  transferencia_automatica boolean NOT NULL DEFAULT false,
  transferencia_programada boolean NOT NULL DEFAULT false,
  status_transferencia_codigo text,
  status_transferencia text,
  liquidado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cielo_pix TO authenticated;
GRANT ALL ON public.cielo_pix TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cielo_pix_arquivo
  ON public.cielo_pix (arquivo_id, id_pix, tipo_transacao, status_transferencia_codigo);

CREATE INDEX IF NOT EXISTS idx_cielo_pix_empresa_data
  ON public.cielo_pix (cod_empresa, data_transacao DESC);
CREATE INDEX IF NOT EXISTS idx_cielo_pix_idpix ON public.cielo_pix (id_pix);

-- 6. Camada derivada — vendas_cartao / recebiveis_cartao
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendas_cartao_origem
  ON public.vendas_cartao (adquirente, origem_venda_id);

ALTER TABLE public.recebiveis_cartao
  ADD COLUMN IF NOT EXISTS chave_ur text,
  ADD COLUMN IF NOT EXISTS tipo_lancamento text,
  ADD COLUMN IF NOT EXISTS origem_recebivel_id text,
  ADD COLUMN IF NOT EXISTS data_liquidacao date;

COMMENT ON COLUMN public.recebiveis_cartao.data_liquidacao IS
  'Data em que a UR foi efetivamente paga (registro D do CIELO04). Nulo enquanto previsto.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_recebiveis_cartao_origem
  ON public.recebiveis_cartao (adquirente, origem_recebivel_id);

CREATE INDEX IF NOT EXISTS idx_recebiveis_chave_ur
  ON public.recebiveis_cartao (chave_ur) WHERE chave_ur IS NOT NULL;

-- 7. RLS
ALTER TABLE public.cielo_extratos_arquivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cielo_urs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cielo_lancamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cielo_pix ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cielo_extratos_arquivos', 'cielo_urs', 'cielo_lancamentos', 'cielo_pix'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Admin full access %1$s" ON public.%1$I', t);
    EXECUTE format(
      'CREATE POLICY "Admin full access %1$s" ON public.%1$I FOR ALL TO authenticated
         USING (public.has_role(auth.uid(), ''admin''))
         WITH CHECK (public.has_role(auth.uid(), ''admin''))', t);
    EXECUTE format('DROP POLICY IF EXISTS "Service role full access %1$s" ON public.%1$I', t);
    EXECUTE format(
      'CREATE POLICY "Service role full access %1$s" ON public.%1$I FOR ALL TO service_role
         USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cielo_urs', 'cielo_lancamentos', 'cielo_pix'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Tenant read %1$s" ON public.%1$I', t);
    EXECUTE format(
      'CREATE POLICY "Tenant read %1$s" ON public.%1$I FOR SELECT TO authenticated
         USING (cod_empresa IN (
           SELECT uep.cod_empresa FROM public.user_empresa_permissions uep
           WHERE uep.user_id = auth.uid()
         ))', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Tenant read cielo_extratos_arquivos" ON public.cielo_extratos_arquivos;
CREATE POLICY "Tenant read cielo_extratos_arquivos"
  ON public.cielo_extratos_arquivos FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.adquirentes_config ac
    JOIN public.user_empresa_permissions uep ON uep.cod_empresa = ac.cod_empresa
    WHERE ac.adquirente = 'CIELO'
      AND ac.ativo = true
      AND uep.user_id = auth.uid()
      AND ltrim(coalesce(ac.cielo_estabelecimento_matriz, ''), '0')
          = ltrim(cielo_extratos_arquivos.estabelecimento_matriz, '0')
  ));

DROP TRIGGER IF EXISTS set_updated_at_cielo_arquivos ON public.cielo_extratos_arquivos;
CREATE TRIGGER set_updated_at_cielo_arquivos
  BEFORE UPDATE ON public.cielo_extratos_arquivos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. View de resumo — multi-adquirente
DROP VIEW IF EXISTS public.v_conciliacao_loja_resumo;

CREATE VIEW public.v_conciliacao_loja_resumo AS
WITH vc AS (
  SELECT cod_empresa, adquirente,
         COUNT(*) AS qtd_vendas,
         COALESCE(SUM(valor_bruto), 0) AS total_bruto,
         COALESCE(SUM(valor_liquido), 0) AS total_liquido,
         COALESCE(SUM(taxa_valor), 0) AS total_taxas,
         MAX(data_venda) AS ultima_venda,
         MAX(updated_at) AS ultima_sync
  FROM public.vendas_cartao
  WHERE data_venda >= CURRENT_DATE - INTERVAL '90 days'
  GROUP BY cod_empresa, adquirente
),
cn AS (
  SELECT v.cod_empresa, v.adquirente,
    COUNT(*) FILTER (WHERE c.status = 'CONCILIADO') AS qtd_conciliado,
    COUNT(*) FILTER (WHERE c.status = 'DIVERGENTE') AS qtd_divergente,
    COUNT(*) FILTER (WHERE c.status IN ('PENDENTE_ERP', 'PENDENTE_ADQ')) AS qtd_pendente
  FROM public.vendas_cartao v
  LEFT JOIN public.conciliacao_vendas c ON c.venda_cartao_id = v.id
  WHERE v.data_venda >= CURRENT_DATE - INTERVAL '90 days'
  GROUP BY v.cod_empresa, v.adquirente
)
SELECT
  e.cod_empresa,
  e.nome_fantasia,
  ac.adquirente,
  ac.ambiente,
  ac.gv_optin_status,
  ac.gv_last_healthcheck_status,
  ac.cielo_last_healthcheck_status,
  CASE ac.adquirente
    WHEN 'REDE'  THEN COALESCE(array_length(ac.pvs_matriz_production, 1), 0)
    WHEN 'CIELO' THEN COALESCE(array_length(ac.cielo_pvs, 1), 0)
    ELSE 0
  END AS qtd_pvs,
  COALESCE(vc.qtd_vendas, 0) AS qtd_vendas,
  COALESCE(vc.total_bruto, 0) AS total_bruto,
  COALESCE(vc.total_liquido, 0) AS total_liquido,
  COALESCE(vc.total_taxas, 0) AS total_taxas,
  vc.ultima_venda,
  vc.ultima_sync,
  COALESCE(cn.qtd_conciliado, 0) AS qtd_conciliado,
  COALESCE(cn.qtd_divergente, 0) AS qtd_divergente,
  COALESCE(cn.qtd_pendente, 0) AS qtd_pendente
FROM public.empresa e
JOIN public.adquirentes_config ac
  ON ac.cod_empresa = e.cod_empresa AND ac.ativo = true
LEFT JOIN vc ON vc.cod_empresa = e.cod_empresa AND vc.adquirente = ac.adquirente
LEFT JOIN cn ON cn.cod_empresa = e.cod_empresa AND cn.adquirente = ac.adquirente
ORDER BY e.cod_empresa, ac.adquirente;

ALTER VIEW public.v_conciliacao_loja_resumo SET (security_invoker = on);
GRANT SELECT ON public.v_conciliacao_loja_resumo TO authenticated, service_role;