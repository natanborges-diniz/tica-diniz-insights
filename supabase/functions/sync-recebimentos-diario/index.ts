// supabase/functions/sync-recebimentos-diario/index.ts
// Fase 1 — Dados de recebimento (docs/REVISAO_VENDAS_METAS.md §4, §5.2, Fase 1)
// Sincroniza o agregado de recebimentos (regime de caixa) do firebird-bridge
// (GET /api/v1/vendas/recebimentos/agregado) para
// public.recebimentos_agregado_diario e registra a execução em public.sync_log.
//
// COMO É DISPARADA:
//   1. pg_cron via migration 20260728170100_cron_sync_recebimentos_diario.sql
//      (diário 10:30 UTC = 07:30 BRT, depois do sync 07:00 BRT do bridge) —
//      mesmo mecanismo de sync-os-hub / btg-poll-status / conciliar-extrato.
//      Obs.: sync-agregados-diarios NÃO tem cron no repo (é disparada pelo
//      frontend/orchestrate-sync); aqui usamos o mecanismo de cron que já
//      existe para as demais edges.
//   2. Manualmente pelo frontend: src/services/recebimentosService.ts
//      (sincronizarRecebimentos), via supabase.functions.invoke().
//
// DECISÃO — SEMANA COMERCIAL (documentação da semântica de `origem`):
//   O campo `origem` (VENDA_PERIODO | SALDO_ANTERIOR) devolvido pelo bridge é
//   relativo ao dataInicio consultado. Para que `origem` signifique sempre
//   "relativa à semana comercial (segunda-feira → domingo) da data de
//   pagamento", esta função:
//     1. ajusta dataInicio para a SEGUNDA-FEIRA da semana comercial que o
//        contém (mesmo quando o caller passa um dia no meio da semana);
//     2. divide o período em janelas de UMA semana comercial e consulta o
//        bridge janela a janela — assim cada linha gravada tem origem relativa
//        à própria semana, inclusive em backfill de várias semanas.
//   Default (sem parâmetros): [segunda-feira da semana corrente .. hoje] em BRT.
//
// JWT obrigatório: service_role (cron) ou admin — mesmo padrão de
// sync-agregados-diarios.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authGuard, corsHeaders } from '../_shared/authGuard.ts';

const FIREBIRD_API_BASE_URL = Deno.env.get('FIREBIRD_API_BASE_URL') || 'https://firebird-bridge-production.up.railway.app';
// Mesma lista de empresas lógicas do sync-agregados-diarios
const EMPRESAS_ATIVAS = [1, 2, 4, 6, 9, 13, 14, 15, 16, 17, 18];
const BATCH_SIZE = 500;
const SYNC_TIPO = 'recebimentos_diario';

interface RecebimentoAgregadoBridge {
  cod_empresa: number | null;
  cod_vendedor: number | null;
  vendedor_nome: string | null;
  data_pagamento: string;
  forma_categoria: string | null;
  origem: string | null;
  valor_recebido: number;
  qtd_parcelas: number;
}

interface Janela { inicio: string; fim: string }

function formatDate(date: Date): string { return date.toISOString().split('T')[0]; }

/** Data de "hoje" no fuso comercial (BRT), formato YYYY-MM-DD. */
function hojeBRT(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return formatDate(d);
}

/** Segunda-feira da semana comercial que contém a data (domingo pertence à semana iniciada na segunda anterior). */
function segundaDaSemana(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z');
  const dow = d.getUTCDay(); // 0 = domingo
  const diff = dow === 0 ? 6 : dow - 1;
  return addDays(iso, -diff);
}

/** Divide [inicio..fim] em janelas de uma semana comercial (segunda → domingo, última janela truncada em fim). */
function janelasSemanaComercial(inicio: string, fim: string): Janela[] {
  const janelas: Janela[] = [];
  let cursor = segundaDaSemana(inicio);
  while (cursor <= fim) {
    const fimSemana = addDays(cursor, 6); // domingo
    janelas.push({ inicio: cursor, fim: fimSemana < fim ? fimSemana : fim });
    cursor = addDays(cursor, 7);
  }
  return janelas;
}

async function firebirdGet(path: string, params: Record<string, unknown> = {}, timeoutMs = 120000) {
  const url = new URL(path, FIREBIRD_API_BASE_URL);
  Object.entries(params).forEach(([k, v]) => { if (v != null) url.searchParams.set(k, String(v)); });
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url.toString(), { headers: { 'Accept': 'application/json' }, signal: controller.signal });
    clearTimeout(tid);
    if (!res.ok) { await res.text(); throw new Error(`Erro Firebird: ${res.status}`); }
    return res.json();
  } catch (err) {
    clearTimeout(tid);
    if (err instanceof Error && err.name === 'AbortError') throw new Error(`Timeout após ${timeoutMs / 1000}s`);
    throw err;
  }
}

/**
 * Sincroniza uma empresa: consulta o bridge janela a janela (semana
 * comercial), upsert em batches (onConflict na UNIQUE) e depois apaga do
 * recorte (empresa + intervalo total) as linhas que não vieram mais nesta
 * execução — identificadas por atualizado_em < runIso (o upsert carimba
 * atualizado_em = runIso em tudo que veio). Mesmo racional do syncEstoque do
 * bridge: só o recorte sincronizado é tocado.
 */
async function syncEmpresa(
  supabase: ReturnType<typeof createClient>,
  empresa: number,
  janelas: Janela[],
  runIso: string,
): Promise<{ linhas: number }> {
  let linhas = 0;

  for (const janela of janelas) {
    const response = await firebirdGet('/api/v1/vendas/recebimentos/agregado', {
      empresa, dataInicio: janela.inicio, dataFim: janela.fim, cache: 0,
    });
    if (response?.ok === false) {
      throw new Error(response?.error?.message || response?.error || 'Bridge retornou ok=false');
    }
    const dados: RecebimentoAgregadoBridge[] = Array.isArray(response?.data) ? response.data : [];
    if (dados.length === 0) continue;

    const registros = dados.map((d) => ({
      cod_empresa: d.cod_empresa ?? empresa,
      // cod_vendedor NULL viraria linha órfã na UNIQUE (NULLs não colidem) —
      // normalizamos para 0 = "sem vendedor identificado".
      cod_vendedor: d.cod_vendedor ?? 0,
      vendedor_nome: (d.vendedor_nome || '').trim() || 'DESCONHECIDO',
      data_pagamento: String(d.data_pagamento).slice(0, 10),
      forma_categoria: d.forma_categoria || 'OUTROS',
      origem: d.origem || 'VENDA_PERIODO',
      valor_recebido: d.valor_recebido || 0,
      qtd_parcelas: d.qtd_parcelas || 0,
      atualizado_em: runIso,
    }));

    for (let i = 0; i < registros.length; i += BATCH_SIZE) {
      const batch = registros.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from('recebimentos_agregado_diario')
        .upsert(batch, { onConflict: 'cod_empresa,cod_vendedor,data_pagamento,forma_categoria,origem' });
      if (error) throw new Error(error.message);
      linhas += batch.length;
    }
  }

  // Delete das linhas obsoletas SÓ do recorte sincronizado (empresa + período)
  const inicioTotal = janelas[0].inicio;
  const fimTotal = janelas[janelas.length - 1].fim;
  const { error: delError } = await supabase
    .from('recebimentos_agregado_diario')
    .delete()
    .eq('cod_empresa', empresa)
    .gte('data_pagamento', inicioTotal)
    .lte('data_pagamento', fimTotal)
    .lt('atualizado_em', runIso);
  if (delError) throw new Error(`Erro ao remover obsoletos: ${delError.message}`);

  return { linhas };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth: service_role (cron) ou admin — mesmo padrão de sync-agregados-diarios
    let userId = 'cron';
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');

    let isServiceRole = false;
    if (token) {
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
          if (payload.role === 'service_role') {
            isServiceRole = true;
            userId = 'cron-service-role';
          }
        }
      } catch { /* segue para authGuard */ }
    }

    if (!isServiceRole) {
      const result = await authGuard(req, { requiredRole: 'admin' });
      userId = result.userId;
    }

    // Parâmetros: query string + POST body (body tem precedência)
    const url = new URL(req.url);
    let dataInicio: string | undefined = url.searchParams.get('dataInicio') || undefined;
    let dataFim: string | undefined = url.searchParams.get('dataFim') || undefined;
    let empresas: number[] = EMPRESAS_ATIVAS;

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        dataInicio = body.dataInicio ?? dataInicio;
        dataFim = body.dataFim ?? dataFim;
        if (Array.isArray(body.empresas) && body.empresas.length > 0) {
          empresas = body.empresas.map((e: unknown) => Number(e)).filter((e: number) => !Number.isNaN(e));
        }
      } catch { /* body vazio (ex.: cron) */ }
    }

    // Defaults: semana comercial corrente em BRT (ver decisão no cabeçalho)
    const fim = dataFim || hojeBRT();
    const inicioBase = dataInicio || fim;
    const inicio = segundaDaSemana(inicioBase); // sempre ancorado na segunda-feira
    if (inicio > fim) {
      return new Response(JSON.stringify({ success: false, error: `Período inválido: ${inicio} > ${fim}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const janelas = janelasSemanaComercial(inicio, fim);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    console.log(`[sync-recebimentos-diario] user=${userId} periodo=${inicio}~${fim} semanas=${janelas.length} empresas=${empresas.join(',')}`);

    const runIso = new Date().toISOString();
    const porEmpresa: Array<{ empresa: number; linhas: number }> = [];
    const empresasComErro: Array<{ empresa: number; erro: string }> = [];
    let totalLinhas = 0;

    // Sequencial por empresa com throttle — mesmo padrão do sync-agregados-diarios
    // (evita sobrecarregar o pool de conexões Firebird do bridge).
    for (const empresa of empresas) {
      try {
        const { linhas } = await syncEmpresa(supabase, empresa, janelas, runIso);
        porEmpresa.push({ empresa, linhas });
        totalLinhas += linhas;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[sync-recebimentos-diario] empresa=${empresa}:`, msg);
        empresasComErro.push({ empresa, erro: msg });
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    const status = empresasComErro.length === 0
      ? 'OK'
      : (empresasComErro.length === empresas.length ? 'ERRO' : 'PARCIAL');

    const { error: logError } = await supabase.from('sync_log').insert({
      sync_tipo: SYNC_TIPO,
      periodo_inicio: inicio,
      periodo_fim: fim,
      empresas: empresas.join(','),
      linhas: totalLinhas,
      status,
      detalhe: {
        triggered_by: userId,
        janelas,
        por_empresa: porEmpresa,
        empresas_com_erro: empresasComErro,
      },
    });
    if (logError) console.error('[sync-recebimentos-diario] Erro ao gravar sync_log:', logError.message);

    console.log(`[sync-recebimentos-diario] Concluído: status=${status} linhas=${totalLinhas} erros=${empresasComErro.length}`);

    return new Response(JSON.stringify({
      success: status !== 'ERRO',
      status,
      periodo: `${inicio} a ${fim}`,
      semanas: janelas.length,
      linhas: totalLinhas,
      por_empresa: porEmpresa,
      empresas_com_erro: empresasComErro,
      triggered_by: userId,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
