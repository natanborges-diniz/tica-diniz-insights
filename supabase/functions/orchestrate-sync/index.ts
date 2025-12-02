import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SyncResult {
  success: boolean;
  concluido?: boolean;
  totalGravados?: number;
  proximaPagina?: number | null;
  error?: string;
}

interface SyncParams {
  maxPaginas?: number;
  limite?: number;
  dataInicio?: string;
  dataFim?: string;
}

async function callSyncFunction(
  functionName: string, 
  supabaseUrl: string, 
  anonKey: string,
  params: SyncParams = {}
): Promise<SyncResult> {
  const url = `${supabaseUrl}/functions/v1/${functionName}`;
  
  const body: SyncParams = {
    maxPaginas: params.maxPaginas || 5,
    limite: params.limite || 500,
  };

  // Adicionar datas apenas se fornecidas (principalmente para vendas)
  if (params.dataInicio) {
    body.dataInicio = params.dataInicio;
  }
  if (params.dataFim) {
    body.dataFim = params.dataFim;
  }

  console.log(`Chamando ${functionName} com params:`, JSON.stringify(body));

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${anonKey}`,
    },
    body: JSON.stringify(body),
  });

  return await response.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    
    // Aceitar parâmetros via query string ou body
    let entidades = url.searchParams.get('entidades')?.split(',') || ['clientes', 'produtos', 'vendas'];
    let maxIteracoes = parseInt(url.searchParams.get('maxIteracoes') || '50');
    let dataInicio = url.searchParams.get('dataInicio') || undefined;
    let dataFim = url.searchParams.get('dataFim') || undefined;
    let maxPaginas = parseInt(url.searchParams.get('maxPaginas') || '5');
    let limite = parseInt(url.searchParams.get('limite') || '500');

    // Se for POST, sobrescrever com body
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (body.entidades) entidades = body.entidades;
        if (body.maxIteracoes) maxIteracoes = body.maxIteracoes;
        if (body.dataInicio) dataInicio = body.dataInicio;
        if (body.dataFim) dataFim = body.dataFim;
        if (body.maxPaginas) maxPaginas = body.maxPaginas;
        if (body.limite) limite = body.limite;
      } catch {
        // Body vazio ou inválido, usar query params
      }
    }

    console.log(`Orquestrador iniciado para: ${entidades.join(', ')} (max ${maxIteracoes} iterações por entidade)`);
    if (dataInicio || dataFim) {
      console.log(`Período: ${dataInicio || 'início'} até ${dataFim || 'fim'}`);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const resultados: Record<string, { iteracoes: number; totalRegistros: number; concluido: boolean; erro?: string }> = {};

    for (const entidade of entidades) {
      const functionName = `sync-${entidade}`;
      console.log(`\n=== Iniciando sync de ${entidade} ===`);
      
      let iteracao = 0;
      let totalRegistros = 0;
      let concluido = false;
      let erro: string | undefined;

      // Parâmetros específicos para a entidade
      const syncParams: SyncParams = {
        maxPaginas,
        limite,
      };

      // Passar datas apenas para vendas (outras entidades não usam período)
      if (entidade === 'vendas') {
        if (dataInicio) syncParams.dataInicio = dataInicio;
        if (dataFim) syncParams.dataFim = dataFim;
      }

      while (!concluido && iteracao < maxIteracoes) {
        iteracao++;
        console.log(`[${entidade}] Iteração ${iteracao}...`);

        try {
          const result = await callSyncFunction(functionName, supabaseUrl, anonKey, syncParams);
          
          if (!result.success) {
            erro = result.error || 'Erro desconhecido';
            console.error(`[${entidade}] Erro na iteração ${iteracao}: ${erro}`);
            break;
          }

          totalRegistros += result.totalGravados || 0;
          concluido = result.concluido || false;
          
          console.log(`[${entidade}] Iteração ${iteracao}: +${result.totalGravados} registros, concluído: ${concluido}`);

          if (concluido) {
            console.log(`[${entidade}] ✓ Sync completo após ${iteracao} iterações`);
          }
        } catch (e) {
          erro = e instanceof Error ? e.message : String(e);
          console.error(`[${entidade}] Exceção na iteração ${iteracao}: ${erro}`);
          break;
        }
      }

      if (!concluido && !erro) {
        console.log(`[${entidade}] Limite de iterações atingido (${maxIteracoes})`);
      }

      resultados[entidade] = {
        iteracoes: iteracao,
        totalRegistros,
        concluido,
        erro,
      };
    }

    // Resumo final
    const todosCompletos = Object.values(resultados).every(r => r.concluido);
    const totalGeral = Object.values(resultados).reduce((sum, r) => sum + r.totalRegistros, 0);

    console.log('\n=== RESUMO FINAL ===');
    for (const [entidade, r] of Object.entries(resultados)) {
      console.log(`${entidade}: ${r.totalRegistros} registros em ${r.iteracoes} iterações - ${r.concluido ? '✓ COMPLETO' : r.erro ? `✗ ERRO: ${r.erro}` : '⚠ INCOMPLETO'}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        todosCompletos,
        totalGeral,
        resultados,
        parametros: {
          entidades,
          maxIteracoes,
          dataInicio,
          dataFim,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Erro no orquestrador:', error);
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
