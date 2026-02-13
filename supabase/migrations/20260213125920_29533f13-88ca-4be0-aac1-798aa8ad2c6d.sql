
-- =====================================================
-- FASE 1.2: Observabilidade, Lock Lógico e Retenção
-- =====================================================

-- 1. Adicionar campos de observabilidade a sync_runs
ALTER TABLE public.sync_runs 
ADD COLUMN IF NOT EXISTS error_code TEXT,
ADD COLUMN IF NOT EXISTS error_message TEXT,
ADD COLUMN IF NOT EXISTS error_step TEXT,
ADD COLUMN IF NOT EXISTS is_auto_triggered BOOLEAN DEFAULT false;

-- 2. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_sync_runs_running ON public.sync_runs(modo, status) 
WHERE status = 'running';

CREATE INDEX IF NOT EXISTS idx_sync_runs_created_at ON public.sync_runs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_jobs_run_id ON public.sync_jobs(run_id);

-- 3. Tabela de lock lógico
CREATE TABLE IF NOT EXISTS public.sync_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lock_key TEXT UNIQUE NOT NULL,
  acquired_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_locks_lock_key ON public.sync_locks(lock_key);

-- 4. Função para adquirir lock
CREATE OR REPLACE FUNCTION public.acquire_sync_lock(
  p_lock_key TEXT,
  p_timeout_minutes INT DEFAULT 30
)
RETURNS BOOLEAN AS $$
DECLARE
  v_result BOOLEAN;
BEGIN
  DELETE FROM public.sync_locks WHERE expires_at < now();
  
  INSERT INTO public.sync_locks (lock_key, expires_at)
  VALUES (p_lock_key, now() + (p_timeout_minutes || ' minutes')::INTERVAL)
  ON CONFLICT (lock_key) DO NOTHING;
  
  SELECT EXISTS(
    SELECT 1 FROM public.sync_locks 
    WHERE lock_key = p_lock_key AND expires_at > now()
  ) INTO v_result;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- 5. Função para liberar lock
CREATE OR REPLACE FUNCTION public.release_sync_lock(p_lock_key TEXT)
RETURNS VOID AS $$
BEGIN
  DELETE FROM public.sync_locks WHERE lock_key = p_lock_key;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- 6. Função de limpeza (retenção 90 dias)
CREATE OR REPLACE FUNCTION public.cleanup_old_sync_logs(p_retention_days INT DEFAULT 90)
RETURNS TABLE(deleted_runs INT, deleted_jobs INT, deleted_locks INT) AS $$
DECLARE
  v_cutoff_date TIMESTAMP WITH TIME ZONE;
  v_deleted_runs INT;
  v_deleted_jobs INT;
  v_deleted_locks INT;
BEGIN
  v_cutoff_date := now() - (p_retention_days || ' days')::INTERVAL;
  
  DELETE FROM public.sync_jobs WHERE created_at < v_cutoff_date;
  GET DIAGNOSTICS v_deleted_jobs = ROW_COUNT;
  
  DELETE FROM public.sync_runs WHERE created_at < v_cutoff_date;
  GET DIAGNOSTICS v_deleted_runs = ROW_COUNT;
  
  DELETE FROM public.sync_locks WHERE expires_at < now();
  GET DIAGNOSTICS v_deleted_locks = ROW_COUNT;
  
  RETURN QUERY SELECT v_deleted_runs, v_deleted_jobs, v_deleted_locks;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- 7. View de falhas recentes (7 dias)
CREATE OR REPLACE VIEW public.sync_failures_summary AS
SELECT 
  sr.id as run_id, sr.created_at, sr.status, sr.error_code, sr.error_step,
  sr.error_message, sr.total_erros, COUNT(sj.id) as failed_jobs,
  sr.triggered_by, sr.modo, sr.data_inicio, sr.data_fim
FROM public.sync_runs sr
LEFT JOIN public.sync_jobs sj ON sr.id = sj.run_id AND sj.status = 'failed'
WHERE sr.created_at > now() - INTERVAL '7 days'
  AND (sr.status = 'failed' OR sr.status = 'partial')
GROUP BY sr.id
ORDER BY sr.created_at DESC;

-- 8. View para últimos runs (sem UNNEST problemático)
CREATE OR REPLACE VIEW public.sync_runs_recent AS
SELECT 
  sr.id as run_id, sr.status, sr.created_at, sr.started_at, sr.finished_at,
  sr.duracao_ms, sr.total_registros, sr.total_erros, sr.modo,
  sr.is_auto_triggered, sr.error_code, sr.error_message, sr.error_step,
  sr.entidades, sr.empresas, sr.trigger_type
FROM public.sync_runs sr
WHERE sr.created_at > now() - INTERVAL '30 days'
ORDER BY sr.created_at DESC;

-- 9. RLS para sync_locks
ALTER TABLE public.sync_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access sync_locks" ON public.sync_locks 
FOR ALL USING (true) WITH CHECK (true);
