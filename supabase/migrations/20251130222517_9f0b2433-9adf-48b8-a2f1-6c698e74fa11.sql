-- Stored procedure para atualizar dimensões e popular fatos
-- Esta função é chamada pela edge function transform-dw

create or replace function dw.processar_transformacao_dw()
returns jsonb
language plpgsql
security definer
as $$
declare
  v_result jsonb;
  v_count_tempo int;
  v_count_loja int;
  v_count_cliente int;
  v_count_produto int;
  v_count_orfao_cliente int;
  v_count_orfao_produto int;
  v_count_orfao_loja int;
  v_count_fato int;
begin
  -- ETAPA 1: Atualizar DIM TEMPO
  with inserted as (
    insert into dw.dim_tempo (data, ano, mes, dia, mes_nome)
    select
        d::date as data,
        extract(year from d)::int as ano,
        extract(month from d)::int as mes,
        extract(day from d)::int as dia,
        to_char(d, 'TMMonth') as mes_nome
    from (
        select distinct date(data_emissao) as d
        from stg.venda
        where data_emissao is not null
    ) src
    left join dw.dim_tempo dt on dt.data = src.d
    where dt.id_tempo is null
    returning 1
  )
  select count(*) into v_count_tempo from inserted;

  -- ETAPA 2: Atualizar DIM LOJA
  with inserted as (
    insert into dw.dim_loja (cod_empresa, nome, cidade, uf)
    select e.cod_empresa, e.nome, e.cidade, e.uf
    from stg.empresa e
    left join dw.dim_loja dl on dl.cod_empresa = e.cod_empresa
    where dl.id_loja is null
    returning 1
  )
  select count(*) into v_count_loja from inserted;

  -- ETAPA 3: Atualizar DIM CLIENTE
  with inserted as (
    insert into dw.dim_cliente (cod_pessoa, nome, identificador, cidade, uf)
    select p.cod_pessoa, p.nome, p.identificador, p.cidade, p.uf
    from stg.pessoa p
    left join dw.dim_cliente dc on dc.cod_pessoa = p.cod_pessoa
    where dc.id_cliente is null
    returning 1
  )
  select count(*) into v_count_cliente from inserted;

  -- ETAPA 4: Atualizar DIM PRODUTO
  with inserted as (
    insert into dw.dim_produto (cod_produto, descricao, referencia, categoria)
    select pr.cod_produto, pr.descricao, pr.referencia, pr.categoria
    from stg.produto pr
    left join dw.dim_produto dp on dp.cod_produto = pr.cod_produto
    where dp.id_produto is null
    returning 1
  )
  select count(*) into v_count_produto from inserted;

  -- ETAPA 5: Registrar órfãos - CLIENTES
  with inserted as (
    insert into dq.orfao_cliente (id_venda, cod_pessoa, detalhe)
    select distinct
        v.id_venda,
        v.cod_pessoa,
        'Cliente não encontrado em dw.dim_cliente'
    from stg.venda v
    left join dw.dim_cliente dc on dc.cod_pessoa = v.cod_pessoa
    where v.cod_pessoa is not null
      and dc.id_cliente is null
      and not exists (
          select 1 from dq.orfao_cliente oc
          where oc.id_venda = v.id_venda and oc.cod_pessoa = v.cod_pessoa
      )
    returning 1
  )
  select count(*) into v_count_orfao_cliente from inserted;

  -- ETAPA 6: Registrar órfãos - PRODUTOS
  with inserted as (
    insert into dq.orfao_produto (id_venda, cod_produto, detalhe)
    select distinct
        vi.id_venda,
        vi.cod_produto,
        'Produto não encontrado em dw.dim_produto'
    from stg.venda_item vi
    left join dw.dim_produto dp on dp.cod_produto = vi.cod_produto
    where vi.cod_produto is not null
      and dp.id_produto is null
      and not exists (
          select 1 from dq.orfao_produto op
          where op.id_venda = vi.id_venda and op.cod_produto = vi.cod_produto
      )
    returning 1
  )
  select count(*) into v_count_orfao_produto from inserted;

  -- ETAPA 7: Registrar órfãos - LOJAS
  with inserted as (
    insert into dq.log_problema (tipo_problema, tabela_origem, chave_origem, descricao_problema)
    select
        'loja_orfa',
        'stg.venda',
        v.id_venda::text,
        'Loja (cod_empresa) não encontrada em dw.dim_loja'
    from stg.venda v
    left join dw.dim_loja dl on dl.cod_empresa = v.cod_empresa
    where v.cod_empresa is not null
      and dl.id_loja is null
      and not exists (
          select 1 from dq.log_problema lp
          where lp.tipo_problema = 'loja_orfa' and lp.chave_origem = v.id_venda::text
      )
    returning 1
  )
  select count(*) into v_count_orfao_loja from inserted;

  -- ETAPA 8: Popular FATO DE VENDAS POR ITEM
  with inserted as (
    insert into dw.fato_venda_item (
      id_loja, id_cliente, id_produto, id_tempo, id_venda,
      quantidade, valor_bruto, valor_desconto, valor_liquido
    )
    select
      dl.id_loja,
      dc.id_cliente,
      dp.id_produto,
      dt.id_tempo,
      vi.id_venda,
      vi.quantidade,
      coalesce(vi.valor_unitario * vi.quantidade, vi.valor_total) as valor_bruto,
      coalesce(vi.valor_desconto, 0) as valor_desconto,
      coalesce(vi.valor_total, vi.valor_unitario * vi.quantidade, 0) as valor_liquido
    from stg.venda_item vi
    join stg.venda v on v.id_venda = vi.id_venda
    join dw.dim_loja dl on dl.cod_empresa = v.cod_empresa
    join dw.dim_cliente dc on dc.cod_pessoa = v.cod_pessoa
    join dw.dim_produto dp on dp.cod_produto = vi.cod_produto
    join dw.dim_tempo dt on dt.data = date(v.data_emissao)
    left join dw.fato_venda_item f 
      on f.id_venda = vi.id_venda
     and f.id_produto = dp.id_produto
     and f.id_tempo = dt.id_tempo
    where f.id is null
    returning 1
  )
  select count(*) into v_count_fato from inserted;

  -- Retornar resultado
  v_result := jsonb_build_object(
    'dim_tempo', v_count_tempo,
    'dim_loja', v_count_loja,
    'dim_cliente', v_count_cliente,
    'dim_produto', v_count_produto,
    'orfao_cliente', v_count_orfao_cliente,
    'orfao_produto', v_count_orfao_produto,
    'orfao_loja', v_count_orfao_loja,
    'fato_venda_item', v_count_fato
  );

  return v_result;
exception
  when others then
    -- Registrar erro no log
    insert into dq.log_problema (tipo_problema, tabela_origem, chave_origem, descricao_problema)
    values ('erro_transformacao_dw', 'processar_transformacao_dw', now()::text, SQLERRM);
    
    raise;
end;
$$;