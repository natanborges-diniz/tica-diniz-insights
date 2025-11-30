import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Iniciando transformação DW (stg → dw → dq)...');

    // Cria cliente Supabase com service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const etapas: string[] = [];

    // ====================================================================
    // ETAPA 1: Atualizar DIM TEMPO
    // ====================================================================
    console.log('Etapa 1: Atualizando dim_tempo...');
    const sqlDimTempo = `
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
      left join dw.dim_tempo dt
          on dt.data = src.d
      where dt.id_tempo is null
    `;

    const { error: erroDimTempo } = await supabase.rpc('exec_sql', { sql: sqlDimTempo });
    if (erroDimTempo) {
      console.error('Erro ao atualizar dim_tempo:', erroDimTempo);
      await registrarErro(supabase, 'dim_tempo', erroDimTempo.message);
      throw erroDimTempo;
    }
    etapas.push('dim_tempo');

    // ====================================================================
    // ETAPA 2: Atualizar DIM LOJA
    // ====================================================================
    console.log('Etapa 2: Atualizando dim_loja...');
    const sqlDimLoja = `
      insert into dw.dim_loja (cod_empresa, nome, cidade, uf)
      select
          e.cod_empresa,
          e.nome,
          e.cidade,
          e.uf
      from stg.empresa e
      left join dw.dim_loja dl
          on dl.cod_empresa = e.cod_empresa
      where dl.id_loja is null
    `;

    const { error: erroDimLoja } = await supabase.rpc('exec_sql', { sql: sqlDimLoja });
    if (erroDimLoja) {
      console.error('Erro ao atualizar dim_loja:', erroDimLoja);
      await registrarErro(supabase, 'dim_loja', erroDimLoja.message);
      throw erroDimLoja;
    }
    etapas.push('dim_loja');

    // ====================================================================
    // ETAPA 3: Atualizar DIM CLIENTE
    // ====================================================================
    console.log('Etapa 3: Atualizando dim_cliente...');
    const sqlDimCliente = `
      insert into dw.dim_cliente (cod_pessoa, nome, identificador, cidade, uf)
      select
          p.cod_pessoa,
          p.nome,
          p.identificador,
          p.cidade,
          p.uf
      from stg.pessoa p
      left join dw.dim_cliente dc
          on dc.cod_pessoa = p.cod_pessoa
      where dc.id_cliente is null
    `;

    const { error: erroDimCliente } = await supabase.rpc('exec_sql', { sql: sqlDimCliente });
    if (erroDimCliente) {
      console.error('Erro ao atualizar dim_cliente:', erroDimCliente);
      await registrarErro(supabase, 'dim_cliente', erroDimCliente.message);
      throw erroDimCliente;
    }
    etapas.push('dim_cliente');

    // ====================================================================
    // ETAPA 4: Atualizar DIM PRODUTO
    // ====================================================================
    console.log('Etapa 4: Atualizando dim_produto...');
    const sqlDimProduto = `
      insert into dw.dim_produto (cod_produto, descricao, referencia, categoria)
      select
          pr.cod_produto,
          pr.descricao,
          pr.referencia,
          pr.categoria
      from stg.produto pr
      left join dw.dim_produto dp
          on dp.cod_produto = pr.cod_produto
      where dp.id_produto is null
    `;

    const { error: erroDimProduto } = await supabase.rpc('exec_sql', { sql: sqlDimProduto });
    if (erroDimProduto) {
      console.error('Erro ao atualizar dim_produto:', erroDimProduto);
      await registrarErro(supabase, 'dim_produto', erroDimProduto.message);
      throw erroDimProduto;
    }
    etapas.push('dim_produto');

    // ====================================================================
    // ETAPA 5: Registrar órfãos - CLIENTES
    // ====================================================================
    console.log('Etapa 5: Registrando clientes órfãos...');
    const sqlOrfaosCliente = `
      insert into dq.orfao_cliente (id_venda, cod_pessoa, detalhe)
      select distinct
          v.id_venda,
          v.cod_pessoa,
          'Cliente não encontrado em dw.dim_cliente'
      from stg.venda v
      left join dw.dim_cliente dc
          on dc.cod_pessoa = v.cod_pessoa
      where v.cod_pessoa is not null
        and dc.id_cliente is null
        and not exists (
            select 1
            from dq.orfao_cliente oc
            where oc.id_venda = v.id_venda
              and oc.cod_pessoa = v.cod_pessoa
        )
    `;

    const { error: erroOrfaosCliente } = await supabase.rpc('exec_sql', { sql: sqlOrfaosCliente });
    if (erroOrfaosCliente) {
      console.error('Erro ao registrar órfãos de cliente:', erroOrfaosCliente);
      await registrarErro(supabase, 'orfao_cliente', erroOrfaosCliente.message);
      throw erroOrfaosCliente;
    }
    etapas.push('orfao_cliente');

    // ====================================================================
    // ETAPA 6: Registrar órfãos - PRODUTOS
    // ====================================================================
    console.log('Etapa 6: Registrando produtos órfãos...');
    const sqlOrfaosProduto = `
      insert into dq.orfao_produto (id_venda, cod_produto, detalhe)
      select distinct
          vi.id_venda,
          vi.cod_produto,
          'Produto não encontrado em dw.dim_produto'
      from stg.venda_item vi
      left join dw.dim_produto dp
          on dp.cod_produto = vi.cod_produto
      where vi.cod_produto is not null
        and dp.id_produto is null
        and not exists (
            select 1
            from dq.orfao_produto op
            where op.id_venda = vi.id_venda
              and op.cod_produto = vi.cod_produto
        )
    `;

    const { error: erroOrfaosProduto } = await supabase.rpc('exec_sql', { sql: sqlOrfaosProduto });
    if (erroOrfaosProduto) {
      console.error('Erro ao registrar órfãos de produto:', erroOrfaosProduto);
      await registrarErro(supabase, 'orfao_produto', erroOrfaosProduto.message);
      throw erroOrfaosProduto;
    }
    etapas.push('orfao_produto');

    // ====================================================================
    // ETAPA 7: Registrar órfãos - LOJAS
    // ====================================================================
    console.log('Etapa 7: Registrando lojas órfãs...');
    const sqlOrfaosLoja = `
      insert into dq.log_problema (tipo_problema, tabela_origem, chave_origem, descricao_problema)
      select
          'loja_orfa',
          'stg.venda',
          v.id_venda::text,
          'Loja (cod_empresa) não encontrada em dw.dim_loja'
      from stg.venda v
      left join dw.dim_loja dl
          on dl.cod_empresa = v.cod_empresa
      where v.cod_empresa is not null
        and dl.id_loja is null
        and not exists (
            select 1
            from dq.log_problema lp
            where lp.tipo_problema = 'loja_orfa'
              and lp.chave_origem = v.id_venda::text
        )
    `;

    const { error: erroOrfaosLoja } = await supabase.rpc('exec_sql', { sql: sqlOrfaosLoja });
    if (erroOrfaosLoja) {
      console.error('Erro ao registrar órfãos de loja:', erroOrfaosLoja);
      await registrarErro(supabase, 'orfao_loja', erroOrfaosLoja.message);
      throw erroOrfaosLoja;
    }
    etapas.push('orfao_loja');

    // ====================================================================
    // ETAPA 8: Popular FATO DE VENDAS POR ITEM
    // ====================================================================
    console.log('Etapa 8: Populando fato_venda_item...');
    const sqlFatoVendaItem = `
      insert into dw.fato_venda_item (
        id_loja,
        id_cliente,
        id_produto,
        id_tempo,
        id_venda,
        quantidade,
        valor_bruto,
        valor_desconto,
        valor_liquido
      )
      select
        dl.id_loja,
        dc.id_cliente,
        dp.id_produto,
        dt.id_tempo,
        vi.id_venda,
        vi.quantidade,
        coalesce(vi.valor_unitario * vi.quantidade, vi.valor_total)          as valor_bruto,
        coalesce(vi.valor_desconto, 0)                                       as valor_desconto,
        coalesce(vi.valor_total, vi.valor_unitario * vi.quantidade, 0)       as valor_liquido
      from stg.venda_item vi
      join stg.venda v
        on v.id_venda = vi.id_venda
      join dw.dim_loja dl
        on dl.cod_empresa = v.cod_empresa
      join dw.dim_cliente dc
        on dc.cod_pessoa = v.cod_pessoa
      join dw.dim_produto dp
        on dp.cod_produto = vi.cod_produto
      join dw.dim_tempo dt
        on dt.data = date(v.data_emissao)
      left join dw.fato_venda_item f
        on f.id_venda = vi.id_venda
       and f.id_produto = dp.id_produto
       and f.id_tempo = dt.id_tempo
      where f.id is null
    `;

    const { error: erroFatoVendaItem } = await supabase.rpc('exec_sql', { sql: sqlFatoVendaItem });
    if (erroFatoVendaItem) {
      console.error('Erro ao popular fato_venda_item:', erroFatoVendaItem);
      await registrarErro(supabase, 'fato_venda_item', erroFatoVendaItem.message);
      throw erroFatoVendaItem;
    }
    etapas.push('fato_venda_item');

    console.log('Transformação DW concluída com sucesso!');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Transformação DW concluída com sucesso',
        etapas_concluidas: etapas,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Erro na transformação DW:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

/**
 * Registra erro no log de problemas de qualidade
 */
async function registrarErro(supabase: any, etapa: string, mensagem: string) {
  try {
    await supabase
      .from('log_problema')
      .insert({
        tipo_problema: 'erro_transformacao_dw',
        tabela_origem: etapa,
        chave_origem: new Date().toISOString(),
        descricao_problema: mensagem,
      });
  } catch (err) {
    console.error('Erro ao registrar problema no log:', err);
  }
}
