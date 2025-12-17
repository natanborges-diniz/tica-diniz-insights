-- Adicionar num_vendedores à tabela metas_vendas para configuração por mês
ALTER TABLE public.metas_vendas
ADD COLUMN IF NOT EXISTS num_vendedores integer DEFAULT 1;

-- Comentário explicativo
COMMENT ON COLUMN public.metas_vendas.num_vendedores IS 'Número de vendedores para cálculo de meta individual por mês/loja';