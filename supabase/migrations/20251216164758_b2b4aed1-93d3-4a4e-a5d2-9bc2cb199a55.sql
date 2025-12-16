-- Adicionar colunas para número de vendedores e percentual aceitável na tabela lojas_configuracao
ALTER TABLE public.lojas_configuracao 
ADD COLUMN IF NOT EXISTS num_vendedores integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS percentual_aceitavel numeric DEFAULT 100;

-- Adicionar comentários explicativos
COMMENT ON COLUMN public.lojas_configuracao.num_vendedores IS 'Número de vendedores na loja para cálculo de meta individual';
COMMENT ON COLUMN public.lojas_configuracao.percentual_aceitavel IS 'Percentual mínimo aceitável da meta (ex: 90 = aceita a partir de 90%)';