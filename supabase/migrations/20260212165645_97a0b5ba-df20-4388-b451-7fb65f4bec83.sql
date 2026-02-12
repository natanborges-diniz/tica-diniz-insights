
-- Tabela rate_limits para controle de chamadas às funções de IA
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  function_name text NOT NULL,
  called_at timestamptz NOT NULL DEFAULT now()
);

-- Índice para busca eficiente
CREATE INDEX idx_rate_limits_user_function_time 
  ON public.rate_limits (user_id, function_name, called_at DESC);

-- RLS: apenas service_role pode ler/escrever
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access rate_limits"
  ON public.rate_limits FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Auto-limpeza: deletar registros com mais de 1 hora
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.rate_limits WHERE called_at < now() - interval '1 hour';
$$;
