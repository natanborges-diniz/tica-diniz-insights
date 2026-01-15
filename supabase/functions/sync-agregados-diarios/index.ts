// supabase/functions/sync-agregados-diarios/index.ts
// Sincroniza agregados DIÁRIOS de vendas da API Firebird para o Supabase
// VERSÃO SIMPLIFICADA: Um dia por vez, sem complexidade

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FIREBIRD_API_BASE_URL = Deno.env.get('FIREBIRD_API_BASE_URL') || 'https://firebird-bridge-production.up.railway.app';

interface ResumoFormaPagamento {
  empresa: string;
  empresa_cod_logico: number;
  vendedor: string;
  formapagamento: string;
  totalgeral: number;
  qtd_vendas: number;
  total_bruto: number;
  total_desconto: number;
  perc_desconto: number;
}

interface AgregadoDiario {
  data: string;
  cod_empresa: number;
  vendedor: string;
  forma_pagamento: string;
  total_vendido: number;
  total_bruto: number;
  total_desconto: number;
  qtd_vendas: number;
  atualizado_em: string;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Fazer requisição GET à API Railway
async function firebirdGet(path: string, params: Record<string, any> = {}, timeoutMs = 60000) {
  const url = new URL(path, FIREBIRD_API_BASE_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });

  console.log('[firebirdGet] URL:', url.toString());

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const body = await res.text();
      console.error('[firebirdGet] Erro:', res.status, body.slice(0, 300));
      throw new Error(`Erro Firebird: ${res.status}`);
    }

    return res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Timeout após ${timeoutMs / 1000}s`);
    }
    throw err;
  }
}

// Sincronizar um dia específico
async function syncDia(
  supabase: any,
  data: string
): Promise<{ registros: number; erro?: string }> {
  console.log(`[syncDia] Buscando ${data}...`);
  
  try {
    const response = await firebirdGet('/api/v1/vendas/resumo-formas-pagamento', {
      dataInicio: data,
      dataFim: data,
      cache: 0,
    }, 60000);
    
    const dados: ResumoFormaPagamento[] = Array.isArray(response) 
      ? response 
      : (response?.data && Array.isArray(response.data) ? response.data : []);
    
    console.log(`[syncDia] ${data}: ${dados.length} registros do Firebird`);
    
    if (dados.length === 0) {
      return { registros: 0 };
    }
    
    const agora = new Date().toISOString();
    
    // Agrupar por empresa + vendedor + forma_pagamento
    const mapaAgregados = new Map<string, AgregadoDiario>();
    
    dados.forEach((d) => {
      const vendedor = (d.vendedor || '').trim();
      const formaPagamento = d.formapagamento || '';
      const key = `${d.empresa_cod_logico}|${vendedor}|${formaPagamento}`;
      
      const existing = mapaAgregados.get(key);
      if (existing) {
        existing.total_vendido += d.totalgeral || 0;
        existing.total_bruto += d.total_bruto || 0;
        existing.total_desconto += d.total_desconto || 0;
        existing.qtd_vendas += d.qtd_vendas || 0;
      } else {
        mapaAgregados.set(key, {
          data,
          cod_empresa: d.empresa_cod_logico,
          vendedor,
          forma_pagamento: formaPagamento,
          total_vendido: d.totalgeral || 0,
          total_bruto: d.total_bruto || 0,
          total_desconto: d.total_desconto || 0,
          qtd_vendas: d.qtd_vendas || 0,
          atualizado_em: agora,
        });
      }
    });
    
    const agregados = Array.from(mapaAgregados.values());
    console.log(`[syncDia] ${data}: ${agregados.length} agregados únicos`);
    
    // Upsert no Supabase
    const { error } = await supabase
      .from('vendas_agregado_diario')
      .upsert(agregados, {
        onConflict: 'data,cod_empresa,vendedor,forma_pagamento',
        ignoreDuplicates: false,
      });
    
    if (error) {
      console.error(`[syncDia] Erro upsert:`, error);
      throw error;
    }
    
    console.log(`[syncDia] ${data}: ${agregados.length} registros salvos`);
    return { registros: agregados.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[syncDia] Erro ${data}:`, message);
    return { registros: 0, erro: message };
  }
}

// Processar múltiplos dias em background
async function processarDiasBackground(
  supabase: any,
  dataInicio: string,
  dataFim: string,
  maxDias: number
): Promise<void> {
  console.log(`[background] Processando ${dataInicio} a ${dataFim} (max ${maxDias} dias)`);
  
  let currentDate = new Date(dataInicio + 'T12:00:00');
  const endDate = new Date(dataFim + 'T12:00:00');
  let diasProcessados = 0;
  let totalRegistros = 0;
  let erros = 0;
  
  while (currentDate <= endDate && diasProcessados < maxDias) {
    const dataStr = formatDate(currentDate);
    
    try {
      const result = await syncDia(supabase, dataStr);
      totalRegistros += result.registros;
      if (result.erro) erros++;
      
      // Pausa entre requisições
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (err) {
      console.error(`[background] Erro ${dataStr}:`, err);
      erros++;
    }
    
    diasProcessados++;
    currentDate = addDays(currentDate, 1);
  }
  
  // Atualizar controle ETL
  const ultimaData = formatDate(addDays(currentDate, -1));
  try {
    await supabase.from('etl_controle').upsert({
      entidade: 'vendas_agregado_diario',
      ultima_data: ultimaData,
      atualizado_em: new Date().toISOString(),
    }, { onConflict: 'entidade' });
  } catch (err) {
    console.error('[background] Erro etl_controle:', err);
  }
  
  console.log(`[background] Concluído: ${diasProcessados} dias, ${totalRegistros} registros, ${erros} erros`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const url = new URL(req.url);
    const modoHistorico = url.searchParams.get('historico') === 'true';
    const maxDias = parseInt(url.searchParams.get('maxDias') || '62', 10);
    
    // Parâmetros de data
    const hoje = formatDate(new Date());
    const dataInicio = url.searchParams.get('dataInicio') || hoje;
    const dataFim = url.searchParams.get('dataFim') || hoje;
    
    console.log(`[sync-agregados-diarios] Início`);
    console.log(`[sync-agregados-diarios] Período: ${dataInicio} a ${dataFim}`);
    console.log(`[sync-agregados-diarios] Histórico: ${modoHistorico}, Max dias: ${maxDias}`);
    
    // Criar cliente Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    if (modoHistorico) {
      // Processar em background
      // @ts-ignore
      EdgeRuntime.waitUntil(processarDiasBackground(supabase, dataInicio, dataFim, maxDias));
      
      return new Response(
        JSON.stringify({
          success: true,
          modo: 'historico_background',
          periodo: `${dataInicio} a ${dataFim}`,
          maxDias,
          message: `Sincronização iniciada em background para ${maxDias} dias.`,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Modo síncrono para um único dia
      const result = await syncDia(supabase, dataInicio);
      
      return new Response(
        JSON.stringify({
          success: !result.erro,
          modo: 'normal',
          data: dataInicio,
          registros: result.registros,
          erro: result.erro,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[sync-agregados-diarios] Erro fatal:', message);
    
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
