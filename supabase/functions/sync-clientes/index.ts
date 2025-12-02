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
    // Parâmetros configuráveis via query string ou body
    const url = new URL(req.url);
    let maxPaginas = parseInt(url.searchParams.get('maxPaginas') || '10');
    let limiteRegistros = parseInt(url.searchParams.get('limite') || '500');
    let resetProgresso = url.searchParams.get('reset') === 'true';

    // Também aceita parâmetros via body (POST)
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        maxPaginas = body.maxPaginas ?? maxPaginas;
        limiteRegistros = body.limite ?? limiteRegistros;
        resetProgresso = body.reset ?? resetProgresso;
      } catch {}
    }

    console.log(`Iniciando sync de clientes (max ${maxPaginas} páginas, ${limiteRegistros} por página)...`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar progresso anterior
    const { data: controle } = await supabase
      .from('etl_controle')
      .select('ultima_data')
      .eq('entidade', 'clientes_pagina')
      .maybeSingle();

    let paginaInicial = 1;
    if (!resetProgresso && controle?.ultima_data) {
      paginaInicial = parseInt(controle.ultima_data) || 1;
      console.log(`Retomando da página ${paginaInicial}`);
    }

    let allClientes: any[] = [];
    let pagina = paginaInicial;
    let paginasProcessadas = 0;
    let hasMore = true;
    let ultimaPaginaComDados = paginaInicial;

    while (hasMore && paginasProcessadas < maxPaginas) {
      console.log(`Buscando página ${pagina} de clientes...`);
      
      const json = await firebirdGet('/api/v1/clientes', {
        limite: limiteRegistros,
        pagina,
      });

      const clientes = json.data ?? json.clientes ?? json;

      if (!Array.isArray(clientes)) {
        console.error('Formato inesperado de resposta:', json);
        throw new Error('Resposta não é um array');
      }

      console.log(`Página ${pagina}: ${clientes.length} clientes`);
      
      if (clientes.length > 0) {
        allClientes = allClientes.concat(clientes);
        ultimaPaginaComDados = pagina;
      }

      hasMore = clientes.length === limiteRegistros;
      pagina++;
      paginasProcessadas++;
    }

    console.log(`Total recebido: ${allClientes.length} clientes em ${paginasProcessadas} páginas`);

    // Mapeia para o formato da tabela
    const rows = allClientes.map((c: any) => ({
      cod_pessoa: c.cod_pessoa ?? c.codPessoa ?? c.id,
      nome: c.nome ?? c.razao_social ?? c.razaoSocial,
      identificador: c.cpf ?? c.cnpj ?? c.cpfCnpj ?? null,
      tipo: c.pessoa_empresa ? 'PJ' : 'PF',
      cidade: c.cidade ?? null,
      uf: c.uf ?? c.estado ?? null,
      telefone: c.telefone ?? c.celular ?? null,
      email: c.email ?? null,
      ativo: c.ativo ?? true,
      vendedor: c.pessoa_vendedor ?? c.pessoaVendedor ?? false,
    })).filter((r: any) => r.cod_pessoa != null);

    console.log(`Gravando ${rows.length} clientes...`);

    // Grava em lotes menores
    const batchSize = 250;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      console.log(`Gravando lote ${Math.floor(i / batchSize) + 1}/${Math.ceil(rows.length / batchSize)}...`);
      
      const { error } = await supabase
        .from('pessoa')
        .upsert(batch, { onConflict: 'cod_pessoa' });

      if (error) {
        console.error('Erro no upsert:', error);
        throw error;
      }
    }

    // Salva progresso (próxima página a processar)
    const proximaPagina = hasMore ? pagina : 1; // Reseta se terminou
    const { error: controleError } = await supabase
      .from('etl_controle')
      .upsert({
        entidade: 'clientes_pagina',
        ultima_data: String(proximaPagina),
        atualizado_em: new Date().toISOString(),
      }, { onConflict: 'entidade' });

    if (controleError) {
      console.error('Erro ao salvar progresso:', controleError);
    }

    // Também atualiza controle geral
    await supabase
      .from('etl_controle')
      .upsert({
        entidade: 'clientes',
        ultima_data: new Date().toISOString().slice(0, 10),
        atualizado_em: new Date().toISOString(),
      }, { onConflict: 'entidade' });

    const concluido = !hasMore;
    console.log(`Sync de clientes ${concluido ? 'COMPLETO' : 'parcial'}.`);

    return new Response(
      JSON.stringify({
        success: true,
        message: concluido 
          ? `Sincronização completa: ${rows.length} clientes` 
          : `Chunk processado: ${rows.length} clientes`,
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
    console.error('Erro no sync de clientes:', error);
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
