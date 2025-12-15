-- Tabela de Metas de Vendas
CREATE TABLE public.metas_vendas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('LOJA', 'VENDEDOR')),
  cod_referencia INTEGER NOT NULL,
  nome_referencia TEXT,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  meta_faturamento NUMERIC DEFAULT 0,
  meta_ticket_medio NUMERIC DEFAULT 0,
  meta_desconto_max NUMERIC DEFAULT 0,
  meta_qtd_vendas INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tipo, cod_referencia, ano, mes)
);

-- Enable RLS
ALTER TABLE public.metas_vendas ENABLE ROW LEVEL SECURITY;

-- Policy for public read (dashboard access)
CREATE POLICY "Public read metas_vendas" 
ON public.metas_vendas 
FOR SELECT 
USING (true);

-- Policy for service role full access
CREATE POLICY "Service role full access metas_vendas" 
ON public.metas_vendas 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_metas_vendas_updated_at
BEFORE UPDATE ON public.metas_vendas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for faster queries
CREATE INDEX idx_metas_vendas_tipo_periodo ON public.metas_vendas(tipo, ano, mes);
CREATE INDEX idx_metas_vendas_referencia ON public.metas_vendas(cod_referencia);