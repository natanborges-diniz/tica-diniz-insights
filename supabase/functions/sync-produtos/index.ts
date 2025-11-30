import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { firebirdGet } from '../_shared/firebirdApi.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Iniciando sync de produtos...');

    // Cria cliente Supabase com service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Busca produtos da API Firebird
    const json = await firebirdGet('/api/produtos', {
      // Adicione parâmetros conforme necessário, ex:
      // limit: 1000,
    });

    // Adapta o caminho conforme formato real da resposta
    const produtos = json.data ?? json.produtos ?? json;

    if (!Array.isArray(produtos)) {
      console.error('Formato inesperado de resposta de produtos:', json);
      throw new Error('Resposta de produtos não é um array');
    }

    console.log(`Recebidos ${produtos.length} produtos da API`);

    // Mapeia para o formato da tabela stg.produto
    const rows = produtos.map((p: any) => ({
      cod_produto: p.codProduto ?? p.id ?? p.codigo,
      descricao: p.descricao ?? p.nome,
      referencia: p.referencia ?? null,
      categoria: p.categoria ?? p.grupo ?? null,
      ativo: p.ativo ?? true,
    })).filter(r => r.cod_produto != null);

    console.log(`Gravando ${rows.length} produtos em stg.produto...`);

    // Faz upsert na tabela staging
    const { error } = await supabase
      .from('produto')
      .upsert(rows, { onConflict: 'cod_produto' });

    if (error) {
      console.error('Erro ao fazer upsert em stg.produto:', error);
      throw error;
    }

    console.log('Sync de produtos concluído com sucesso.');

    return new Response(
      JSON.stringify({
        success: true,
        message: `${rows.length} produtos sincronizados com sucesso`,
        totalRecebidos: produtos.length,
        totalGravados: rows.length,
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
