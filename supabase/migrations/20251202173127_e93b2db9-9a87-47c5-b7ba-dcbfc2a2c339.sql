-- Adiciona colunas para nomes na tabela venda
ALTER TABLE public.venda 
ADD COLUMN IF NOT EXISTS cliente_nome TEXT,
ADD COLUMN IF NOT EXISTS loja_nome TEXT,
ADD COLUMN IF NOT EXISTS vendedor_nome TEXT;

-- Adiciona coluna cod_vendedor se não existir
ALTER TABLE public.venda 
ADD COLUMN IF NOT EXISTS cod_vendedor INTEGER;

-- Cria tabela empresa no schema public para mapeamento
CREATE TABLE IF NOT EXISTS public.empresa (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cod_empresa INTEGER UNIQUE NOT NULL,
  razao_social TEXT,
  nome_fantasia TEXT,
  cnpj TEXT,
  cidade TEXT,
  uf TEXT,
  stg_loaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  stg_source TEXT DEFAULT 'firebird_api'
);

-- Cria índices para busca por nome
CREATE INDEX IF NOT EXISTS idx_empresa_nome_fantasia ON public.empresa(nome_fantasia);
CREATE INDEX IF NOT EXISTS idx_venda_loja_nome ON public.venda(loja_nome);
CREATE INDEX IF NOT EXISTS idx_venda_cliente_nome ON public.venda(cliente_nome);