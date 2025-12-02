import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { firebirdGet } from '../_shared/firebirdApi.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Iniciando sync de vendas...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Sistema de sincronização incremental via stg.etl_controle
    const hoje = new Date();
    const dataFim = hoje.toISOString().slice(0, 10); // YYYY-MM-DD

    // Buscar última data sincronizada
    const { data: controle, error: controleError } = await supabase
      .from('etl_controle')
      .select('ultima_data')
      .eq('entidade', 'vendas')
      .maybeSingle();

    let dataInicio: string;

    if (controleError || !controle) {
      // Primeira execução: buscar últimos 365 dias
      const umAnoAtras = new Date(hoje.getTime() - 365 * 24 * 60 * 60 * 1000);
      dataInicio = umAnoAtras.toISOString().slice(0, 10);
      console.log('Primeira sincronização de vendas. Buscando últimos 365 dias.');
    } else {
      // Sincronização incremental: desde última data (1 dia de segurança)
      const ultimaData = new Date(controle.ultima_data);
      const dataSeguranca = new Date(ultimaData.getTime() - 1 * 24 * 60 * 60 * 1000);
      dataInicio = dataSeguranca.toISOString().slice(0, 10);
      console.log(`Sincronização incremental desde ${controle.ultima_data}`);
    }

    console.log(`Sincronizando vendas de ${dataInicio} até ${dataFim}`);

    // Busca vendas da API Firebird v1 com paginação
    let allVendas: any[] = [];
    let pagina = 1;
    const limite = 500;
    let hasMore = true;

    while (hasMore) {
      console.log(`Buscando página ${pagina} de vendas...`);
      
      const json = await firebirdGet('/api/v1/vendas', {
        dataInicio,
        dataFim,
        limite,
        pagina,
      });

      const vendas = json.data ?? json.vendas ?? json;

      if (!Array.isArray(vendas)) {
        console.error('Formato inesperado de resposta de vendas:', json);
        throw new Error('Resposta de vendas não é um array');
      }

      console.log(`Página ${pagina}: ${vendas.length} vendas`);
      allVendas = allVendas.concat(vendas);

      hasMore = vendas.length === limite;
      pagina++;

      // Limite de segurança
      if (pagina > 200) {
        console.log('Limite de páginas atingido (200)');
        break;
      }
    }

    console.log(`Total recebido: ${allVendas.length} vendas da API`);

    const vendasRows: any[] = [];
    const itensRows: any[] = [];

    // Processa cada venda e seus itens (conforme novo guia API v1)
    for (const v of allVendas) {
      const codTransacao = v.cod_transacao ?? v.codTransacao ?? v.id ?? v.numero;

      vendasRows.push({
        id_venda: codTransacao,
        numero: v.numero_transacao ?? v.numeroTransacao ?? String(codTransacao),
        data_emissao: v.data_emissao ?? v.dataEmissao ?? null,
        data_lancamento: v.data_encerramento ?? v.dataEncerramento ?? null,
        cod_pessoa: v.cliente?.cod_pessoa ?? v.cliente?.codPessoa ?? v.codCliente ?? null,
        cod_empresa: v.loja?.cod_empresa ?? v.loja?.codEmpresa ?? v.codEmpresa ?? null,
        status: v.natureza_operacao ?? v.naturezaOperacao ?? v.status ?? null,
        total: v.total ?? v.valorTotal ?? null,
        cod_vendedor: v.vendedor?.cod_pessoa ?? v.vendedor?.codPessoa ?? null,
      });

      // Processa itens da venda
      const itens = v.itens ?? v.items ?? [];
      if (Array.isArray(itens)) {
        for (const it of itens) {
          itensRows.push({
            id_venda: codTransacao,
            seq_item: it.seq_item ?? it.seqItem ?? it.sequencia ?? 1,
            cod_produto: it.produto?.cod_produto ?? it.produto?.codProduto ?? it.codProduto ?? null,
            quantidade: it.quantidade ?? 1,
            valor_unitario: it.valor_unitario ?? it.valorUnitario ?? null,
            valor_desconto: it.valor_desconto ?? it.valorDesconto ?? 0,
            valor_total: it.valor_total ?? it.valorTotal ?? null,
          });
        }
      }
    }

    console.log(`Gravando ${vendasRows.length} vendas e ${itensRows.length} itens...`);

    // Grava vendas em lotes
    if (vendasRows.length > 0) {
      const batchSize = 500;
      for (let i = 0; i < vendasRows.length; i += batchSize) {
        const batch = vendasRows.slice(i, i + batchSize);
        console.log(`Gravando lote de vendas ${Math.floor(i / batchSize) + 1}/${Math.ceil(vendasRows.length / batchSize)}...`);
        
        const { error } = await supabase
          .from('venda')
          .upsert(batch, { onConflict: 'id_venda' });

        if (error) {
          console.error('Erro ao fazer upsert em stg.venda:', error);
          throw error;
        }
      }
    }

    // Grava itens em lotes
    if (itensRows.length > 0) {
      const batchSize = 500;
      for (let i = 0; i < itensRows.length; i += batchSize) {
        const batch = itensRows.slice(i, i + batchSize);
        console.log(`Gravando lote de itens ${Math.floor(i / batchSize) + 1}/${Math.ceil(itensRows.length / batchSize)}...`);
        
        const { error } = await supabase
          .from('venda_item')
          .upsert(batch, { onConflict: 'id_venda,seq_item' });

        if (error) {
          console.error('Erro ao fazer upsert em stg.venda_item:', error);
          throw error;
        }
      }
    }

    // Atualizar controle de ETL
    const { error: controleUpdateError } = await supabase
      .from('etl_controle')
      .upsert({
        entidade: 'vendas',
        ultima_data: dataFim,
        atualizado_em: new Date().toISOString(),
      }, { onConflict: 'entidade' });

    if (controleUpdateError) {
      console.error('Erro ao atualizar stg.etl_controle:', controleUpdateError);
    }

    console.log('Sync de vendas concluído com sucesso.');

    return new Response(
      JSON.stringify({
        success: true,
        message: `Sincronização concluída com sucesso`,
        periodo: { dataInicio, dataFim },
        totalVendas: vendasRows.length,
        totalItens: itensRows.length,
        paginas: pagina - 1,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Erro no sync de vendas:', error);
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
