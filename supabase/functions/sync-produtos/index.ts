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
    console.log('Iniciando sync de produtos...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Busca produtos da API Firebird v1 com paginação
    let allProdutos: any[] = [];
    let pagina = 1;
    const limite = 1000;
    let hasMore = true;

    while (hasMore) {
      console.log(`Buscando página ${pagina} de produtos...`);
      
      const json = await firebirdGet('/api/v1/produtos', {
        limite,
        pagina,
      });

      const produtos = json.data ?? json.produtos ?? json;

      if (!Array.isArray(produtos)) {
        console.error('Formato inesperado de resposta de produtos:', json);
        throw new Error('Resposta de produtos não é um array');
      }

      console.log(`Página ${pagina}: ${produtos.length} produtos`);
      allProdutos = allProdutos.concat(produtos);

      // Se retornou menos que o limite, não há mais páginas
      hasMore = produtos.length === limite;
      pagina++;

      // Limite de segurança para evitar loop infinito
      if (pagina > 100) {
        console.log('Limite de páginas atingido (100)');
        break;
      }
    }

    console.log(`Total recebido: ${allProdutos.length} produtos da API`);

    // Mapeia para o formato da tabela stg.produto (conforme novo guia API v1)
    const rows = allProdutos.map((p: any) => ({
      cod_produto: p.cod_produto ?? p.codProduto ?? p.id,
      descricao: p.descricao ?? p.nome,
      referencia: p.codigo_barra ?? p.codigoBarra ?? p.referencia ?? null,
      categoria: p.tipo_item ?? p.tipoItem ?? p.categoria ?? p.grupo ?? null,
      ativo: p.ativo ?? true,
      preco_venda: p.preco_venda ?? p.precoVenda ?? null,
      preco_custo: p.preco_custo ?? p.precoCusto ?? null,
    })).filter((r: any) => r.cod_produto != null);

    console.log(`Gravando ${rows.length} produtos em stg.produto...`);

    // Grava em lotes de 500 para evitar timeout
    const batchSize = 500;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      console.log(`Gravando lote ${Math.floor(i / batchSize) + 1}/${Math.ceil(rows.length / batchSize)}...`);
      
      const { error } = await supabase
        .from('produto')
        .upsert(batch, { onConflict: 'cod_produto' });

      if (error) {
        console.error('Erro ao fazer upsert em stg.produto:', error);
        throw error;
      }
    }

    console.log('Sync de produtos concluído com sucesso.');

    return new Response(
      JSON.stringify({
        success: true,
        message: `${rows.length} produtos sincronizados com sucesso`,
        totalRecebidos: allProdutos.length,
        totalGravados: rows.length,
        paginas: pagina - 1,
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
