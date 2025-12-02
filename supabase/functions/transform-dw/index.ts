import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Iniciando transformação DW (stg → dw)...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const resultados: Record<string, number> = {};

    // 1. Popular dim_loja a partir de empresa
    console.log('1. Populando dim_loja...');
    const { data: empresas } = await supabase
      .from('empresa')
      .select('cod_empresa, nome_fantasia, cidade, uf');

    if (empresas && empresas.length > 0) {
      const lojasRows = empresas.map((e, idx) => ({
        id_loja: e.cod_empresa,
        cod_empresa: e.cod_empresa,
        nome: e.nome_fantasia,
        cidade: e.cidade,
        uf: e.uf,
      }));

      const { error } = await supabase
        .from('dim_loja')
        .upsert(lojasRows, { onConflict: 'id_loja' });

      if (error) {
        console.error('Erro dim_loja:', error);
      } else {
        resultados.dim_loja = lojasRows.length;
        console.log(`dim_loja: ${lojasRows.length} registros`);
      }
    }

    // 2. Popular dim_cliente a partir de pessoa
    console.log('2. Populando dim_cliente...');
    const { data: pessoas } = await supabase
      .from('pessoa')
      .select('cod_pessoa, nome, tipo, cidade, uf, identificador, email, telefone')
      .eq('vendedor', false);

    if (pessoas && pessoas.length > 0) {
      const clientesRows = pessoas.map(p => ({
        id_cliente: p.cod_pessoa,
        cod_pessoa: p.cod_pessoa,
        nome: p.nome,
        tipo: p.tipo,
        cidade: p.cidade,
        uf: p.uf,
        identificador: p.identificador,
        email: p.email,
        telefone: p.telefone,
      }));

      // Grava em lotes
      const batchSize = 500;
      let gravados = 0;
      for (let i = 0; i < clientesRows.length; i += batchSize) {
        const batch = clientesRows.slice(i, i + batchSize);
        const { error } = await supabase
          .from('dim_cliente')
          .upsert(batch, { onConflict: 'id_cliente' });

        if (error) {
          console.error('Erro dim_cliente:', error);
          break;
        }
        gravados += batch.length;
      }
      resultados.dim_cliente = gravados;
      console.log(`dim_cliente: ${gravados} registros`);
    }

    // 3. Popular dim_vendedor a partir de pessoa (vendedor = true)
    console.log('3. Populando dim_vendedor...');
    const { data: vendedores } = await supabase
      .from('pessoa')
      .select('cod_pessoa, nome')
      .eq('vendedor', true);

    if (vendedores && vendedores.length > 0) {
      const vendedoresRows = vendedores.map(v => ({
        id_vendedor: v.cod_pessoa,
        cod_pessoa: v.cod_pessoa,
        nome: v.nome,
      }));

      const { error } = await supabase
        .from('dim_vendedor')
        .upsert(vendedoresRows, { onConflict: 'id_vendedor' });

      if (error) {
        console.error('Erro dim_vendedor:', error);
      } else {
        resultados.dim_vendedor = vendedoresRows.length;
        console.log(`dim_vendedor: ${vendedoresRows.length} registros`);
      }
    }

    // 4. Popular dim_produto a partir de produto
    console.log('4. Populando dim_produto...');
    const { data: produtos } = await supabase
      .from('produto')
      .select('cod_produto, descricao, categoria, referencia, preco_venda, preco_custo');

    if (produtos && produtos.length > 0) {
      const produtosRows = produtos.map(p => ({
        id_produto: p.cod_produto,
        cod_produto: p.cod_produto,
        descricao: p.descricao,
        categoria: p.categoria,
        referencia: p.referencia,
        preco_venda: p.preco_venda,
        preco_custo: p.preco_custo,
      }));

      const batchSize = 500;
      let gravados = 0;
      for (let i = 0; i < produtosRows.length; i += batchSize) {
        const batch = produtosRows.slice(i, i + batchSize);
        const { error } = await supabase
          .from('dim_produto')
          .upsert(batch, { onConflict: 'id_produto' });

        if (error) {
          console.error('Erro dim_produto:', error);
          break;
        }
        gravados += batch.length;
      }
      resultados.dim_produto = gravados;
      console.log(`dim_produto: ${gravados} registros`);
    }

    // 5. Popular dim_tempo a partir das datas das vendas
    console.log('5. Populando dim_tempo...');
    const { data: datasVendas } = await supabase
      .from('venda')
      .select('data_emissao')
      .not('data_emissao', 'is', null);

    if (datasVendas && datasVendas.length > 0) {
      const datasUnicas = new Set<string>();
      for (const v of datasVendas) {
        if (v.data_emissao) {
          const dataStr = v.data_emissao.split('T')[0];
          datasUnicas.add(dataStr);
        }
      }

      const tempoRows = Array.from(datasUnicas).map(dataStr => {
        const data = new Date(dataStr);
        return {
          id_tempo: parseInt(dataStr.replace(/-/g, '')),
          data: dataStr,
          ano: data.getFullYear(),
          mes: data.getMonth() + 1,
          dia: data.getDate(),
          dia_semana: data.getDay(),
          trimestre: Math.ceil((data.getMonth() + 1) / 3),
        };
      });

      const batchSize = 500;
      let gravados = 0;
      for (let i = 0; i < tempoRows.length; i += batchSize) {
        const batch = tempoRows.slice(i, i + batchSize);
        const { error } = await supabase
          .from('dim_tempo')
          .upsert(batch, { onConflict: 'id_tempo' });

        if (error) {
          console.error('Erro dim_tempo:', error);
          break;
        }
        gravados += batch.length;
      }
      resultados.dim_tempo = gravados;
      console.log(`dim_tempo: ${gravados} registros`);
    }

    // 6. Popular fato_venda_item
    console.log('6. Populando fato_venda_item...');
    const { data: vendas } = await supabase
      .from('venda')
      .select('id_venda, data_emissao, cod_pessoa, cod_empresa, cod_vendedor, total')
      .not('data_emissao', 'is', null)
      .not('cod_empresa', 'is', null);

    if (vendas && vendas.length > 0) {
      const fatoRows = vendas.map(v => {
        const dataStr = v.data_emissao?.split('T')[0] || '';
        const idTempo = parseInt(dataStr.replace(/-/g, ''));
        
        return {
          id_venda: v.id_venda,
          id_tempo: idTempo,
          id_loja: v.cod_empresa,
          id_cliente: v.cod_pessoa || -1, // -1 para clientes desconhecidos
          id_vendedor: v.cod_vendedor,
          id_produto: -1, // Sem itens, usamos -1
          seq_item: 1,
          quantidade: 1,
          valor_bruto: v.total,
          valor_desconto: 0,
          valor_liquido: v.total,
        };
      });

      const batchSize = 500;
      let gravados = 0;
      for (let i = 0; i < fatoRows.length; i += batchSize) {
        const batch = fatoRows.slice(i, i + batchSize);
        const { error } = await supabase
          .from('fato_venda_item')
          .upsert(batch, { onConflict: 'id_venda,id_produto' });

        if (error) {
          console.error('Erro fato_venda_item:', error);
          break;
        }
        gravados += batch.length;
      }
      resultados.fato_venda_item = gravados;
      console.log(`fato_venda_item: ${gravados} registros`);
    }

    console.log('Transformação DW concluída!');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Transformação DW concluída com sucesso',
        resultados,
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
