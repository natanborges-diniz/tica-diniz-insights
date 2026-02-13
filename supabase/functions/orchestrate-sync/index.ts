// supabase/functions/orchestrate-sync/index.ts
// FASE 1.1: Sync Control Plane — Entry point único para pipelines de sync
// JWT obrigatório + role admin (E0.3)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authGuard, corsHeaders } from '../_shared/authGuard.ts';

// =====================================================
// Types
// =====================================================

interface SyncRequest {
  // Modo de operação
  modo?: 'janela_movel' | 'competencia' | 'full';
  
  // Entidades a sincronizar (ordem respeitada)
  entidades?: string[];
  
  // Janela de dados
  dataInicio?: string;
  dataFim?: string;
  
  // Janela móvel (dias para trás a partir de hoje)
  diasJanela?: number; // default 7
  
  // Competência (para modo 'competencia')
  competenciaAno?: number;
  competenciaMes?: number;
  
  // Empresas específicas (null = todas)
  empresas?: number[];
  
  // Paginação para sub-functions
  maxPaginas?: number;
  limite?: number;
  maxIteracoes?: number;
}

interface JobResult {
  entidade: string;
  codEmpresa?: number;
  status: 'completed' | 'failed' | 'partial';
  registrosProcessados: number;
  registrosInseridos: number;
  paginasProcessadas: number;
  duracaoMs: number;
  erro?: string;
}

// Ordem padrão de sync (dependências respeitadas)
const ENTIDADES_PADRAO = ['clientes', 'produtos', 'vendas', 'agregados-diarios'];
const EMPRESAS_ATIVAS = [1, 2, 4, 6, 9, 13, 14, 15, 16, 17, 18];

// =====================================================
// Helpers
// =====================================================

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function calcularJanela(req: SyncRequest): { dataInicio: string; dataFim: string } {
  const hoje = new Date();
  const dataFim = formatDate(hoje);
  
  if (req.modo === 'competencia' && req.competenciaAno && req.competenciaMes) {
    const inicio = new Date(req.competenciaAno, req.competenciaMes - 1, 1);
    const fim = new Date(req.competenciaAno, req.competenciaMes, 0); // último dia do mês
    return { dataInicio: formatDate(inicio), dataFim: formatDate(fim) };
  }
  
  if (req.dataInicio && req.dataFim) {
    return { dataInicio: req.dataInicio, dataFim: req.dataFim };
  }
  
  // Janela móvel padrão
  const dias = req.diasJanela || 7;
  const inicio = new Date(hoje);
  inicio.setDate(inicio.getDate() - dias);
  return { dataInicio: formatDate(inicio), dataFim: dataFim };
}

async function callSyncFunction(
  functionName: string,
  supabaseUrl: string,
  serviceKey: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const url = `${supabaseUrl}/functions/v1/${functionName}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(body),
  });
  
  const data = await response.json();
  if (!response.ok && !data) {
    throw new Error(`HTTP ${response.status} from ${functionName}`);
  }
  return data;
}

// =====================================================
// Main handler
// =====================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // Auth guard — admin only (ou service_role para cron)
    let userId: string | null = null;
    let triggerType = 'manual';
    
    try {
      const auth = await authGuard(req, { requiredRole: 'admin' });
      userId = auth.userId;
    } catch (authErr) {
      // Se o token for service_role (cron), permitir
      const authHeader = req.headers.get('Authorization') || '';
      if (authHeader === `Bearer ${serviceKey}`) {
        triggerType = 'cron';
      } else {
        throw authErr; // Re-throw para 401/403
      }
    }

    // Parse request
    let params: SyncRequest = {};
    if (req.method === 'POST') {
      try { params = await req.json(); } catch {}
    }

    const modo = params.modo || 'janela_movel';
    const entidades = params.entidades || ENTIDADES_PADRAO;
    const empresas = params.empresas || null;
    const { dataInicio, dataFim } = calcularJanela(params);
    const maxPaginas = params.maxPaginas || 5;
    const limite = params.limite || 500;
    const maxIteracoes = params.maxIteracoes || 50;

    console.log(`[orchestrate-sync] Run started: modo=${modo}, entidades=${entidades.join(',')}, janela=${dataInicio}..${dataFim}, by=${userId || 'cron'}`);

    // =====================================================
    // 1. Criar sync_run
    // =====================================================
    const { data: run, error: runErr } = await supabase
      .from('sync_runs')
      .insert({
        status: 'running',
        triggered_by: userId,
        trigger_type: triggerType,
        data_inicio: dataInicio,
        data_fim: dataFim,
        entidades,
        empresas,
        modo,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (runErr || !run) {
      console.error('[orchestrate-sync] Failed to create sync_run:', runErr);
      throw new Error('Falha ao registrar execução');
    }

    const runId = run.id;
    console.log(`[orchestrate-sync] Run ID: ${runId}`);

    // =====================================================
    // 2. Executar entidades em ordem
    // =====================================================
    const jobResults: JobResult[] = [];
    let totalRegistros = 0;
    let totalErros = 0;

    for (const entidade of entidades) {
      const jobStart = Date.now();
      
      // Criar job
      const { data: job } = await supabase
        .from('sync_jobs')
        .insert({
          run_id: runId,
          entidade,
          status: 'running',
          data_inicio: dataInicio,
          data_fim: dataFim,
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      const jobId = job?.id;

      try {
        let result: JobResult;

        if (entidade === 'agregados-diarios') {
          // sync-agregados-diarios usa modo histórico para processar todas as empresas
          const empresasAlvo = empresas || EMPRESAS_ATIVAS;
          let totalReg = 0;

          for (const emp of empresasAlvo) {
            const res = await callSyncFunction('sync-agregados-diarios', supabaseUrl, serviceKey, {
              historico: false,
              empresa: emp,
              dataInicio,
              dataFim,
            });
            totalReg += (res.registros as number) || 0;
          }

          result = {
            entidade,
            status: 'completed',
            registrosProcessados: totalReg,
            registrosInseridos: totalReg,
            paginasProcessadas: 0,
            duracaoMs: Date.now() - jobStart,
          };
        } else {
          // Sync paginado (clientes, produtos, vendas)
          const functionName = `sync-${entidade}`;
          let iteracao = 0;
          let totalReg = 0;
          let concluido = false;
          let paginas = 0;

          const syncBody: Record<string, unknown> = { maxPaginas, limite };
          if (entidade === 'vendas') {
            syncBody.dataInicio = dataInicio;
            syncBody.dataFim = dataFim;
          }

          while (!concluido && iteracao < maxIteracoes) {
            iteracao++;
            const res = await callSyncFunction(functionName, supabaseUrl, serviceKey, syncBody);
            
            if (!res.success) {
              throw new Error((res.error as string) || 'Erro desconhecido');
            }
            
            totalReg += (res.totalGravados as number) || 0;
            paginas += (res.paginasProcessadas as number) || 1;
            concluido = (res.concluido as boolean) || false;
          }

          result = {
            entidade,
            status: concluido ? 'completed' : 'partial',
            registrosProcessados: totalReg,
            registrosInseridos: totalReg,
            paginasProcessadas: paginas,
            duracaoMs: Date.now() - jobStart,
          };
        }

        jobResults.push(result);
        totalRegistros += result.registrosInseridos;

        // Atualizar job
        if (jobId) {
          await supabase.from('sync_jobs').update({
            status: result.status,
            registros_processados: result.registrosProcessados,
            registros_inseridos: result.registrosInseridos,
            paginas_processadas: result.paginasProcessadas,
            finished_at: new Date().toISOString(),
            duracao_ms: result.duracaoMs,
          }).eq('id', jobId);
        }

        console.log(`[orchestrate-sync] ${entidade}: ${result.status} (${result.registrosInseridos} registros, ${result.duracaoMs}ms)`);

      } catch (err) {
        const erroMsg = err instanceof Error ? err.message : String(err);
        totalErros++;

        jobResults.push({
          entidade,
          status: 'failed',
          registrosProcessados: 0,
          registrosInseridos: 0,
          paginasProcessadas: 0,
          duracaoMs: Date.now() - jobStart,
          erro: erroMsg,
        });

        if (jobId) {
          await supabase.from('sync_jobs').update({
            status: 'failed',
            finished_at: new Date().toISOString(),
            duracao_ms: Date.now() - jobStart,
            erro: erroMsg,
          }).eq('id', jobId);
        }

        console.error(`[orchestrate-sync] ${entidade}: FAILED — ${erroMsg}`);
      }
    }

    // =====================================================
    // 3. Finalizar sync_run
    // =====================================================
    const runStatus = totalErros === 0 ? 'completed' 
      : totalErros === entidades.length ? 'failed' 
      : 'partial';

    const finishedAt = new Date().toISOString();

    await supabase.from('sync_runs').update({
      status: runStatus,
      total_registros: totalRegistros,
      total_erros: totalErros,
      finished_at: finishedAt,
      duracao_ms: Date.now() - new Date(run.id ? finishedAt : finishedAt).getTime(), // approx
      erro_resumo: totalErros > 0 
        ? jobResults.filter(j => j.erro).map(j => `${j.entidade}: ${j.erro}`).join('; ')
        : null,
    }).eq('id', runId);

    // Atualizar etl_controle
    await supabase.from('etl_controle').upsert({
      entidade: 'orchestrate-sync',
      ultima_data: dataFim,
      atualizado_em: finishedAt,
    }, { onConflict: 'entidade' });

    console.log(`[orchestrate-sync] Run ${runId} finished: ${runStatus}, ${totalRegistros} registros, ${totalErros} erros`);

    return new Response(JSON.stringify({
      success: runStatus !== 'failed',
      runId,
      status: runStatus,
      modo,
      janela: { dataInicio, dataFim },
      entidades,
      totalRegistros,
      totalErros,
      jobs: jobResults,
      triggered_by: userId || 'cron',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    if (error instanceof Response) return error;
    console.error('[orchestrate-sync] Fatal error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
