-- Fase 1 — Dados de recebimento (docs/REVISAO_VENDAS_METAS.md §4, §5.2)
-- Cache diário materializado de RECEBIMENTOS (regime de caixa): base de metas
-- e comissões sobre valores recebidos. Alimentada pela edge function
-- sync-recebimentos-diario a partir do firebird-bridge
-- (GET /api/v1/vendas/recebimentos/agregado).

CREATE TABLE public.recebimentos_agregado_diario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_empresa INTEGER NOT NULL,
  -- cod_vendedor 0 = sem vendedor identificado (NULL quebraria o upsert na
  -- UNIQUE, pois NULLs não colidem em constraint única)
  cod_vendedor INTEGER NOT NULL,
  vendedor_nome TEXT,
  data_pagamento DATE NOT NULL,
  -- AVISTA | CHEQUE | CARTAO_CREDITO | CARTAO_DEBITO | CREDIARIO | CREDITOS | BANCO | OUTROS
  forma_categoria TEXT NOT NULL,
  -- VENDA_PERIODO | SALDO_ANTERIOR — sempre relativa à SEMANA COMERCIAL
  -- (segunda-feira → domingo) da data de pagamento; o sync consulta o bridge
  -- semana a semana para garantir essa semântica (ver edge function).
  origem TEXT NOT NULL,

  valor_recebido NUMERIC(14,2) NOT NULL DEFAULT 0,
  qtd_parcelas INTEGER NOT NULL DEFAULT 0,

  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  -- Constraint única para upsert (onConflict do sync)
  UNIQUE (cod_empresa, cod_vendedor, data_pagamento, forma_categoria, origem)
);

CREATE INDEX idx_recebimentos_agregado_data
  ON public.recebimentos_agregado_diario(data_pagamento);
CREATE INDEX idx_recebimentos_agregado_empresa_data
  ON public.recebimentos_agregado_diario(cod_empresa, data_pagamento);

-- RLS: mesmo padrão da vendas_agregado_diario — leitura pública para o
-- dashboard; escrita sem policy (só o service role, que bypassa RLS).
ALTER TABLE public.recebimentos_agregado_diario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read recebimentos_agregado_diario"
  ON public.recebimentos_agregado_diario
  FOR SELECT
  USING (true);

-- ============================================================
-- sync_log — log genérico das execuções de sync (plano §4: "gravar sync_log
-- (última execução, linhas, erros) exibido no frontend").
--
-- Nota: as tabelas sync_runs/sync_jobs/sync_locks existentes (migration
-- 20260213124419) são específicas do orquestrador de estoque
-- (orchestrate-sync): enum sync_run_status pending/running, jobs por entidade,
-- lock lógico. O shape não comporta o log simples por tipo de sync
-- (OK/PARCIAL/ERRO + detalhe jsonb), então criamos sync_log separada.
-- ============================================================

CREATE TABLE public.sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ex.: 'recebimentos_diario'
  sync_tipo TEXT NOT NULL,
  periodo_inicio DATE,
  periodo_fim DATE,
  -- lista de empresas sincronizadas, ex.: '1,2,4,6'
  empresas TEXT,
  linhas INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('OK', 'ERRO', 'PARCIAL')),
  detalhe JSONB,
  executado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_log_tipo_executado
  ON public.sync_log(sync_tipo, executado_em DESC);

-- Leitura para o frontend ("dados de DD/MM HH:mm"); escrita só service role.
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read sync_log"
  ON public.sync_log
  FOR SELECT
  USING (true);
