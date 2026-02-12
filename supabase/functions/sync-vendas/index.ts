// supabase/functions/sync-vendas/index.ts
// E0.3: JWT obrigatório + role admin

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { firebirdGet } from '../_shared/firebirdApi.ts';
import { authGuard, corsHeaders } from '../_shared/authGuard.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // E0.3: Auth guard — admin only
    await authGuard(req, { requiredRole: "admin" });

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

    console.log(`Iniciando sync de vendas (max ${maxPaginas} páginas, debug: ${debugMode})...`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const hoje = new Date();
    const dataFim = dataFimParam || hoje.toISOString().slice(0, 10);

    const { data: controleData } = await supabase
      .from('etl_controle').select('ultima_data').eq('entidade', 'vendas').maybeSingle();

    let dataInicio: string;
    if (dataInicioParam) {
      dataInicio = dataInicioParam;
    } else if (!controleData?.ultima_data) {
      const umAnoAtras = new Date(hoje.getTime() - 365 * 24 * 60 * 60 * 1000);
      dataInicio = umAnoAtras.toISOString().slice(0, 10);
    } else {
      const ultimaData = new Date(controleData.ultima_data);
      const dataSeguranca = new Date(ultimaData.getTime() - 1 * 24 * 60 * 60 * 1000);
      dataInicio = dataSeguranca.toISOString().slice(0, 10);
    }

    let paginaInicial = 1;
    if (!resetProgresso && !debugMode) {
      const { data: paginaControle } = await supabase
        .from('etl_controle').select('pagina_atual').eq('entidade', 'vendas').maybeSingle();
      if (paginaControle?.pagina_atual && paginaControle.pagina_atual > 1) {
        paginaInicial = paginaControle.pagina_atual;
      }
    }

    const { data: lojas } = await supabase.from('empresa').select('cod_empresa, nome_fantasia');
    const lojaMap = new Map<string, number>();
    for (const loja of lojas || []) {
      if (loja.nome_fantasia) lojaMap.set(loja.nome_fantasia.toUpperCase().trim(), loja.cod_empresa);
    }

    const { data: pessoas } = await supabase.from('pessoa').select('cod_pessoa, nome');
    const pessoaMap = new Map<string, number>();
    for (const pessoa of pessoas || []) {
      if (pessoa.nome) pessoaMap.set(pessoa.nome.toUpperCase().trim(), pessoa.cod_pessoa);
    }

    let allVendas: any[] = [];
    let pagina = paginaInicial;
    let paginasProcessadas = 0;
    let hasMore = true;

    while (hasMore && paginasProcessadas < maxPaginas) {
      const json = await firebirdGet('/api/v1/vendas', { dataInicio, dataFim, limite: limiteRegistros, pagina });
      const vendas = json.vendas ?? json.data ?? json;
      if (!Array.isArray(vendas)) throw new Error('Resposta não é um array');
      if (vendas.length > 0) allVendas = allVendas.concat(vendas);
      hasMore = vendas.length === limiteRegistros;
      pagina++; paginasProcessadas++;
    }

    if (debugMode) {
      const camposEncontrados: Record<string, any> = {};
      if (allVendas.length > 0) {
        const v = allVendas[0];
        camposEncontrados.chaves_venda = Object.keys(v);
        camposEncontrados.amostra_venda = v;
      }
      return new Response(JSON.stringify({
        success: true, mode: 'DEBUG', periodo: { dataInicio, dataFim },
        totalVendasAnalisadas: allVendas.length, estrutura: camposEncontrados,
      }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    const vendasRows = allVendas.map((v: any) => {
      const codTransacao = v.codTransacao ?? v.cod_transacao ?? v.id ?? v.numero;
      const lojaName = v.loja?.toUpperCase().trim();
      const codEmpresa = lojaName ? lojaMap.get(lojaName) : null;
      const clienteName = v.cliente?.toUpperCase().trim();
      const codPessoa = clienteName ? pessoaMap.get(clienteName) : null;
      const vendedorName = v.vendedor?.toUpperCase().trim();
      const codVendedor = vendedorName ? pessoaMap.get(vendedorName) : null;
      return {
        id_venda: codTransacao,
        numero: v.numeroTransacao ?? v.numero_transacao ?? String(codTransacao),
        data_emissao: v.dataEmissao ?? v.data_emissao ?? null,
        data_lancamento: v.dataEncerramento ?? v.data_encerramento ?? null,
        cod_pessoa: codPessoa, cod_empresa: codEmpresa,
        status: v.naturezaOperacao ?? v.natureza_operacao ?? v.status ?? null,
        total: v.total ?? v.valorTotal ?? null,
        cod_vendedor: codVendedor,
        cliente_nome: v.cliente ?? null, loja_nome: v.loja ?? null, vendedor_nome: v.vendedor ?? null,
      };
    });

    if (vendasRows.length > 0) {
      const batchSize = 200;
      for (let i = 0; i < vendasRows.length; i += batchSize) {
        const { error } = await supabase.from('venda').upsert(vendasRows.slice(i, i + batchSize), { onConflict: 'id_venda' });
        if (error) throw error;
      }
    }

    const proximaPagina = hasMore ? pagina : 1;
    await supabase.from('etl_controle').upsert({
      entidade: 'vendas', ultima_data: !hasMore ? dataFim : null,
      pagina_atual: proximaPagina, atualizado_em: new Date().toISOString(),
    }, { onConflict: 'entidade' });

    const concluido = !hasMore;
    return new Response(JSON.stringify({
      success: true, totalGravados: vendasRows.length, concluido,
      paginaInicial, paginaFinal: pagina - 1, paginasProcessadas,
      proximaPagina: hasMore ? pagina : null,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Erro no sync de vendas:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
    });
  }
});
