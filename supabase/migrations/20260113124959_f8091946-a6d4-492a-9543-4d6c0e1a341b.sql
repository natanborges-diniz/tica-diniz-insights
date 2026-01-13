-- Tabela de agregados diários de vendas (cache pré-calculado)
CREATE TABLE public.vendas_agregado_diario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data DATE NOT NULL,
  cod_empresa INTEGER NOT NULL,
  vendedor TEXT NOT NULL,
  forma_pagamento TEXT NOT NULL,
  
  -- Métricas agregadas do dia
  total_vendido NUMERIC DEFAULT 0,
  total_bruto NUMERIC DEFAULT 0,
  total_desconto NUMERIC DEFAULT 0,
  qtd_vendas INTEGER DEFAULT 0,
  
  -- Controle
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Constraint única para upsert
  UNIQUE(data, cod_empresa, vendedor, forma_pagamento)
);

-- Índices para consultas rápidas por período
CREATE INDEX idx_agregado_data ON public.vendas_agregado_diario(data);
CREATE INDEX idx_agregado_empresa_data ON public.vendas_agregado_diario(cod_empresa, data);
CREATE INDEX idx_agregado_empresa_periodo ON public.vendas_agregado_diario(cod_empresa, data DESC);

-- RLS: Leitura pública para o dashboard
ALTER TABLE public.vendas_agregado_diario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read vendas_agregado_diario" 
  ON public.vendas_agregado_diario 
  FOR SELECT 
  USING (true);