
-- Tabela para registrar health checks do Bridge
CREATE TABLE public.bridge_health_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  checked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL CHECK (status IN ('up', 'down', 'timeout')),
  latency_ms INTEGER,
  error_message TEXT,
  bridge_version TEXT
);

-- Índice para consultas por data
CREATE INDEX idx_bridge_health_checked_at ON public.bridge_health_logs (checked_at DESC);

-- Retenção automática: limpar logs > 30 dias
CREATE OR REPLACE FUNCTION public.cleanup_old_health_logs(p_retention_days INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM public.bridge_health_logs WHERE checked_at < now() - (p_retention_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- RLS: apenas service_role pode inserir (edge functions), admins podem ler
ALTER TABLE public.bridge_health_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read health logs"
  ON public.bridge_health_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can insert health logs"
  ON public.bridge_health_logs FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can delete health logs"
  ON public.bridge_health_logs FOR DELETE
  USING (true);
