-- ======================================
-- SCHEMAS
-- ======================================
CREATE SCHEMA IF NOT EXISTS stg;
CREATE SCHEMA IF NOT EXISTS dw;
CREATE SCHEMA IF NOT EXISTS dq;

-- ======================================
-- STAGING LAYER
-- ======================================

-- Clientes
CREATE TABLE IF NOT EXISTS stg.pessoa (
  cod_pessoa      BIGINT PRIMARY KEY,
  nome            TEXT NOT NULL,
  identificador   TEXT,
  tipo            TEXT,
  cidade          TEXT,
  uf              TEXT,
  telefone        TEXT,
  email           TEXT,
  ativo           BOOLEAN,
  vendedor        BOOLEAN,
  stg_loaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stg_source      TEXT DEFAULT 'firebird_api'
);

-- Lojas
CREATE TABLE IF NOT EXISTS stg.empresa (
  cod_empresa     BIGINT PRIMARY KEY,
  nome            TEXT NOT NULL,
  razao_social    TEXT,
  cnpj            TEXT,
  cidade          TEXT,
  uf              TEXT,
  telefone        TEXT,
  stg_loaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stg_source      TEXT DEFAULT 'firebird_api'
);

-- Produtos
CREATE TABLE IF NOT EXISTS stg.produto (
  cod_produto     BIGINT PRIMARY KEY,
  descricao       TEXT NOT NULL,
  referencia      TEXT,
  categoria       TEXT,
  ativo           BOOLEAN,
  stg_loaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stg_source      TEXT DEFAULT 'firebird_api'
);

-- Vendas (cabecalho)
CREATE TABLE IF NOT EXISTS stg.venda (
  id_venda        BIGINT PRIMARY KEY,
  numero          TEXT,
  data_emissao    TIMESTAMPTZ NOT NULL,
  data_lancamento TIMESTAMPTZ,
  cod_pessoa      BIGINT,
  cod_empresa     BIGINT,
  status          TEXT,
  total           NUMERIC(15,2),
  stg_loaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stg_source      TEXT DEFAULT 'firebird_api'
);

-- Itens da venda
CREATE TABLE IF NOT EXISTS stg.venda_item (
  id_venda        BIGINT NOT NULL,
  seq_item        INTEGER NOT NULL,
  cod_produto     BIGINT NOT NULL,
  quantidade      NUMERIC(15,3) NOT NULL,
  valor_unitario  NUMERIC(15,2),
  valor_desconto  NUMERIC(15,2),
  valor_total     NUMERIC(15,2),
  stg_loaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stg_source      TEXT DEFAULT 'firebird_api',
  CONSTRAINT pk_venda_item PRIMARY KEY (id_venda, seq_item)
);

-- Estoque
CREATE TABLE IF NOT EXISTS stg.estoque (
  cod_produto     BIGINT NOT NULL,
  cod_empresa     BIGINT NOT NULL,
  quantidade      NUMERIC(15,3),
  stg_loaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stg_source      TEXT DEFAULT 'firebird_api',
  CONSTRAINT pk_estoque PRIMARY KEY (cod_produto, cod_empresa)
);

-- Controle ETL
CREATE TABLE IF NOT EXISTS stg.etl_controle (
  entidade        TEXT PRIMARY KEY,
  ultima_sinc     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status          TEXT DEFAULT 'pending',
  mensagem        TEXT
);

INSERT INTO stg.etl_controle (entidade, status) VALUES 
  ('clientes', 'pending'),
  ('produtos', 'pending'),
  ('vendas', 'pending'),
  ('estoque', 'pending')
ON CONFLICT (entidade) DO NOTHING;

-- ======================================
-- DATA WAREHOUSE LAYER
-- ======================================

-- Dim tempo
CREATE TABLE IF NOT EXISTS dw.dim_tempo (
  id_tempo        SERIAL PRIMARY KEY,
  data            DATE UNIQUE NOT NULL,
  ano             INTEGER NOT NULL,
  mes             INTEGER NOT NULL,
  dia             INTEGER NOT NULL,
  mes_nome        TEXT NOT NULL,
  trimestre       INTEGER NOT NULL,
  dia_semana      INTEGER NOT NULL,
  dia_semana_nome TEXT NOT NULL
);

-- Popular dim_tempo com últimos 5 anos e próximos 2 anos
INSERT INTO dw.dim_tempo (data, ano, mes, dia, mes_nome, trimestre, dia_semana, dia_semana_nome)
SELECT 
  d::DATE,
  EXTRACT(YEAR FROM d)::INTEGER,
  EXTRACT(MONTH FROM d)::INTEGER,
  EXTRACT(DAY FROM d)::INTEGER,
  TO_CHAR(d, 'Month'),
  EXTRACT(QUARTER FROM d)::INTEGER,
  EXTRACT(DOW FROM d)::INTEGER,
  TO_CHAR(d, 'Day')
FROM GENERATE_SERIES(
  CURRENT_DATE - INTERVAL '5 years',
  CURRENT_DATE + INTERVAL '2 years',
  INTERVAL '1 day'
) AS d
ON CONFLICT (data) DO NOTHING;

-- Dim loja
CREATE TABLE IF NOT EXISTS dw.dim_loja (
  id_loja         SERIAL PRIMARY KEY,
  cod_empresa     BIGINT UNIQUE NOT NULL,
  nome            TEXT NOT NULL,
  cidade          TEXT,
  uf              TEXT,
  cnpj            TEXT,
  ativo           BOOLEAN DEFAULT TRUE
);

-- Dim cliente
CREATE TABLE IF NOT EXISTS dw.dim_cliente (
  id_cliente      SERIAL PRIMARY KEY,
  cod_pessoa      BIGINT UNIQUE NOT NULL,
  nome            TEXT NOT NULL,
  identificador   TEXT,
  tipo            TEXT,
  cidade          TEXT,
  uf              TEXT,
  telefone        TEXT,
  email           TEXT,
  ativo           BOOLEAN DEFAULT TRUE
);

-- Dim vendedor
CREATE TABLE IF NOT EXISTS dw.dim_vendedor (
  id_vendedor     SERIAL PRIMARY KEY,
  cod_pessoa      BIGINT UNIQUE NOT NULL,
  nome            TEXT NOT NULL,
  ativo           BOOLEAN DEFAULT TRUE
);

-- Dim produto
CREATE TABLE IF NOT EXISTS dw.dim_produto (
  id_produto      SERIAL PRIMARY KEY,
  cod_produto     BIGINT UNIQUE NOT NULL,
  descricao       TEXT NOT NULL,
  referencia      TEXT,
  categoria       TEXT,
  ativo           BOOLEAN DEFAULT TRUE
);

-- Fato venda item
CREATE TABLE IF NOT EXISTS dw.fato_venda_item (
  id              BIGSERIAL PRIMARY KEY,
  id_loja         INTEGER REFERENCES dw.dim_loja(id_loja),
  id_cliente      INTEGER REFERENCES dw.dim_cliente(id_cliente),
  id_vendedor     INTEGER,
  id_produto      INTEGER REFERENCES dw.dim_produto(id_produto),
  id_tempo        INTEGER REFERENCES dw.dim_tempo(id_tempo),
  id_venda        BIGINT NOT NULL,
  seq_item        INTEGER NOT NULL,
  quantidade      NUMERIC(15,3) NOT NULL,
  valor_bruto     NUMERIC(15,2) NOT NULL,
  valor_desconto  NUMERIC(15,2) NOT NULL,
  valor_liquido   NUMERIC(15,2) NOT NULL,
  custo_estimado  NUMERIC(15,2),
  margem_bruta    NUMERIC(15,2),
  CONSTRAINT uq_venda_item UNIQUE (id_venda, seq_item)
);

-- View KPI por loja/dia
CREATE OR REPLACE VIEW dw.vw_kpi_loja_dia AS
SELECT 
  l.id_loja,
  l.nome AS loja_nome,
  t.data,
  t.ano,
  t.mes,
  COUNT(DISTINCT f.id_venda) AS qtd_vendas,
  SUM(f.quantidade) AS qtd_itens,
  SUM(f.valor_liquido) AS faturamento,
  AVG(f.valor_liquido) AS ticket_medio,
  SUM(f.valor_desconto) AS total_desconto,
  CASE 
    WHEN SUM(f.valor_bruto) > 0 
    THEN (SUM(f.valor_desconto) / SUM(f.valor_bruto) * 100)
    ELSE 0 
  END AS perc_desconto,
  SUM(f.margem_bruta) AS margem_total,
  CASE 
    WHEN SUM(f.valor_liquido) > 0 
    THEN (SUM(f.margem_bruta) / SUM(f.valor_liquido) * 100)
    ELSE 0 
  END AS perc_margem
FROM dw.fato_venda_item f
JOIN dw.dim_loja l ON f.id_loja = l.id_loja
JOIN dw.dim_tempo t ON f.id_tempo = t.id_tempo
GROUP BY l.id_loja, l.nome, t.data, t.ano, t.mes;

-- View Cliente 360
CREATE OR REPLACE VIEW dw.vw_cliente_360 AS
SELECT 
  c.id_cliente,
  c.cod_pessoa,
  c.nome,
  c.identificador,
  c.tipo,
  c.cidade,
  c.uf,
  c.telefone,
  c.email,
  COUNT(DISTINCT f.id_venda) AS total_compras,
  SUM(f.valor_liquido) AS total_gasto,
  AVG(f.valor_liquido) AS ticket_medio,
  MAX(t.data) AS ultima_compra,
  CURRENT_DATE - MAX(t.data) AS dias_sem_comprar
FROM dw.dim_cliente c
LEFT JOIN dw.fato_venda_item f ON c.id_cliente = f.id_cliente
LEFT JOIN dw.dim_tempo t ON f.id_tempo = t.id_tempo
GROUP BY c.id_cliente, c.cod_pessoa, c.nome, c.identificador, c.tipo, c.cidade, c.uf, c.telefone, c.email;

-- View base para campanhas de recall
CREATE OR REPLACE VIEW dw.vw_campanha_recall_cliente AS
SELECT 
  id_cliente,
  cod_pessoa,
  nome,
  telefone,
  email,
  ultima_compra,
  dias_sem_comprar,
  total_compras,
  ticket_medio,
  CASE 
    WHEN dias_sem_comprar > 365 THEN 'Inativo'
    WHEN dias_sem_comprar > 180 THEN 'Risco'
    WHEN dias_sem_comprar > 90 THEN 'Atencao'
    ELSE 'Ativo'
  END AS status_cliente
FROM dw.vw_cliente_360
WHERE ultima_compra IS NOT NULL
  AND dias_sem_comprar > 90
ORDER BY dias_sem_comprar DESC;

-- ======================================
-- DATA QUALITY LAYER
-- ======================================

-- Log de problemas
CREATE TABLE IF NOT EXISTS dq.log_problema (
  id                  BIGSERIAL PRIMARY KEY,
  data_registro       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tipo_problema       TEXT NOT NULL,
  tabela_origem       TEXT NOT NULL,
  chave_origem        TEXT NOT NULL,
  descricao_problema  TEXT,
  sugestao_correcao   TEXT,
  resolvido           BOOLEAN DEFAULT FALSE
);

-- Orfãos de cliente
CREATE TABLE IF NOT EXISTS dq.orfao_cliente (
  id               BIGSERIAL PRIMARY KEY,
  id_venda         BIGINT NOT NULL,
  cod_pessoa       BIGINT NOT NULL,
  data_registro    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  detalhe          TEXT
);

-- Orfãos de produto
CREATE TABLE IF NOT EXISTS dq.orfao_produto (
  id               BIGSERIAL PRIMARY KEY,
  id_venda         BIGINT NOT NULL,
  seq_item         INTEGER NOT NULL,
  cod_produto      BIGINT NOT NULL,
  data_registro    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  detalhe          TEXT
);

-- Orfãos de loja
CREATE TABLE IF NOT EXISTS dq.orfao_loja (
  id               BIGSERIAL PRIMARY KEY,
  id_venda         BIGINT NOT NULL,
  cod_empresa      BIGINT NOT NULL,
  data_registro    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  detalhe          TEXT
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_venda_data ON stg.venda(data_emissao);
CREATE INDEX IF NOT EXISTS idx_venda_cliente ON stg.venda(cod_pessoa);
CREATE INDEX IF NOT EXISTS idx_venda_empresa ON stg.venda(cod_empresa);
CREATE INDEX IF NOT EXISTS idx_fato_venda_tempo ON dw.fato_venda_item(id_tempo);
CREATE INDEX IF NOT EXISTS idx_fato_venda_loja ON dw.fato_venda_item(id_loja);
CREATE INDEX IF NOT EXISTS idx_fato_venda_cliente ON dw.fato_venda_item(id_cliente);
CREATE INDEX IF NOT EXISTS idx_fato_venda_produto ON dw.fato_venda_item(id_produto);