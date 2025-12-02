-- Tabela staging para pessoas/clientes
CREATE TABLE IF NOT EXISTS public.pessoa (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cod_pessoa INTEGER NOT NULL UNIQUE,
  nome TEXT,
  identificador TEXT,
  tipo TEXT,
  cidade TEXT,
  uf TEXT,
  telefone TEXT,
  email TEXT,
  ativo BOOLEAN DEFAULT true,
  vendedor BOOLEAN DEFAULT false,
  stg_loaded_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  stg_source TEXT DEFAULT 'firebird_api'
);

-- Tabela staging para produtos
CREATE TABLE IF NOT EXISTS public.produto (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cod_produto INTEGER NOT NULL UNIQUE,
  descricao TEXT,
  referencia TEXT,
  categoria TEXT,
  ativo BOOLEAN DEFAULT true,
  preco_venda NUMERIC(15,2),
  preco_custo NUMERIC(15,2),
  stg_loaded_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  stg_source TEXT DEFAULT 'firebird_api'
);

-- Tabela staging para vendas
CREATE TABLE IF NOT EXISTS public.venda (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  id_venda INTEGER NOT NULL UNIQUE,
  numero TEXT,
  data_emissao TIMESTAMP WITH TIME ZONE,
  data_lancamento TIMESTAMP WITH TIME ZONE,
  cod_pessoa INTEGER,
  cod_empresa INTEGER,
  cod_vendedor INTEGER,
  status TEXT,
  total NUMERIC(15,2),
  stg_loaded_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  stg_source TEXT DEFAULT 'firebird_api'
);

-- Tabela staging para itens de venda
CREATE TABLE IF NOT EXISTS public.venda_item (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  id_venda INTEGER NOT NULL,
  seq_item INTEGER NOT NULL,
  cod_produto INTEGER,
  quantidade NUMERIC(15,4) DEFAULT 1,
  valor_unitario NUMERIC(15,2),
  valor_desconto NUMERIC(15,2) DEFAULT 0,
  valor_total NUMERIC(15,2),
  stg_loaded_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(id_venda, seq_item)
);

-- Tabela de controle ETL
CREATE TABLE IF NOT EXISTS public.etl_controle (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entidade TEXT NOT NULL UNIQUE,
  ultima_data DATE,
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_pessoa_nome ON public.pessoa(nome);
CREATE INDEX IF NOT EXISTS idx_produto_descricao ON public.produto(descricao);
CREATE INDEX IF NOT EXISTS idx_venda_data_emissao ON public.venda(data_emissao);
CREATE INDEX IF NOT EXISTS idx_venda_cod_pessoa ON public.venda(cod_pessoa);
CREATE INDEX IF NOT EXISTS idx_venda_item_id_venda ON public.venda_item(id_venda);

-- RLS (desabilitado para tabelas staging - acesso via service role)
ALTER TABLE public.pessoa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venda ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venda_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etl_controle ENABLE ROW LEVEL SECURITY;

-- Policies para service role (Edge Functions)
CREATE POLICY "Service role full access pessoa" ON public.pessoa FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access produto" ON public.produto FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access venda" ON public.venda FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access venda_item" ON public.venda_item FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access etl_controle" ON public.etl_controle FOR ALL USING (true) WITH CHECK (true);