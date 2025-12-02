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
    const urlParams = new URL(req.url);
    let maxPaginas = parseInt(urlParams.searchParams.get('maxPaginas') || '5');
    let limiteRegistros = parseInt(urlParams.searchParams.get('limite') || '100');
    let debugMode = urlParams.searchParams.get('debug') === 'true';

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        maxPaginas = body.maxPaginas ?? maxPaginas;
        limiteRegistros = body.limite ?? limiteRegistros;
        debugMode = body.debug ?? debugMode;
      } catch {}
    }

    console.log(`Iniciando sync de empresas (max ${maxPaginas} páginas, ${limiteRegistros} por página, debug: ${debugMode})...`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar progresso de página
    const { data: paginaControle } = await supabase
      .from('etl_controle')
      .select('pagina_atual')
      .eq('entidade', 'empresas')
      .maybeSingle();

    let paginaInicial = paginaControle?.pagina_atual || 1;
    console.log(`Iniciando da página ${paginaInicial}`);

    let allEmpresas: any[] = [];
    let pagina = paginaInicial;
    let paginasProcessadas = 0;
    let hasMore = true;

    while (hasMore && paginasProcessadas < maxPaginas) {
      console.log(`Buscando página ${pagina} de empresas...`);
      
      const json = await firebirdGet('/api/v1/empresas', {
        limite: limiteRegistros,
        pagina,
      });

      if (debugMode && paginasProcessadas === 0) {
        console.log('=== DEBUG: ESTRUTURA RAW DO JSON ===');
        console.log('Chaves do objeto:', Object.keys(json));
        console.log('JSON (primeiros 2000 chars):', JSON.stringify(json).slice(0, 2000));
      }

      const empresas = json.empresas ?? json.data ?? json;

      if (!Array.isArray(empresas)) {
        console.log('Formato inesperado ou endpoint não existe:', JSON.stringify(json).slice(0, 500));
        // Se não é array, tenta extrair empresas de outra forma ou encerra
        break;
      }

      console.log(`Página ${pagina}: ${empresas.length} empresas`);
      
      if (empresas.length > 0) {
        allEmpresas = allEmpresas.concat(empresas);
      }

      hasMore = empresas.length === limiteRegistros;
      pagina++;
      paginasProcessadas++;
    }

    console.log(`Total recebido: ${allEmpresas.length} empresas em ${paginasProcessadas} páginas`);

    // Em modo debug, retorna apenas a análise
    if (debugMode) {
      return new Response(
        JSON.stringify({
          success: true,
          mode: 'DEBUG',
          message: 'Análise de estrutura - nenhum dado foi gravado',
          totalEmpresasAnalisadas: allEmpresas.length,
          amostra: allEmpresas.length > 0 ? allEmpresas[0] : null,
          chaves: allEmpresas.length > 0 ? Object.keys(allEmpresas[0]) : [],
        }, null, 2),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Processa e grava
    const empresasRows: any[] = [];

    for (const e of allEmpresas) {
      const codEmpresa = e.codEmpresa ?? e.cod_empresa ?? e.id;
      
      empresasRows.push({
        cod_empresa: codEmpresa,
        razao_social: e.razaoSocial ?? e.razao_social ?? null,
        nome_fantasia: e.nomeFantasia ?? e.nome_fantasia ?? e.nome ?? null,
        cnpj: e.cnpj ?? e.documento ?? null,
        cidade: e.cidade ?? e.municipio ?? null,
        uf: e.uf ?? e.estado ?? null,
      });
    }

    console.log(`Gravando ${empresasRows.length} empresas...`);

    if (empresasRows.length > 0) {
      const { error } = await supabase
        .from('empresa')
        .upsert(empresasRows, { onConflict: 'cod_empresa' });

      if (error) {
        console.error('Erro no upsert empresas:', error);
        throw error;
      }
    }

    // Salva progresso
    const proximaPagina = hasMore ? pagina : 1;
    await supabase
      .from('etl_controle')
      .upsert({
        entidade: 'empresas',
        pagina_atual: proximaPagina,
        atualizado_em: new Date().toISOString(),
      }, { onConflict: 'entidade' });

    const concluido = !hasMore;
    console.log(`Sync de empresas ${concluido ? 'COMPLETO' : 'parcial'}.`);

    return new Response(
      JSON.stringify({
        success: true,
        message: concluido 
          ? `Sincronização completa: ${empresasRows.length} empresas` 
          : `Chunk processado: ${empresasRows.length} empresas`,
        totalEmpresas: empresasRows.length,
        totalGravados: empresasRows.length,
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
    console.error('Erro no sync de empresas:', error);
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
