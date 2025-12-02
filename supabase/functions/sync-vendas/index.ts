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
    // Parâmetros configuráveis
    const urlParams = new URL(req.url);
    let maxPaginas = parseInt(urlParams.searchParams.get('maxPaginas') || '20');
    let limiteRegistros = parseInt(urlParams.searchParams.get('limite') || '200');
    let resetProgresso = urlParams.searchParams.get('reset') === 'true';
    let dataInicioParam = urlParams.searchParams.get('dataInicio');
    let dataFimParam = urlParams.searchParams.get('dataFim');

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        maxPaginas = body.maxPaginas ?? maxPaginas;
        limiteRegistros = body.limite ?? limiteRegistros;
        resetProgresso = body.reset ?? resetProgresso;
        dataInicioParam = body.dataInicio ?? dataInicioParam;
        dataFimParam = body.dataFim ?? dataFimParam;
      } catch {}
    }

    console.log(`Iniciando sync de vendas (max ${maxPaginas} páginas, ${limiteRegistros} por página)...`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Determina período de sincronização
    const hoje = new Date();
    const dataFim = dataFimParam || hoje.toISOString().slice(0, 10);

    // Buscar última data sincronizada
    const { data: controleData } = await supabase
      .from('etl_controle')
      .select('ultima_data')
      .eq('entidade', 'vendas')
      .maybeSingle();

    let dataInicio: string;
    if (dataInicioParam) {
      dataInicio = dataInicioParam;
    } else if (!controleData?.ultima_data) {
      // Primeira execução: últimos 30 dias (mais seguro)
      const trintaDiasAtras = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000);
      dataInicio = trintaDiasAtras.toISOString().slice(0, 10);
      console.log('Primeira sincronização. Buscando últimos 30 dias.');
    } else {
      // Incremental: desde última data (1 dia de segurança)
      const ultimaData = new Date(controleData.ultima_data);
      const dataSeguranca = new Date(ultimaData.getTime() - 1 * 24 * 60 * 60 * 1000);
      dataInicio = dataSeguranca.toISOString().slice(0, 10);
      console.log(`Sincronização incremental desde ${controleData.ultima_data}`);
    }

    // Buscar progresso de página
    const { data: paginaControle } = await supabase
      .from('etl_controle')
      .select('pagina_atual')
      .eq('entidade', 'vendas')
      .maybeSingle();

    let paginaInicial = 1;
    if (!resetProgresso && paginaControle?.pagina_atual && paginaControle.pagina_atual > 1) {
      paginaInicial = paginaControle.pagina_atual;
      console.log(`Retomando da página ${paginaInicial}`);
    }

    console.log(`Período: ${dataInicio} até ${dataFim}`);

    let allVendas: any[] = [];
    let pagina = paginaInicial;
    let paginasProcessadas = 0;
    let hasMore = true;

    while (hasMore && paginasProcessadas < maxPaginas) {
      console.log(`Buscando página ${pagina} de vendas...`);
      
      const json = await firebirdGet('/api/v1/vendas', {
        dataInicio,
        dataFim,
        limite: limiteRegistros,
        pagina,
      });

      const vendas = json.data ?? json.vendas ?? json;

      if (!Array.isArray(vendas)) {
        console.error('Formato inesperado:', json);
        throw new Error('Resposta não é um array');
      }

      console.log(`Página ${pagina}: ${vendas.length} vendas`);
      
      if (vendas.length > 0) {
        allVendas = allVendas.concat(vendas);
      }

      hasMore = vendas.length === limiteRegistros;
      pagina++;
      paginasProcessadas++;
    }

    console.log(`Total recebido: ${allVendas.length} vendas em ${paginasProcessadas} páginas`);

    const vendasRows: any[] = [];
    const itensRows: any[] = [];

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

    // Grava vendas em lotes menores
    if (vendasRows.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < vendasRows.length; i += batchSize) {
        const batch = vendasRows.slice(i, i + batchSize);
        console.log(`Gravando lote de vendas ${Math.floor(i / batchSize) + 1}/${Math.ceil(vendasRows.length / batchSize)}...`);
        
        const { error } = await supabase
          .from('venda')
          .upsert(batch, { onConflict: 'id_venda' });

        if (error) {
          console.error('Erro no upsert vendas:', error);
          throw error;
        }
      }
    }

    // Grava itens em lotes menores
    if (itensRows.length > 0) {
      const batchSize = 200;
      for (let i = 0; i < itensRows.length; i += batchSize) {
        const batch = itensRows.slice(i, i + batchSize);
        console.log(`Gravando lote de itens ${Math.floor(i / batchSize) + 1}/${Math.ceil(itensRows.length / batchSize)}...`);
        
        const { error } = await supabase
          .from('venda_item')
          .upsert(batch, { onConflict: 'id_venda,seq_item' });

        if (error) {
          console.error('Erro no upsert itens:', error);
          throw error;
        }
      }
    }

    // Salva progresso de página
    const proximaPagina = hasMore ? pagina : 1;
    await supabase
      .from('etl_controle')
      .upsert({
        entidade: 'vendas',
        ultima_data: !hasMore ? dataFim : null,
        pagina_atual: proximaPagina,
        atualizado_em: new Date().toISOString(),
      }, { onConflict: 'entidade' });

    const concluido = !hasMore;
    console.log(`Sync de vendas ${concluido ? 'COMPLETO' : 'parcial'}.`);

    return new Response(
      JSON.stringify({
        success: true,
        message: concluido 
          ? `Sincronização completa: ${vendasRows.length} vendas, ${itensRows.length} itens` 
          : `Chunk processado: ${vendasRows.length} vendas, ${itensRows.length} itens`,
        periodo: { dataInicio, dataFim },
        totalVendas: vendasRows.length,
        totalItens: itensRows.length,
        paginaInicial,
        paginaFinal: pagina - 1,
        paginasProcessadas,
        proximaPagina: hasMore ? pagina : null,
        concluido,
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
