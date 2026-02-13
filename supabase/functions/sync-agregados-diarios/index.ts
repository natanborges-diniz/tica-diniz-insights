// supabase/functions/sync-agregados-diarios/index.ts
// E0.3: JWT obrigatório + role admin

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authGuard, corsHeaders } from '../_shared/authGuard.ts';

const FIREBIRD_API_BASE_URL = Deno.env.get('FIREBIRD_API_BASE_URL') || 'https://firebird-bridge-production.up.railway.app';
const EMPRESAS_ATIVAS = [1, 2, 4, 6, 9, 13, 14, 15, 16, 17, 18];

interface ResumoDiarioSimples {
  DATA_VENDA: string; COD_EMPRESA: number; VENDEDOR: string; FORMAPAGAMENTO: string;
  QTD_VENDAS: number; TOTAL_BRUTO: number; TOTAL_VENDIDO: number; TOTAL_DESCONTO: number;
}

interface AgregadoDiario {
  data: string; cod_empresa: number; vendedor: string; forma_pagamento: string;
  total_vendido: number; total_bruto: number; total_desconto: number; qtd_vendas: number;
  atualizado_em: string;
}

function formatDate(date: Date): string { return date.toISOString().split('T')[0]; }
function addDays(date: Date, days: number): Date { const r = new Date(date); r.setDate(r.getDate() + days); return r; }

async function firebirdGet(path: string, params: Record<string, any> = {}, timeoutMs = 30000) {
  const url = new URL(path, FIREBIRD_API_BASE_URL);
  Object.entries(params).forEach(([k, v]) => { if (v != null) url.searchParams.set(k, String(v)); });
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url.toString(), { headers: { 'Accept': 'application/json' }, signal: controller.signal });
    clearTimeout(tid);
    if (!res.ok) { const b = await res.text(); throw new Error(`Erro Firebird: ${res.status}`); }
    return res.json();
  } catch (err) { clearTimeout(tid); if (err instanceof Error && err.name === 'AbortError') throw new Error(`Timeout após ${timeoutMs/1000}s`); throw err; }
}

async function syncPeriodo(supabase: any, dataInicio: string, dataFim: string, empresa: number | string) {
  const empresaStr = String(empresa);
  try {
    const response = await firebirdGet('/api/v1/vendas/resumo-diario-simples', { dataInicio, dataFim, excluirCreditos: 0, empresa: empresaStr }, 120000);
    const dados: ResumoDiarioSimples[] = response?.data && Array.isArray(response.data) ? response.data : (Array.isArray(response) ? response : []);
    if (dados.length === 0) return { registros: 0 };
    const agora = new Date().toISOString();
    const agregados: AgregadoDiario[] = dados.map(d => ({
      data: d.DATA_VENDA, cod_empresa: d.COD_EMPRESA,
      vendedor: (d.VENDEDOR || '').trim() || 'DESCONHECIDO',
      forma_pagamento: (d.FORMAPAGAMENTO || '').trim() || 'OUTROS',
      total_vendido: d.TOTAL_VENDIDO || 0, total_bruto: d.TOTAL_BRUTO || 0,
      total_desconto: d.TOTAL_DESCONTO || 0, qtd_vendas: d.QTD_VENDAS || 0,
      atualizado_em: agora,
    }));
    await supabase.from('vendas_agregado_diario').delete().eq('cod_empresa', Number(empresaStr)).gte('data', dataInicio).lte('data', dataFim);
    const batchSize = 500;
    let totalSalvos = 0;
    for (let i = 0; i < agregados.length; i += batchSize) {
      const { error } = await supabase.from('vendas_agregado_diario').insert(agregados.slice(i, i + batchSize));
      if (error) throw error;
      totalSalvos += agregados.slice(i, i + batchSize).length;
    }
    return { registros: totalSalvos };
  } catch (err) {
    return { registros: 0, erro: err instanceof Error ? err.message : String(err) };
  }
}

async function processarTodasEmpresasBackground(supabase: any, dataInicio: string, dataFim: string) {
  let totalRegistros = 0;
  for (const empresa of EMPRESAS_ATIVAS) {
    let currentStart = new Date(dataInicio + 'T12:00:00');
    const endDate = new Date(dataFim + 'T12:00:00');
    while (currentStart <= endDate) {
      let currentEnd = addDays(currentStart, 6);
      if (currentEnd > endDate) currentEnd = endDate;
      try {
        const result = await syncPeriodo(supabase, formatDate(currentStart), formatDate(currentEnd), empresa);
        totalRegistros += result.registros;
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (err) { console.error(`[background] Erro empresa ${empresa}:`, err); }
      currentStart = addDays(currentEnd, 1);
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  try {
    await supabase.from('etl_controle').upsert({
      entidade: 'vendas_agregado_diario', ultima_data: dataFim, atualizado_em: new Date().toISOString(),
    }, { onConflict: 'entidade' });
  } catch (err) { console.error('[background] Erro etl_controle:', err); }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    // E0.3: Auth guard — admin only
    const { userId } = await authGuard(req, { requiredRole: "admin" });

    // E0.4: Accept params from both query string (legacy) and POST body (preferred)
    const url = new URL(req.url);
    let modoHistorico = url.searchParams.get('historico') === 'true';
    let empresa: string | undefined = url.searchParams.get('empresa') || undefined;
    const hoje = formatDate(new Date());
    let dataInicio = url.searchParams.get('dataInicio') || hoje;
    let dataFim = url.searchParams.get('dataFim') || hoje;

    // POST body overrides query params
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        modoHistorico = body.historico ?? modoHistorico;
        empresa = body.empresa != null ? String(body.empresa) : empresa;
        dataInicio = body.dataInicio ?? dataInicio;
        dataFim = body.dataFim ?? dataFim;
      } catch {}
    }
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // E0.4: Log who triggered the sync
    console.log(`[sync-agregados-diarios] Triggered by user=${userId}, mode=${modoHistorico ? 'historico' : 'normal'}, empresa=${empresa || 'ALL'}`);
    
    if (modoHistorico) {
      // @ts-ignore
      EdgeRuntime.waitUntil(processarTodasEmpresasBackground(supabase, dataInicio, dataFim));

      // E0.4: Record sync trigger in etl_controle
      await supabase.from('etl_controle').upsert({
        entidade: 'sync_log_diario', ultima_data: hoje,
        pagina_atual: 0, atualizado_em: new Date().toISOString(),
      }, { onConflict: 'entidade' });

      return new Response(JSON.stringify({
        success: true, modo: 'historico_background', periodo: `${dataInicio} a ${dataFim}`,
        empresas: EMPRESAS_ATIVAS, triggered_by: userId,
        message: `Sincronização iniciada em background.`,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } else {
      if (!empresa) {
        return new Response(JSON.stringify({
          success: false, error: 'Parâmetro empresa é obrigatório no modo normal.',
          empresas_disponiveis: EMPRESAS_ATIVAS,
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const result = await syncPeriodo(supabase, dataInicio, dataFim, empresa);
      return new Response(JSON.stringify({
        success: !result.erro, modo: 'normal', periodo: `${dataInicio} a ${dataFim}`,
        empresa, registros: result.registros, triggered_by: userId, erro: result.erro,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  } catch (err) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
