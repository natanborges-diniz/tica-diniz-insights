// supabase/functions/orchestrate-sync/index.ts
// FASE 1.2: Sync Control Plane — Lock, Observabilidade, Cron-ready
// JWT obrigatório + role admin (E0.3)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authGuard, corsHeaders } from '../_shared/authGuard.ts';

// =====================================================
// Types
// =====================================================

interface SyncRequest {
  modo?: 'janela_movel' | 'competencia' | 'full';
  entidades?: string[];
  dataInicio?: string;
  dataFim?: string;
  diasJanela?: number;
  competenciaAno?: number;
  competenciaMes?: number;
  empresas?: number[];
  maxPaginas?: number;
  limite?: number;
  maxIteracoes?: number;
  // Audit fields for reprocessing
  request_reason?: string;
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
    const fim = new Date(req.competenciaAno, req.competenciaMes, 0);
    return { dataInicio: formatDate(inicio), dataFim: formatDate(fim) };
  }

  if (req.dataInicio && req.dataFim) {
    return { dataInicio: req.dataInicio, dataFim: req.dataFim };
  }

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
// Lock helpers (via DB functions)
// =====================================================

async function acquireLock(supabase: any, lockKey: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('acquire_sync_lock', {
    p_lock_key: lockKey,
    p_timeout_minutes: 30,
  });
  if (error) {
    console.error('[orchestrate-sync] Lock acquire error:', error.message);
    return false;
  }
  return data === true;
}

async function releaseLock(supabase: any, lockKey: string): Promise<void> {
  await supabase.rpc('release_sync_lock', { p_lock_key: lockKey });
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
    let isAutoTriggered = false;

    try {
      const auth = await authGuard(req, { requiredRole: 'admin' });
      userId = auth.userId;
    } catch (authErr) {
      const authHeader = req.headers.get('Authorization') || '';
      if (authHeader === `Bearer ${serviceKey}`) {
        triggerType = 'cron';
        isAutoTriggered = true;
      } else {
        throw authErr;
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
    const requestReason = params.request_reason || null;
    const competencia = (modo === 'competencia' && params.competenciaAno && params.competenciaMes)
      ? `${params.competenciaAno}-${String(params.competenciaMes).padStart(2, '0')}`
      : null;

    // =====================================================
    // 0. Lock de concorrência
    // =====================================================
    const lockKey = `sync:${modo}`;
    const lockAcquired = await acquireLock(supabase, lockKey);

    if (!lockAcquired) {
      console.log(`[orchestrate-sync] Skipped: lock "${lockKey}" already held`);

      // Registrar run como skipped
      await supabase.from('sync_runs').insert({
        status: 'pending',
        triggered_by: userId,
        trigger_type: triggerType,
        is_auto_triggered: isAutoTriggered,
        data_inicio: dataInicio,
        data_fim: dataFim,
        entidades,
        empresas,
        modo,
        competencia,
        request_reason: requestReason,
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        duracao_ms: 0,
        error_code: 'LOCK_BUSY',
        error_message: `Outra execução de "${modo}" está em andamento. Skipped.`,
      });

      return new Response(JSON.stringify({
        success: false,
        skipped: true,
        reason: 'lock_busy',
        message: `Outra execução de "${modo}" está em andamento.`,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 409,
      });
    }

    console.log(`[orchestrate-sync] Lock acquired: ${lockKey}`);
    console.log(`[orchestrate-sync] Run started: modo=${modo}, entidades=${entidades.join(',')}, janela=${dataInicio}..${dataFim}, by=${userId || 'cron'}`);

    // =====================================================
    // 1. Criar sync_run
    // =====================================================
    const runStartedAt = new Date().toISOString();
    const { data: run, error: runErr } = await supabase
      .from('sync_runs')
      .insert({
        status: 'running',
        triggered_by: userId,
        trigger_type: triggerType,
        is_auto_triggered: isAutoTriggered,
        data_inicio: dataInicio,
        data_fim: dataFim,
        entidades,
        empresas,
        modo,
        competencia,
        request_reason: requestReason,
        started_at: runStartedAt,
      })
      .select('id')
      .single();

    if (runErr || !run) {
      console.error('[orchestrate-sync] Failed to create sync_run:', runErr);
      await releaseLock(supabase, lockKey);
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
    let lastErrorStep: string | null = null;
    let lastErrorCode: string | null = null;
    let lastErrorMessage: string | null = null;

    for (const entidade of entidades) {
      const jobStart = Date.now();

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
          const empresasAlvo = empresas || EMPRESAS_ATIVAS;
          let totalReg = 0;
          for (const emp of empresasAlvo) {
            const res = await callSyncFunction('sync-agregados-diarios', supabaseUrl, serviceKey, {
              historico: false, empresa: emp, dataInicio, dataFim,
            });
            totalReg += (res.registros as number) || 0;
          }
          result = {
            entidade, status: 'completed',
            registrosProcessados: totalReg, registrosInseridos: totalReg,
            paginasProcessadas: 0, duracaoMs: Date.now() - jobStart,
          };
        } else {
          const functionName = `sync-${entidade}`;
          let iteracao = 0, totalReg = 0, concluido = false, paginas = 0;
          const syncBody: Record<string, unknown> = { maxPaginas, limite };
          if (entidade === 'vendas') {
            syncBody.dataInicio = dataInicio;
            syncBody.dataFim = dataFim;
          }
          while (!concluido && iteracao < maxIteracoes) {
            iteracao++;
            const res = await callSyncFunction(functionName, supabaseUrl, serviceKey, syncBody);
            if (!res.success) throw new Error((res.error as string) || 'Erro desconhecido');
            totalReg += (res.totalGravados as number) || 0;
            paginas += (res.paginasProcessadas as number) || 1;
            concluido = (res.concluido as boolean) || false;
          }
          result = {
            entidade, status: concluido ? 'completed' : 'partial',
            registrosProcessados: totalReg, registrosInseridos: totalReg,
            paginasProcessadas: paginas, duracaoMs: Date.now() - jobStart,
          };
        }

        jobResults.push(result);
        totalRegistros += result.registrosInseridos;

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
        lastErrorStep = entidade;
        lastErrorCode = 'SYNC_ENTITY_FAILED';
        lastErrorMessage = erroMsg;

        jobResults.push({
          entidade, status: 'failed',
          registrosProcessados: 0, registrosInseridos: 0,
          paginasProcessadas: 0, duracaoMs: Date.now() - jobStart,
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
    const duracaoMs = new Date(finishedAt).getTime() - new Date(runStartedAt).getTime();

    await supabase.from('sync_runs').update({
      status: runStatus,
      total_registros: totalRegistros,
      total_erros: totalErros,
      finished_at: finishedAt,
      duracao_ms: duracaoMs,
      error_code: lastErrorCode,
      error_message: lastErrorMessage,
      error_step: lastErrorStep,
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

    // Liberar lock
    await releaseLock(supabase, lockKey);
    console.log(`[orchestrate-sync] Lock released: ${lockKey}`);
    console.log(`[orchestrate-sync] Run ${runId} finished: ${runStatus}, ${totalRegistros} registros, ${totalErros} erros, ${duracaoMs}ms`);

    return new Response(JSON.stringify({
      success: runStatus !== 'failed',
      runId,
      status: runStatus,
      modo,
      janela: { dataInicio, dataFim },
      entidades,
      totalRegistros,
      totalErros,
      duracaoMs,
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
