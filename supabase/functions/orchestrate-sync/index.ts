// supabase/functions/orchestrate-sync/index.ts
// E0.3: JWT obrigatório + role admin

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authGuard, corsHeaders } from '../_shared/authGuard.ts';

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
  serviceKey: string,
  params: SyncParams = {}
): Promise<SyncResult> {
  const url = `${supabaseUrl}/functions/v1/${functionName}`;
  
  const body: SyncParams = {
    maxPaginas: params.maxPaginas || 5,
    limite: params.limite || 500,
  };

  if (params.dataInicio) body.dataInicio = params.dataInicio;
  if (params.dataFim) body.dataFim = params.dataFim;

  console.log(`Chamando ${functionName} com params:`, JSON.stringify(body));

  // E0.3: Use service_role key for internal calls (sub-functions also validate auth)
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
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
    // E0.3: Auth guard — admin only
    await authGuard(req, { requiredRole: "admin" });

    const url = new URL(req.url);
    
    let entidades = url.searchParams.get('entidades')?.split(',') || ['clientes', 'produtos', 'vendas'];
    let maxIteracoes = parseInt(url.searchParams.get('maxIteracoes') || '50');
    let dataInicio = url.searchParams.get('dataInicio') || undefined;
    let dataFim = url.searchParams.get('dataFim') || undefined;
    let maxPaginas = parseInt(url.searchParams.get('maxPaginas') || '5');
    let limite = parseInt(url.searchParams.get('limite') || '500');

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (body.entidades) entidades = body.entidades;
        if (body.maxIteracoes) maxIteracoes = body.maxIteracoes;
        if (body.dataInicio) dataInicio = body.dataInicio;
        if (body.dataFim) dataFim = body.dataFim;
        if (body.maxPaginas) maxPaginas = body.maxPaginas;
        if (body.limite) limite = body.limite;
      } catch {}
    }

    console.log(`Orquestrador iniciado para: ${entidades.join(', ')}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
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

      const syncParams: SyncParams = { maxPaginas, limite };
      if (entidade === 'vendas') {
        if (dataInicio) syncParams.dataInicio = dataInicio;
        if (dataFim) syncParams.dataFim = dataFim;
      }

      while (!concluido && iteracao < maxIteracoes) {
        iteracao++;
        try {
          const result = await callSyncFunction(functionName, supabaseUrl, supabaseServiceKey, syncParams);
          if (!result.success) { erro = result.error || 'Erro desconhecido'; break; }
          totalRegistros += result.totalGravados || 0;
          concluido = result.concluido || false;
        } catch (e) {
          erro = e instanceof Error ? e.message : String(e);
          break;
        }
      }

      resultados[entidade] = { iteracoes: iteracao, totalRegistros, concluido, erro };
    }

    const todosCompletos = Object.values(resultados).every(r => r.concluido);
    const totalGeral = Object.values(resultados).reduce((sum, r) => sum + r.totalRegistros, 0);

    return new Response(
      JSON.stringify({ success: true, todosCompletos, totalGeral, resultados }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Erro no orquestrador:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
