-- Fase 1 — Dados de recebimento (docs/REVISAO_VENDAS_METAS.md §4, §5.2)
-- Cache diário materializado de RECEBIMENTOS (regime de caixa): base de metas
-- e comissões sobre valores recebidos. Alimentada pela edge function
-- sync-recebimentos-diario a partir do firebird-bridge
-- (GET /api/v1/vendas/recebimentos/agregado).

CREATE TABLE public.recebimentos_agregado_diario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_empresa INTEGER NOT NULL,
  cod_vendedor INTEGER NOT NULL,
  vendedor_nome TEXT,
  data_pagamento DATE NOT NULL,
  forma_categoria TEXT NOT NULL,
  origem TEXT NOT NULL,
  valor_recebido NUMERIC(14,2) NOT NULL DEFAULT 0,
  qtd_parcelas INTEGER NOT NULL DEFAULT 0,
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (cod_empresa, cod_vendedor, data_pagamento, forma_categoria, origem)
);

GRANT SELECT ON public.recebimentos_agregado_diario TO anon, authenticated;
GRANT ALL ON public.recebimentos_agregado_diario TO service_role;

CREATE INDEX idx_recebimentos_agregado_data
  ON public.recebimentos_agregado_diario(data_pagamento);
CREATE INDEX idx_recebimentos_agregado_empresa_data
  ON public.recebimentos_agregado_diario(cod_empresa, data_pagamento);

ALTER TABLE public.recebimentos_agregado_diario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read recebimentos_agregado_diario"
  ON public.recebimentos_agregado_diario
  FOR SELECT
  USING (true);

CREATE TABLE public.sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_tipo TEXT NOT NULL,
  periodo_inicio DATE,
  periodo_fim DATE,
  empresas TEXT,
  linhas INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('OK', 'ERRO', 'PARCIAL')),
  detalhe JSONB,
  executado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sync_log TO anon, authenticated;
GRANT ALL ON public.sync_log TO service_role;

CREATE INDEX idx_sync_log_tipo_executado
  ON public.sync_log(sync_tipo, executado_em DESC);

ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read sync_log"
  ON public.sync_log
  FOR SELECT
  USING (true);