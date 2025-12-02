-- Criar função para transformação DW acessível via RPC
CREATE OR REPLACE FUNCTION public.executar_transformacao_dw()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, dw, dq
AS $$
DECLARE
  resultado jsonb;
  v_dim_loja int := 0;
  v_dim_cliente int := 0;
  v_dim_vendedor int := 0;
  v_dim_produto int := 0;
  v_dim_tempo int := 0;
  v_fato_venda_item int := 0;
BEGIN
  -- 1. Popular dim_loja a partir de empresa
  INSERT INTO dw.dim_loja (id_loja, cod_empresa, nome, cidade, uf)
  SELECT cod_empresa, cod_empresa, nome_fantasia, cidade, uf
  FROM public.empresa
  ON CONFLICT (id_loja) DO UPDATE SET
    nome = EXCLUDED.nome,
    cidade = EXCLUDED.cidade,
    uf = EXCLUDED.uf;
  GET DIAGNOSTICS v_dim_loja = ROW_COUNT;
  
  -- 2. Popular dim_cliente a partir de pessoa
  INSERT INTO dw.dim_cliente (id_cliente, cod_pessoa, nome, identificador, tipo, cidade, uf, telefone, email)
  SELECT cod_pessoa, cod_pessoa, nome, identificador, tipo, cidade, uf, telefone, email
  FROM public.pessoa
  WHERE vendedor IS NOT TRUE
  ON CONFLICT (id_cliente) DO UPDATE SET
    nome = EXCLUDED.nome,
    identificador = EXCLUDED.identificador,
    tipo = EXCLUDED.tipo,
    cidade = EXCLUDED.cidade,
    uf = EXCLUDED.uf,
    telefone = EXCLUDED.telefone,
    email = EXCLUDED.email;
  GET DIAGNOSTICS v_dim_cliente = ROW_COUNT;
  
  -- 3. Popular dim_vendedor a partir de pessoa (vendedor = true)
  INSERT INTO dw.dim_vendedor (id_vendedor, cod_pessoa, nome)
  SELECT cod_pessoa, cod_pessoa, nome
  FROM public.pessoa
  WHERE vendedor = TRUE
  ON CONFLICT (id_vendedor) DO UPDATE SET
    nome = EXCLUDED.nome;
  GET DIAGNOSTICS v_dim_vendedor = ROW_COUNT;
  
  -- 4. Popular dim_produto a partir de produto
  INSERT INTO dw.dim_produto (id_produto, cod_produto, descricao, categoria, referencia, preco_venda, preco_custo)
  SELECT cod_produto, cod_produto, descricao, categoria, referencia, preco_venda, preco_custo
  FROM public.produto
  ON CONFLICT (id_produto) DO UPDATE SET
    descricao = EXCLUDED.descricao,
    categoria = EXCLUDED.categoria,
    referencia = EXCLUDED.referencia,
    preco_venda = EXCLUDED.preco_venda,
    preco_custo = EXCLUDED.preco_custo;
  GET DIAGNOSTICS v_dim_produto = ROW_COUNT;
  
  -- 5. Popular dim_tempo a partir das datas das vendas
  INSERT INTO dw.dim_tempo (id_tempo, data, ano, mes, dia, dia_semana, trimestre)
  SELECT DISTINCT
    TO_CHAR(data_emissao::date, 'YYYYMMDD')::int AS id_tempo,
    data_emissao::date AS data,
    EXTRACT(YEAR FROM data_emissao)::int AS ano,
    EXTRACT(MONTH FROM data_emissao)::int AS mes,
    EXTRACT(DAY FROM data_emissao)::int AS dia,
    EXTRACT(DOW FROM data_emissao)::int AS dia_semana,
    EXTRACT(QUARTER FROM data_emissao)::int AS trimestre
  FROM public.venda
  WHERE data_emissao IS NOT NULL
  ON CONFLICT (id_tempo) DO NOTHING;
  GET DIAGNOSTICS v_dim_tempo = ROW_COUNT;
  
  -- 6. Popular fato_venda_item a partir de venda
  INSERT INTO dw.fato_venda_item (id_venda, id_tempo, id_loja, id_cliente, id_vendedor, id_produto, seq_item, quantidade, valor_bruto, valor_desconto, valor_liquido)
  SELECT 
    v.id_venda,
    TO_CHAR(v.data_emissao::date, 'YYYYMMDD')::int AS id_tempo,
    v.cod_empresa AS id_loja,
    COALESCE(v.cod_pessoa, -1) AS id_cliente,
    v.cod_vendedor AS id_vendedor,
    -1 AS id_produto,
    1 AS seq_item,
    1 AS quantidade,
    v.total AS valor_bruto,
    0 AS valor_desconto,
    v.total AS valor_liquido
  FROM public.venda v
  WHERE v.data_emissao IS NOT NULL
    AND v.cod_empresa IS NOT NULL
  ON CONFLICT (id_venda, seq_item) DO UPDATE SET
    valor_bruto = EXCLUDED.valor_bruto,
    valor_liquido = EXCLUDED.valor_liquido;
  GET DIAGNOSTICS v_fato_venda_item = ROW_COUNT;
  
  resultado := jsonb_build_object(
    'dim_loja', v_dim_loja,
    'dim_cliente', v_dim_cliente,
    'dim_vendedor', v_dim_vendedor,
    'dim_produto', v_dim_produto,
    'dim_tempo', v_dim_tempo,
    'fato_venda_item', v_fato_venda_item
  );
  
  RETURN resultado;
END;
$$;