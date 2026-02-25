
-- Tabela btg_extrato: lançamentos do extrato bancário
CREATE TABLE public.btg_extrato (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cod_empresa INTEGER NOT NULL,
  data_lancamento DATE NOT NULL,
  descricao TEXT,
  valor NUMERIC NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'CREDITO',
  natureza TEXT,
  conciliado BOOLEAN NOT NULL DEFAULT false,
  referencia_id UUID,
  saldo_apos NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.btg_extrato ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access btg_extrato"
  ON public.btg_extrato FOR ALL
  USING (true) WITH CHECK (true);

-- Admin full access
CREATE POLICY "Admin full access btg_extrato"
  ON public.btg_extrato FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Tenant read
CREATE POLICY "Tenant read btg_extrato"
  ON public.btg_extrato FOR SELECT
  USING (cod_empresa IN (
    SELECT uep.cod_empresa FROM user_empresa_permissions uep WHERE uep.user_id = auth.uid()
  ));

-- Index for common queries
CREATE INDEX idx_btg_extrato_empresa_data ON public.btg_extrato (cod_empresa, data_lancamento DESC);

-- Webhook events table for Phase 5
CREATE TABLE public.btg_webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.btg_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access btg_webhook_events"
  ON public.btg_webhook_events FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Admin read btg_webhook_events"
  ON public.btg_webhook_events FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));
