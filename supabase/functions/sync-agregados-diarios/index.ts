// supabase/functions/sync-agregados-diarios/index.ts
// E0.5: Auto-healing — detecta gaps e preenche até D-1 automaticamente
// JWT obrigatório: service_role (cron) ou admin

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authGuard, corsHeaders } from '../_shared/authGuard.ts';

const FIREBIRD_API_BASE_URL = Deno.env.get('FIREBIRD_API_BASE_URL') || 'https://firebird-bridge-production.up.railway.app';
const EMPRESAS_ATIVAS = [1, 2, 4, 6, 9, 13, 14, 15, 16, 17, 18];
const MAX_BACKFILL_DAYS = 60; // Limite de segurança para backfill automático

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

function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatDate(d);
}

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
    console.error(`[syncPeriodo] empresa=${empresaStr} ${dataInicio}~${dataFim}:`, err instanceof Error ? err.message : err);
    return { registros: 0, erro: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Auto-detecta o gap no cache e retorna as datas corretas para backfill.
 * Retorna null se cache já está atualizado.
 */
async function detectarGap(supabase: any): Promise<{ dataInicio: string; dataFim: string; diasGap: number } | null> {
  const ontem = getYesterday();
  
  const { data, error } = await supabase
    .from('vendas_agregado_diario')
    .select('data')
    .order('data', { ascending: false })
    .limit(1);
  
  if (error) {
    console.error('[detectarGap] Erro ao consultar cache:', error.message);
    // Se não consegue ler, assume 30 dias de backfill
    const inicio = new Date();
    inicio.setDate(inicio.getDate() - 30);
    return { dataInicio: formatDate(inicio), dataFim: ontem, diasGap: 30 };
  }
  
  if (!data || data.length === 0) {
    // Cache vazio — backfill últimos MAX_BACKFILL_DAYS dias
    const inicio = new Date();
    inicio.setDate(inicio.getDate() - MAX_BACKFILL_DAYS);
    console.log(`[detectarGap] Cache vazio. Backfill ${MAX_BACKFILL_DAYS} dias.`);
    return { dataInicio: formatDate(inicio), dataFim: ontem, diasGap: MAX_BACKFILL_DAYS };
  }
  
  const ultimaData = data[0].data; // YYYY-MM-DD
  const ultimaDate = new Date(ultimaData + 'T12:00:00');
  const ontemDate = new Date(ontem + 'T12:00:00');
  
  const diffMs = ontemDate.getTime() - ultimaDate.getTime();
  const diasGap = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  
  if (diasGap <= 0) {
    console.log(`[detectarGap] Cache atualizado até ${ultimaData}. Nenhum gap.`);
    return null;
  }
  
  // Limitar backfill
  const diasEfetivos = Math.min(diasGap, MAX_BACKFILL_DAYS);
  const dataInicio = formatDate(addDays(ultimaDate, 1));
  
  console.log(`[detectarGap] Gap detectado: ${ultimaData} → ${ontem} (${diasGap} dias, sincronizando ${diasEfetivos})`);
  
  return { dataInicio, dataFim: ontem, diasGap: diasEfetivos };
}

async function processarTodasEmpresasBackground(supabase: any, dataInicio: string, dataFim: string) {
  let totalRegistros = 0;
  let totalErros = 0;
  
  for (const empresa of EMPRESAS_ATIVAS) {
    let currentStart = new Date(dataInicio + 'T12:00:00');
    const endDate = new Date(dataFim + 'T12:00:00');
    
    while (currentStart <= endDate) {
      let currentEnd = addDays(currentStart, 6); // Janelas de 7 dias
      if (currentEnd > endDate) currentEnd = endDate;
      
      try {
        const result = await syncPeriodo(supabase, formatDate(currentStart), formatDate(currentEnd), empresa);
        totalRegistros += result.registros;
        if (result.erro) totalErros++;
        // Throttle entre janelas
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (err) {
        console.error(`[background] Erro empresa ${empresa}:`, err);
        totalErros++;
      }
      currentStart = addDays(currentEnd, 1);
    }
    // Throttle entre empresas
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Atualizar etl_controle com resultado
  try {
    await supabase.from('etl_controle').upsert({
      entidade: 'vendas_agregado_diario',
      ultima_data: dataFim,
      atualizado_em: new Date().toISOString(),
    }, { onConflict: 'entidade' });
    
    console.log(`[background] Concluído: ${totalRegistros} registros, ${totalErros} erros, período ${dataInicio}~${dataFim}`);
  } catch (err) {
    console.error('[background] Erro etl_controle:', err);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    // Auth: allow service_role (cron) or admin users
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
      } catch {}
    }
    
    if (!isServiceRole) {
      const result = await authGuard(req, { requiredRole: "admin" });
      userId = result.userId;
    }

    // Parse params from query string + POST body
    const url = new URL(req.url);
    let modoHistorico = url.searchParams.get('historico') === 'true';
    let empresa: string | undefined = url.searchParams.get('empresa') || undefined;
    let dataInicio: string | undefined = url.searchParams.get('dataInicio') || undefined;
    let dataFim: string | undefined = url.searchParams.get('dataFim') || undefined;

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

    console.log(`[sync-agregados-diarios] Triggered by user=${userId}, mode=${modoHistorico ? 'historico' : 'normal'}, empresa=${empresa || 'ALL'}, dates=${dataInicio || 'auto'}~${dataFim || 'auto'}`);
    
    if (modoHistorico) {
      // ===== AUTO-HEALING: detectar gap se datas não foram fornecidas =====
      let syncInicio: string;
      let syncFim: string;
      let autoDetected = false;
      
      if (dataInicio && dataFim) {
        // Datas explícitas — usar como fornecido
        syncInicio = dataInicio;
        syncFim = dataFim;
      } else {
        // Auto-detectar gap no cache
        const gap = await detectarGap(supabase);
        if (!gap) {
          return new Response(JSON.stringify({
            success: true, modo: 'historico_auto', status: 'up_to_date',
            message: 'Cache já está atualizado até D-1. Nenhuma sincronização necessária.',
            triggered_by: userId,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        syncInicio = gap.dataInicio;
        syncFim = gap.dataFim;
        autoDetected = true;
        console.log(`[sync-agregados-diarios] Auto-detected gap: ${syncInicio} → ${syncFim} (${gap.diasGap} dias)`);
      }

      // @ts-ignore
      EdgeRuntime.waitUntil(processarTodasEmpresasBackground(supabase, syncInicio, syncFim));

      await supabase.from('etl_controle').upsert({
        entidade: 'sync_log_diario', ultima_data: formatDate(new Date()),
        pagina_atual: 0, atualizado_em: new Date().toISOString(),
      }, { onConflict: 'entidade' });

      return new Response(JSON.stringify({
        success: true, modo: autoDetected ? 'historico_auto' : 'historico_manual',
        periodo: `${syncInicio} a ${syncFim}`,
        empresas: EMPRESAS_ATIVAS, triggered_by: userId,
        auto_detected: autoDetected,
        message: `Sincronização iniciada em background para ${syncInicio} ~ ${syncFim}.`,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } else {
      if (!empresa) {
        return new Response(JSON.stringify({
          success: false, error: 'Parâmetro empresa é obrigatório no modo normal.',
          empresas_disponiveis: EMPRESAS_ATIVAS,
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const syncDataInicio = dataInicio || formatDate(new Date());
      const syncDataFim = dataFim || formatDate(new Date());
      const result = await syncPeriodo(supabase, syncDataInicio, syncDataFim, empresa);
      return new Response(JSON.stringify({
        success: !result.erro, modo: 'normal', periodo: `${syncDataInicio} a ${syncDataFim}`,
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
