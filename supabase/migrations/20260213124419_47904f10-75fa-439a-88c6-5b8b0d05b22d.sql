
-- =====================================================
-- FASE 1.1: Sync Control Plane — Tabelas de controle
-- =====================================================

-- Status possíveis para execuções
CREATE TYPE public.sync_run_status AS ENUM ('pending', 'running', 'completed', 'failed', 'partial');

-- Tabela de execuções (uma por disparo do orchestrate-sync)
CREATE TABLE public.sync_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status sync_run_status NOT NULL DEFAULT 'pending',
  triggered_by UUID REFERENCES auth.users(id),
  trigger_type TEXT NOT NULL DEFAULT 'manual', -- 'manual', 'cron', 'api'
  
  -- Janela de dados processada
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  
  -- Configuração
  entidades TEXT[] NOT NULL DEFAULT '{vendas,clientes,produtos}',
  empresas INT[],  -- NULL = todas
  modo TEXT NOT NULL DEFAULT 'janela_movel', -- 'janela_movel', 'competencia', 'full'
  
  -- Métricas
  total_registros INT DEFAULT 0,
  total_erros INT DEFAULT 0,
  
  -- Timestamps
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  duracao_ms INT,
  
  -- Erro resumido (se houver)
  erro_resumo TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de jobs (um por entidade/empresa dentro de uma execução)
CREATE TABLE public.sync_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.sync_runs(id) ON DELETE CASCADE,
  
  -- Identificação
  entidade TEXT NOT NULL, -- 'vendas', 'clientes', 'produtos', 'agregados-diarios', 'os-hub'
  cod_empresa INT, -- NULL se for cross-empresa
  
  -- Status
  status sync_run_status NOT NULL DEFAULT 'pending',
  
  -- Janela
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  
  -- Métricas
  registros_processados INT DEFAULT 0,
  registros_inseridos INT DEFAULT 0,
  registros_deletados INT DEFAULT 0,
  paginas_processadas INT DEFAULT 0,
  
  -- Timestamps
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  duracao_ms INT,
  
  -- Erro
  erro TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para consultas comuns
CREATE INDEX idx_sync_runs_status ON public.sync_runs(status);
CREATE INDEX idx_sync_runs_created ON public.sync_runs(created_at DESC);
CREATE INDEX idx_sync_jobs_run_id ON public.sync_jobs(run_id);
CREATE INDEX idx_sync_jobs_entidade ON public.sync_jobs(entidade, status);

-- RLS
ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_jobs ENABLE ROW LEVEL SECURITY;

-- Apenas service_role pode escrever (Edge Functions)
CREATE POLICY "Service role full access sync_runs"
  ON public.sync_runs FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access sync_jobs"
  ON public.sync_jobs FOR ALL
  USING (true) WITH CHECK (true);

-- Admin pode ler para monitoramento
CREATE POLICY "Admin read sync_runs"
  ON public.sync_runs FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin read sync_jobs"
  ON public.sync_jobs FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));
