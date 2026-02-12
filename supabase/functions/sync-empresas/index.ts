// supabase/functions/sync-empresas/index.ts
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

    console.log(`Iniciando sync de empresas...`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: paginaControle } = await supabase
      .from('etl_controle').select('pagina_atual').eq('entidade', 'empresas').maybeSingle();

    let paginaInicial = paginaControle?.pagina_atual || 1;
    let allEmpresas: any[] = [];
    let pagina = paginaInicial;
    let paginasProcessadas = 0;
    let hasMore = true;

    while (hasMore && paginasProcessadas < maxPaginas) {
      const json = await firebirdGet('/api/v1/empresas', { limite: limiteRegistros, pagina });
      const empresas = json.empresas ?? json.data ?? json;
      if (!Array.isArray(empresas)) break;
      if (empresas.length > 0) allEmpresas = allEmpresas.concat(empresas);
      hasMore = empresas.length === limiteRegistros;
      pagina++; paginasProcessadas++;
    }

    if (debugMode) {
      return new Response(JSON.stringify({
        success: true, mode: 'DEBUG', totalEmpresasAnalisadas: allEmpresas.length,
        amostra: allEmpresas[0] || null, chaves: allEmpresas[0] ? Object.keys(allEmpresas[0]) : [],
      }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    const empresasRows = allEmpresas.map((e: any) => ({
      cod_empresa: e.codEmpresa ?? e.cod_empresa ?? e.id,
      razao_social: e.razaoSocial ?? e.razao_social ?? null,
      nome_fantasia: e.nomeFantasia ?? e.nome_fantasia ?? e.nome ?? null,
      cnpj: e.cnpj ?? e.documento ?? null,
      cidade: e.cidade ?? e.municipio ?? null, uf: e.uf ?? e.estado ?? null,
    }));

    if (empresasRows.length > 0) {
      const { error } = await supabase.from('empresa').upsert(empresasRows, { onConflict: 'cod_empresa' });
      if (error) throw error;
    }

    const proximaPagina = hasMore ? pagina : 1;
    await supabase.from('etl_controle').upsert({
      entidade: 'empresas', pagina_atual: proximaPagina, atualizado_em: new Date().toISOString(),
    }, { onConflict: 'entidade' });

    const concluido = !hasMore;
    return new Response(JSON.stringify({
      success: true, totalGravados: empresasRows.length, concluido,
      paginaInicial, paginaFinal: pagina - 1, paginasProcessadas,
      proximaPagina: hasMore ? pagina : null,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Erro no sync de empresas:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
    });
  }
});
