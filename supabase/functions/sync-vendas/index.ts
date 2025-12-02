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
    let maxPaginas = parseInt(urlParams.searchParams.get('maxPaginas') || '5');
    let limiteRegistros = parseInt(urlParams.searchParams.get('limite') || '500');
    let resetProgresso = urlParams.searchParams.get('reset') === 'true';
    let dataInicioParam = urlParams.searchParams.get('dataInicio');
    let dataFimParam = urlParams.searchParams.get('dataFim');
    let debugMode = urlParams.searchParams.get('debug') === 'true';
    let buscarItens = urlParams.searchParams.get('buscarItens') !== 'false';

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        maxPaginas = body.maxPaginas ?? maxPaginas;
        limiteRegistros = body.limite ?? limiteRegistros;
        resetProgresso = body.reset ?? resetProgresso;
        dataInicioParam = body.dataInicio ?? dataInicioParam;
        dataFimParam = body.dataFim ?? dataFimParam;
        debugMode = body.debug ?? debugMode;
        buscarItens = body.buscarItens ?? buscarItens;
      } catch {}
    }

    console.log(`Iniciando sync de vendas (max ${maxPaginas} páginas, ${limiteRegistros} por página, debug: ${debugMode}, buscarItens: ${buscarItens})...`);

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
      // Primeira execução: últimos 365 dias para capturar histórico
      const umAnoAtras = new Date(hoje.getTime() - 365 * 24 * 60 * 60 * 1000);
      dataInicio = umAnoAtras.toISOString().slice(0, 10);
      console.log('Primeira sincronização. Buscando últimos 365 dias.');
    } else {
      // Incremental: desde última data (1 dia de segurança)
      const ultimaData = new Date(controleData.ultima_data);
      const dataSeguranca = new Date(ultimaData.getTime() - 1 * 24 * 60 * 60 * 1000);
      dataInicio = dataSeguranca.toISOString().slice(0, 10);
      console.log(`Sincronização incremental desde ${controleData.ultima_data}`);
    }

    // Buscar progresso de página (não usado em debug mode)
    let paginaInicial = 1;
    if (!resetProgresso && !debugMode) {
      const { data: paginaControle } = await supabase
        .from('etl_controle')
        .select('pagina_atual')
        .eq('entidade', 'vendas')
        .maybeSingle();

      if (paginaControle?.pagina_atual && paginaControle.pagina_atual > 1) {
        paginaInicial = paginaControle.pagina_atual;
        console.log(`Retomando da página ${paginaInicial}`);
      }
    }

    console.log(`Período: ${dataInicio} até ${dataFim}`);

    // Carregar mapeamentos de lojas por nome (para fazer join)
    const { data: lojas } = await supabase
      .from('empresa')
      .select('cod_empresa, nome_fantasia');
    
    const lojaMap = new Map<string, number>();
    for (const loja of lojas || []) {
      if (loja.nome_fantasia) lojaMap.set(loja.nome_fantasia.toUpperCase().trim(), loja.cod_empresa);
    }
    console.log(`Carregadas ${lojaMap.size} lojas para mapeamento`);

    const { data: pessoas } = await supabase
      .from('pessoa')
      .select('cod_pessoa, nome');
    
    const pessoaMap = new Map<string, number>();
    for (const pessoa of pessoas || []) {
      if (pessoa.nome) pessoaMap.set(pessoa.nome.toUpperCase().trim(), pessoa.cod_pessoa);
    }
    console.log(`Carregadas ${pessoaMap.size} pessoas para mapeamento`);

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

      if (debugMode && paginasProcessadas === 0) {
        console.log('=== DEBUG: ESTRUTURA RAW DO JSON ===');
        console.log('Chaves do objeto:', Object.keys(json));
        console.log('JSON (primeiros 2000 chars):', JSON.stringify(json).slice(0, 2000));
      }

      const vendas = json.vendas ?? json.data ?? json;

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

    // Em modo debug, retorna apenas a análise sem gravar
    if (debugMode) {
      const camposEncontrados: Record<string, any> = {};
      
      if (allVendas.length > 0) {
        const v = allVendas[0];
        camposEncontrados.chaves_venda = Object.keys(v);
        camposEncontrados.amostra_venda = v;
        camposEncontrados.mapeamento = {
          loja_encontrada: v.loja ? lojaMap.get(v.loja.toUpperCase().trim()) : null,
          cliente_encontrado: v.cliente ? pessoaMap.get(v.cliente.toUpperCase().trim()) : null,
          vendedor_encontrado: v.vendedor ? pessoaMap.get(v.vendedor.toUpperCase().trim()) : null,
        };
      }

      return new Response(
        JSON.stringify({
          success: true,
          mode: 'DEBUG',
          message: 'Análise de estrutura - nenhum dado foi gravado',
          periodo: { dataInicio, dataFim },
          totalVendasAnalisadas: allVendas.length,
          lojasCarregadas: lojaMap.size,
          pessoasCarregadas: pessoaMap.size,
          estrutura: camposEncontrados,
        }, null, 2),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Modo normal: processa e grava
    const vendasRows: any[] = [];
    let vendasSemCliente = 0;
    let vendasSemLoja = 0;
    let vendasSemVendedor = 0;

    for (const v of allVendas) {
      const codTransacao = v.codTransacao ?? v.cod_transacao ?? v.id ?? v.numero;
      
      // Mapeia loja pelo nome
      const lojaName = v.loja?.toUpperCase().trim();
      const codEmpresa = lojaName ? lojaMap.get(lojaName) : null;
      if (!codEmpresa && lojaName) vendasSemLoja++;

      // Mapeia cliente pelo nome
      const clienteName = v.cliente?.toUpperCase().trim();
      const codPessoa = clienteName ? pessoaMap.get(clienteName) : null;
      if (!codPessoa && clienteName && clienteName !== 'CONSUMIDOR') vendasSemCliente++;

      // Mapeia vendedor pelo nome
      const vendedorName = v.vendedor?.toUpperCase().trim();
      const codVendedor = vendedorName ? pessoaMap.get(vendedorName) : null;
      if (!codVendedor && vendedorName && vendedorName !== 'VENDEDOR LOJA') vendasSemVendedor++;

      vendasRows.push({
        id_venda: codTransacao,
        numero: v.numeroTransacao ?? v.numero_transacao ?? String(codTransacao),
        data_emissao: v.dataEmissao ?? v.data_emissao ?? null,
        data_lancamento: v.dataEncerramento ?? v.data_encerramento ?? null,
        cod_pessoa: codPessoa,
        cod_empresa: codEmpresa,
        status: v.naturezaOperacao ?? v.natureza_operacao ?? v.status ?? null,
        total: v.total ?? v.valorTotal ?? null,
        cod_vendedor: codVendedor,
        // Armazena nomes originais para referência
        cliente_nome: v.cliente ?? null,
        loja_nome: v.loja ?? null,
        vendedor_nome: v.vendedor ?? null,
      });
    }

    console.log(`Mapeamento: ${vendasSemLoja} vendas sem loja, ${vendasSemCliente} sem cliente, ${vendasSemVendedor} sem vendedor`);
    console.log(`Gravando ${vendasRows.length} vendas...`);

    // Grava vendas em lotes
    if (vendasRows.length > 0) {
      const batchSize = 200;
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

    // Buscar itens separadamente para cada venda (se solicitado e se houver endpoint)
    let totalItens = 0;
    if (buscarItens && vendasRows.length > 0) {
      console.log('Tentando buscar itens das vendas...');
      
      // Tenta endpoint de itens por venda
      for (let i = 0; i < Math.min(vendasRows.length, 5); i++) {
        const venda = vendasRows[i];
        try {
          // Tenta /api/v1/vendas/{id}/itens
          const itensJson = await firebirdGet(`/api/v1/vendas/${venda.id_venda}/itens`, {});
          console.log(`Itens da venda ${venda.id_venda}:`, JSON.stringify(itensJson).slice(0, 500));
          
          const itens = itensJson.itens ?? itensJson.items ?? itensJson.data ?? itensJson;
          if (Array.isArray(itens)) {
            totalItens += itens.length;
          }
        } catch (e) {
          console.log(`Endpoint de itens não disponível: ${e}`);
          break; // Se falhar, não tenta mais
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
          ? `Sincronização completa: ${vendasRows.length} vendas` 
          : `Chunk processado: ${vendasRows.length} vendas`,
        periodo: { dataInicio, dataFim },
        totalVendas: vendasRows.length,
        totalItens,
        totalGravados: vendasRows.length,
        mapeamento: {
          vendasSemLoja,
          vendasSemCliente,
          vendasSemVendedor,
        },
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
