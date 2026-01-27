-- Tabela para configurar estoque mínimo por loja e categoria de produto
CREATE TABLE public.estoque_minimo_loja (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cod_empresa INTEGER NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'TODOS', -- ARMACOES, LENTES, ACESSORIOS, TODOS
  curva_abc CHAR(1) NOT NULL DEFAULT 'A', -- A, B, C
  quantidade_minima INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(cod_empresa, categoria, curva_abc)
);

-- Enable RLS
ALTER TABLE public.estoque_minimo_loja ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Public read estoque_minimo_loja"
ON public.estoque_minimo_loja
FOR SELECT
USING (true);

CREATE POLICY "Service role full access estoque_minimo_loja"
ON public.estoque_minimo_loja
FOR ALL
USING (true)
WITH CHECK (true);

-- Trigger para updated_at
CREATE TRIGGER update_estoque_minimo_loja_updated_at
BEFORE UPDATE ON public.estoque_minimo_loja
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Comentário
COMMENT ON TABLE public.estoque_minimo_loja IS 'Configuração de estoque mínimo por loja, categoria e curva ABC para cálculo OTB';