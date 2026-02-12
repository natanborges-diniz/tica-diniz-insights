// supabase/functions/sync-agregados-semanal/index.ts
// E0.3: JWT obrigatório + role admin

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authGuard, corsHeaders } from '../_shared/authGuard.ts';

const FIREBIRD_API_BASE_URL = Deno.env.get('FIREBIRD_API_BASE_URL') || 'https://firebird-bridge-production.up.railway.app';

interface ResumoFormaPagamento {
  empresa: string; empresa_cod_logico: number; vendedor: string; formapagamento: string;
  totalgeral: number; qtd_vendas: number; total_bruto: number; total_desconto: number; perc_desconto: number;
}

interface AgregadoDiario {
  data: string; cod_empresa: number; vendedor: string; forma_pagamento: string;
  total_vendido: number; total_bruto: number; total_desconto: number; qtd_vendas: number; atualizado_em: string;
}

function formatDate(date: Date): string { return date.toISOString().split('T')[0]; }
function addDays(date: Date, days: number): Date { const r = new Date(date); r.setDate(r.getDate() + days); return r; }
function getUltimoDiaMes(ano: number, mes: number): Date { return new Date(ano, mes + 1, 0); }

async function firebirdGet(path: string, params: Record<string, any> = {}, timeoutMs = 45000) {
  const url = new URL(path, FIREBIRD_API_BASE_URL);
  Object.entries(params).forEach(([k, v]) => { if (v != null) url.searchParams.set(k, String(v)); });
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url.toString(), { headers: { 'Accept': 'application/json' }, signal: controller.signal });
    clearTimeout(tid);
    if (!res.ok) throw new Error(`Erro Firebird: ${res.status}`);
    return res.json();
  } catch (err) { clearTimeout(tid); if (err instanceof Error && err.name === 'AbortError') throw new Error(`Timeout`); throw err; }
}

async function syncPeriodo(supabase: any, dataInicio: string, dataFim: string, dataArmazenamento: string) {
  try {
    const response = await firebirdGet('/api/v1/vendas/resumo-formas-pagamento', { dataInicio, dataFim, cache: 0 }, 45000);
    const dados: ResumoFormaPagamento[] = Array.isArray(response) ? response : (response?.data && Array.isArray(response.data) ? response.data : []);
    if (dados.length === 0) return { registros: 0, dados: [] };
    const agora = new Date().toISOString();
    const mapa = new Map<string, AgregadoDiario>();
    dados.forEach(d => {
      const key = `${d.empresa_cod_logico}|${(d.vendedor||'').trim()}|${d.formapagamento}`;
      const ex = mapa.get(key);
      if (ex) { ex.total_vendido += d.totalgeral||0; ex.total_bruto += d.total_bruto||0; ex.total_desconto += d.total_desconto||0; ex.qtd_vendas += d.qtd_vendas||0; }
      else mapa.set(key, { data: dataArmazenamento, cod_empresa: d.empresa_cod_logico, vendedor: (d.vendedor||'').trim(), forma_pagamento: d.formapagamento||'', total_vendido: d.totalgeral||0, total_bruto: d.total_bruto||0, total_desconto: d.total_desconto||0, qtd_vendas: d.qtd_vendas||0, atualizado_em: agora });
    });
    return { registros: mapa.size, dados: Array.from(mapa.values()) };
  } catch (err) { return { registros: 0, erro: err instanceof Error ? err.message : String(err) }; }
}

async function syncMesPorSemanas(supabase: any, ano: number, mes: number) {
  const primeiroDia = new Date(ano, mes, 1);
  const ultimoDia = getUltimoDiaMes(ano, mes);
  const dataArmazenamento = formatDate(ultimoDia);
  const semanas: { inicio: string; fim: string }[] = [];
  let atual = new Date(primeiroDia);
  while (atual <= ultimoDia) {
    const fim = addDays(atual, 6);
    semanas.push({ inicio: formatDate(atual), fim: formatDate(fim > ultimoDia ? ultimoDia : fim) });
    atual = addDays(atual, 7);
  }
  const mapaConsolidado = new Map<string, AgregadoDiario>();
  let erros = 0;
  for (const semana of semanas) {
    const result = await syncPeriodo(supabase, semana.inicio, semana.fim, dataArmazenamento);
    if (result.erro) erros++;
    else if (result.dados) {
      for (const d of result.dados) {
        const key = `${d.cod_empresa}|${d.vendedor}|${d.forma_pagamento}`;
        const ex = mapaConsolidado.get(key);
        if (ex) { ex.total_vendido += d.total_vendido; ex.total_bruto += d.total_bruto; ex.total_desconto += d.total_desconto; ex.qtd_vendas += d.qtd_vendas; }
        else mapaConsolidado.set(key, { ...d });
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }
  if (mapaConsolidado.size > 0) {
    const agregados = Array.from(mapaConsolidado.values());
    await supabase.from('vendas_agregado_diario').delete().eq('data', dataArmazenamento);
    const { error } = await supabase.from('vendas_agregado_diario').upsert(agregados, { onConflict: 'data,cod_empresa,vendedor,forma_pagamento', ignoreDuplicates: false });
    if (error) erros++;
  }
  return { registros: mapaConsolidado.size, erros };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  
  try {
    // E0.3: Auth guard — admin only
    await authGuard(req, { requiredRole: "admin" });

    const url = new URL(req.url);
    const hoje = new Date();
    const ano = parseInt(url.searchParams.get('ano') || String(hoje.getFullYear()), 10);
    const mes = parseInt(url.searchParams.get('mes') || String(hoje.getMonth() + 1), 10) - 1;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const result = await syncMesPorSemanas(supabase, ano, mes);
    return new Response(JSON.stringify({
      success: result.erros === 0, mes: mes + 1, ano,
      dataArmazenada: formatDate(getUltimoDiaMes(ano, mes)),
      registros: result.registros, erros: result.erros,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
