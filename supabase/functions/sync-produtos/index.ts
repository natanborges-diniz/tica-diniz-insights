// supabase/functions/sync-produtos/index.ts
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

    const url = new URL(req.url);
    let maxPaginas = parseInt(url.searchParams.get('maxPaginas') || '10');
    let limiteRegistros = parseInt(url.searchParams.get('limite') || '500');
    let resetProgresso = url.searchParams.get('reset') === 'true';

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        maxPaginas = body.maxPaginas ?? maxPaginas;
        limiteRegistros = body.limite ?? limiteRegistros;
        resetProgresso = body.reset ?? resetProgresso;
      } catch {}
    }

    console.log(`Iniciando sync de produtos (max ${maxPaginas} páginas)...`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: controle } = await supabase
      .from('etl_controle').select('pagina_atual').eq('entidade', 'produtos').maybeSingle();

    let paginaInicial = 1;
    if (!resetProgresso && controle?.pagina_atual && controle.pagina_atual > 1) {
      paginaInicial = controle.pagina_atual;
    }

    let allProdutos: any[] = [];
    let pagina = paginaInicial;
    let paginasProcessadas = 0;
    let hasMore = true;

    while (hasMore && paginasProcessadas < maxPaginas) {
      const json = await firebirdGet('/api/v1/produtos', { limite: limiteRegistros, pagina });
      const produtos = json.data ?? json.produtos ?? json;
      if (!Array.isArray(produtos)) throw new Error('Resposta não é um array');
      if (produtos.length > 0) allProdutos = allProdutos.concat(produtos);
      hasMore = produtos.length === limiteRegistros;
      pagina++; paginasProcessadas++;
    }

    const rows = allProdutos.map((p: any) => ({
      cod_produto: p.cod_produto ?? p.codProduto ?? p.id,
      descricao: p.descricao ?? p.nome,
      referencia: p.codigo_barra ?? p.codigoBarra ?? p.referencia ?? null,
      categoria: p.tipo_item ?? p.tipoItem ?? p.categoria ?? p.grupo ?? null,
      ativo: p.ativo ?? true,
      preco_venda: p.preco_venda ?? p.precoVenda ?? null,
      preco_custo: p.preco_custo ?? p.precoCusto ?? null,
    })).filter((r: any) => r.cod_produto != null);

    const batchSize = 250;
    for (let i = 0; i < rows.length; i += batchSize) {
      const { error } = await supabase.from('produto').upsert(rows.slice(i, i + batchSize), { onConflict: 'cod_produto' });
      if (error) throw error;
    }

    const proximaPagina = hasMore ? pagina : 1;
    await supabase.from('etl_controle').upsert({
      entidade: 'produtos', ultima_data: new Date().toISOString().slice(0, 10),
      pagina_atual: proximaPagina, atualizado_em: new Date().toISOString(),
    }, { onConflict: 'entidade' });

    const concluido = !hasMore;
    return new Response(JSON.stringify({
      success: true, totalGravados: rows.length, concluido,
      paginaInicial, paginaFinal: pagina - 1, paginasProcessadas,
      proximaPagina: hasMore ? pagina : null,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Erro no sync de produtos:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
    });
  }
});
