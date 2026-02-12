// supabase/functions/sync-agregados-mensal/index.ts
// E0.3: JWT obrigatório + role admin

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authGuard, corsHeaders } from '../_shared/authGuard.ts';

const FIREBIRD_API_BASE_URL = Deno.env.get('FIREBIRD_API_BASE_URL') || 'https://firebird-bridge-production.up.railway.app';

const CONFIG = {
  DIAS_POR_BATCH: 1, TIMEOUT_BATCH: 15000, RETRIES_POR_BATCH: 3,
  PAUSA_ENTRE_BATCHES: 300, PAUSA_ENTRE_MESES: 1000,
};

interface ResumoFormaPagamento {
  empresa: string; empresa_cod_logico: number; vendedor: string; formapagamento: string;
  totalgeral: number; qtd_vendas: number; total_bruto: number; total_desconto: number; perc_desconto: number;
}

interface AgregadoMensal {
  data: string; cod_empresa: number; vendedor: string; forma_pagamento: string;
  total_vendido: number; total_bruto: number; total_desconto: number; qtd_vendas: number; atualizado_em: string;
}

function formatDate(date: Date): string { return date.toISOString().split('T')[0]; }
function addDays(date: Date, days: number): Date { const r = new Date(date); r.setDate(r.getDate() + days); return r; }
function getPrimeiroDiaMes(ano: number, mes: number): Date { return new Date(ano, mes, 1); }
function getUltimoDiaMes(ano: number, mes: number): Date { return new Date(ano, mes + 1, 0); }

async function firebirdGetComRetry(path: string, params: Record<string, any> = {}, timeoutMs = CONFIG.TIMEOUT_BATCH, retries = CONFIG.RETRIES_POR_BATCH) {
  let lastError: Error | null = null;
  for (let t = 0; t <= retries; t++) {
    try {
      const url = new URL(path, FIREBIRD_API_BASE_URL);
      Object.entries(params).forEach(([k, v]) => { if (v != null) url.searchParams.set(k, String(v)); });
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url.toString(), { headers: { 'Accept': 'application/json' }, signal: controller.signal });
      clearTimeout(tid);
      if (!res.ok) throw new Error(`Erro Firebird: ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (lastError.name === 'AbortError') lastError = new Error(`Timeout`);
      if (t < retries) await new Promise(r => setTimeout(r, 1000 * (t + 1)));
    }
  }
  throw lastError;
}

async function syncMesPorBatches(supabase: any, ano: number, mes: number) {
  const primeiroDia = getPrimeiroDiaMes(ano, mes);
  const ultimoDia = getUltimoDiaMes(ano, mes);
  const dataArmazenamento = formatDate(ultimoDia);
  const todosOsDados: ResumoFormaPagamento[] = [];
  let batchesOk = 0, batchesFalha = 0;
  const diasProcessados: string[] = [], diasFalha: string[] = [];
  let diaAtual = primeiroDia;

  while (diaAtual <= ultimoDia) {
    const dataStr = formatDate(diaAtual);
    try {
      const response = await firebirdGetComRetry('/api/v1/vendas/resumo-formas-pagamento', { dataInicio: dataStr, dataFim: dataStr });
      const dados = Array.isArray(response) ? response : (response?.data && Array.isArray(response.data) ? response.data : []);
      if (dados.length > 0) todosOsDados.push(...dados);
      diasProcessados.push(dataStr); batchesOk++;
    } catch (err) { batchesFalha++; diasFalha.push(dataStr); }
    await new Promise(r => setTimeout(r, CONFIG.PAUSA_ENTRE_BATCHES));
    diaAtual = addDays(diaAtual, 1);
  }

  if (todosOsDados.length === 0) return { registros: 0, batchesOk, batchesFalha, diasProcessados, diasFalha };

  const agora = new Date().toISOString();
  const mapa = new Map<string, AgregadoMensal>();
  todosOsDados.forEach(d => {
    const key = `${d.empresa_cod_logico}|${(d.vendedor||'').trim()}|${d.formapagamento}`;
    const ex = mapa.get(key);
    if (ex) { ex.total_vendido += d.totalgeral||0; ex.total_bruto += d.total_bruto||0; ex.total_desconto += d.total_desconto||0; ex.qtd_vendas += d.qtd_vendas||0; }
    else mapa.set(key, { data: dataArmazenamento, cod_empresa: d.empresa_cod_logico, vendedor: (d.vendedor||'').trim(), forma_pagamento: d.formapagamento||'', total_vendido: d.totalgeral||0, total_bruto: d.total_bruto||0, total_desconto: d.total_desconto||0, qtd_vendas: d.qtd_vendas||0, atualizado_em: agora });
  });

  const agregados = Array.from(mapa.values());
  await supabase.from('vendas_agregado_diario').delete().eq('data', dataArmazenamento);
  const { error } = await supabase.from('vendas_agregado_diario').upsert(agregados, { onConflict: 'data,cod_empresa,vendedor,forma_pagamento', ignoreDuplicates: false });
  if (error) throw error;
  return { registros: agregados.length, batchesOk, batchesFalha, diasProcessados, diasFalha };
}

async function processarMesesBackground(supabase: any, anoInicio: number, mesInicio: number, anoFim: number, mesFim: number) {
  let ano = anoInicio, mes = mesInicio, totalRegistros = 0;
  while (ano < anoFim || (ano === anoFim && mes <= mesFim)) {
    try { const r = await syncMesPorBatches(supabase, ano, mes); totalRegistros += r.registros; } catch (err) { console.error(`Erro ${mes+1}/${ano}:`, err); }
    await new Promise(r => setTimeout(r, CONFIG.PAUSA_ENTRE_MESES));
    mes++; if (mes > 11) { mes = 0; ano++; }
  }
  try { await supabase.from('etl_controle').upsert({ entidade: 'vendas_agregado_mensal', ultima_data: formatDate(getUltimoDiaMes(anoFim, mesFim)), atualizado_em: new Date().toISOString() }, { onConflict: 'entidade' }); } catch {}
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  
  try {
    // E0.3: Auth guard — admin only
    await authGuard(req, { requiredRole: "admin" });

    const url = new URL(req.url);
    const modoHistorico = url.searchParams.get('historico') === 'true';
    const hoje = new Date();
    const anoAtual = hoje.getFullYear(), mesAtual = hoje.getMonth();
    const ano = parseInt(url.searchParams.get('ano') || String(anoAtual), 10);
    const mes = parseInt(url.searchParams.get('mes') || String(mesAtual + 1), 10) - 1;
    const anoInicio = parseInt(url.searchParams.get('anoInicio') || String(anoAtual), 10);
    const mesInicio = parseInt(url.searchParams.get('mesInicio') || '1', 10) - 1;
    const anoFim = parseInt(url.searchParams.get('anoFim') || String(anoAtual), 10);
    const mesFim = parseInt(url.searchParams.get('mesFim') || String(mesAtual + 1), 10) - 1;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (modoHistorico) {
      // @ts-ignore
      EdgeRuntime.waitUntil(processarMesesBackground(supabase, anoInicio, mesInicio, anoFim, mesFim));
      return new Response(JSON.stringify({ success: true, modo: 'historico_background', periodo: `${mesInicio+1}/${anoInicio} a ${mesFim+1}/${anoFim}` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } else {
      const result = await syncMesPorBatches(supabase, ano, mes);
      return new Response(JSON.stringify({ success: result.batchesFalha === 0, mes: mes+1, ano, registros: result.registros }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  } catch (err) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
