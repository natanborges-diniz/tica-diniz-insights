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

    console.log(`Iniciando sync de produtos (max ${maxPaginas} páginas, ${limiteRegistros} por página)...`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar progresso anterior
    const { data: controle } = await supabase
      .from('etl_controle')
      .select('pagina_atual')
      .eq('entidade', 'produtos')
      .maybeSingle();

    let paginaInicial = 1;
    if (!resetProgresso && controle?.pagina_atual && controle.pagina_atual > 1) {
      paginaInicial = controle.pagina_atual;
      console.log(`Retomando da página ${paginaInicial}`);
    }

    let allProdutos: any[] = [];
    let pagina = paginaInicial;
    let paginasProcessadas = 0;
    let hasMore = true;

    while (hasMore && paginasProcessadas < maxPaginas) {
      console.log(`Buscando página ${pagina} de produtos...`);
      
      const json = await firebirdGet('/api/v1/produtos', {
        limite: limiteRegistros,
        pagina,
      });

      const produtos = json.data ?? json.produtos ?? json;

      if (!Array.isArray(produtos)) {
        console.error('Formato inesperado:', json);
        throw new Error('Resposta não é um array');
      }

      console.log(`Página ${pagina}: ${produtos.length} produtos`);
      
      if (produtos.length > 0) {
        allProdutos = allProdutos.concat(produtos);
      }

      hasMore = produtos.length === limiteRegistros;
      pagina++;
      paginasProcessadas++;
    }

    console.log(`Total recebido: ${allProdutos.length} produtos em ${paginasProcessadas} páginas`);

    const rows = allProdutos.map((p: any) => ({
      cod_produto: p.cod_produto ?? p.codProduto ?? p.id,
      descricao: p.descricao ?? p.nome,
      referencia: p.codigo_barra ?? p.codigoBarra ?? p.referencia ?? null,
      categoria: p.tipo_item ?? p.tipoItem ?? p.categoria ?? p.grupo ?? null,
      ativo: p.ativo ?? true,
      preco_venda: p.preco_venda ?? p.precoVenda ?? null,
      preco_custo: p.preco_custo ?? p.precoCusto ?? null,
    })).filter((r: any) => r.cod_produto != null);

    console.log(`Gravando ${rows.length} produtos...`);

    const batchSize = 250;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      console.log(`Gravando lote ${Math.floor(i / batchSize) + 1}/${Math.ceil(rows.length / batchSize)}...`);
      
      const { error } = await supabase
        .from('produto')
        .upsert(batch, { onConflict: 'cod_produto' });

      if (error) {
        console.error('Erro no upsert:', error);
        throw error;
      }
    }

    // Salva progresso
    const proximaPagina = hasMore ? pagina : 1;
    await supabase
      .from('etl_controle')
      .upsert({
        entidade: 'produtos',
        ultima_data: new Date().toISOString().slice(0, 10),
        pagina_atual: proximaPagina,
        atualizado_em: new Date().toISOString(),
      }, { onConflict: 'entidade' });

    const concluido = !hasMore;
    console.log(`Sync de produtos ${concluido ? 'COMPLETO' : 'parcial'}.`);

    return new Response(
      JSON.stringify({
        success: true,
        message: concluido 
          ? `Sincronização completa: ${rows.length} produtos` 
          : `Chunk processado: ${rows.length} produtos`,
        totalGravados: rows.length,
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
    console.error('Erro no sync de produtos:', error);
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
