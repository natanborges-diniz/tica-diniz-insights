// supabase/functions/sync-agregados-diarios/index.ts
// Sincroniza agregados DIÁRIOS de vendas da API Firebird para o Supabase
// VERSÃO CORRIGIDA: Usa endpoint /api/v1/vendas/resumo-formas-pagamento (com rateio correto)
// Deploy v4 - 2026-01-16 - Usando endpoint correto que rateia valores por forma pagamento

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FIREBIRD_API_BASE_URL = Deno.env.get('FIREBIRD_API_BASE_URL') || 'https://firebird-bridge-production.up.railway.app';

// Interface do endpoint resumo-formas-pagamento (correto, com rateio proporcional)
interface ResumoFormaPagamento {
  EMPRESA: string;
  EMPRESA_COD_LOGICO: number;
  EMPRESA_NOME_LOGICO: string;
  VENDEDOR: string;
  FORMAPAGAMENTO: string;
  TOTALGERAL: number;
  QTD_VENDAS: number;
  TOTAL_BRUTO: number;
  TOTAL_DESCONTO: number;
  PERC_DESCONTO: number;
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

// Fazer requisição GET à API Railway com timeout adequado
async function firebirdGet(path: string, params: Record<string, any> = {}, timeoutMs = 30000) {
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

// Sincronizar UM DIA usando endpoint resumo-formas-pagamento (correto, com rateio)
async function syncDia(
  supabase: any,
  data: string,
  empresa?: string
): Promise<{ registros: number; erro?: string }> {
  console.log(`[syncDia] Buscando ${data}${empresa ? ` (empresa ${empresa})` : ''}...`);
  
  try {
    // Usar endpoint correto - resumo-formas-pagamento (com rateio proporcional)
    const params: Record<string, any> = {
      dataInicio: data,
      dataFim: data,
      excluirCreditos: 0, // INCLUIR créditos
      incluirDevolucoes: 1, // INCLUIR devoluções
    };
    
    if (empresa && empresa !== 'ALL') {
      params.empresa = empresa;
    }
    
    const response = await firebirdGet('/api/v1/vendas/resumo-formas-pagamento', params, 60000);
    
    // O endpoint retorna { ok: true, data: [...] }
    const dados: ResumoFormaPagamento[] = response?.data && Array.isArray(response.data) 
      ? response.data 
      : (Array.isArray(response) ? response : []);
    
    console.log(`[syncDia] ${data}: ${dados.length} registros do Firebird`);
    
    if (dados.length === 0) {
      return { registros: 0 };
    }
    
    const agora = new Date().toISOString();
    
    // Converter para formato do cache - usando EMPRESA_COD_LOGICO como cod_empresa
    const agregados: AgregadoDiario[] = dados.map((d) => ({
      data: data, // A data é o parâmetro passado
      cod_empresa: d.EMPRESA_COD_LOGICO,
      vendedor: (d.VENDEDOR || '').trim() || 'DESCONHECIDO',
      forma_pagamento: (d.FORMAPAGAMENTO || '').trim() || 'OUTROS',
      total_vendido: d.TOTALGERAL || 0,
      total_bruto: d.TOTAL_BRUTO || 0,
      total_desconto: d.TOTAL_DESCONTO || 0,
      qtd_vendas: d.QTD_VENDAS || 0,
      atualizado_em: agora,
    }));
    
    console.log(`[syncDia] ${agregados.length} agregados para salvar`);
    
    // Deletar dados existentes para este dia (para evitar duplicações)
    const { error: deleteError } = await supabase
      .from('vendas_agregado_diario')
      .delete()
      .eq('data', data);
    
    if (deleteError) {
      console.warn(`[syncDia] Aviso ao deletar dados antigos: ${deleteError.message}`);
    }
    
    // Inserir novos dados em lotes de 500
    const batchSize = 500;
    let totalSalvos = 0;
    
    for (let i = 0; i < agregados.length; i += batchSize) {
      const batch = agregados.slice(i, i + batchSize);
      
      const { error } = await supabase
        .from('vendas_agregado_diario')
        .insert(batch);
      
      if (error) {
        console.error(`[syncDia] Erro insert batch ${i}:`, error);
        throw error;
      }
      
      totalSalvos += batch.length;
    }
    
    console.log(`[syncDia] ${totalSalvos} registros salvos com sucesso`);
    return { registros: totalSalvos };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[syncDia] Erro:`, message);
    return { registros: 0, erro: message };
  }
}

// Sincronizar período chamando syncDia para cada dia
async function syncPeriodo(
  supabase: any,
  dataInicio: string,
  dataFim: string,
  empresa?: string
): Promise<{ registros: number; erro?: string }> {
  console.log(`[syncPeriodo] Sincronizando ${dataInicio} a ${dataFim}...`);
  
  let totalRegistros = 0;
  let ultimoErro: string | undefined;
  
  // Gerar lista de datas
  const datas: string[] = [];
  let current = new Date(dataInicio + 'T12:00:00');
  const end = new Date(dataFim + 'T12:00:00');
  
  while (current <= end) {
    datas.push(formatDate(current));
    current = addDays(current, 1);
  }
  
  console.log(`[syncPeriodo] ${datas.length} dias para sincronizar`);
  
  // Processar cada dia sequencialmente (para não sobrecarregar a API)
  for (const data of datas) {
    const resultado = await syncDia(supabase, data, empresa);
    totalRegistros += resultado.registros;
    if (resultado.erro) {
      ultimoErro = resultado.erro;
    }
    
    // Pequeno delay entre dias para não sobrecarregar
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`[syncPeriodo] Total: ${totalRegistros} registros em ${datas.length} dias`);
  return { registros: totalRegistros, erro: ultimoErro };
}

// Processar em blocos semanais em background (para períodos longos)
async function processarSemanasBackground(
  supabase: any,
  dataInicio: string,
  dataFim: string
): Promise<void> {
  console.log(`[background] Processando ${dataInicio} a ${dataFim} em blocos semanais`);
  
  let currentStart = new Date(dataInicio + 'T12:00:00');
  const endDate = new Date(dataFim + 'T12:00:00');
  let totalRegistros = 0;
  let blocos = 0;
  let erros = 0;
  
  while (currentStart <= endDate) {
    // Calcular fim da semana (ou dataFim se for menor)
    let currentEnd = addDays(currentStart, 6);
    if (currentEnd > endDate) {
      currentEnd = endDate;
    }
    
    const inicioStr = formatDate(currentStart);
    const fimStr = formatDate(currentEnd);
    
    try {
      console.log(`[background] Bloco ${blocos + 1}: ${inicioStr} a ${fimStr}`);
      const result = await syncPeriodo(supabase, inicioStr, fimStr);
      totalRegistros += result.registros;
      if (result.erro) erros++;
      
      // Pausa entre blocos
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err) {
      console.error(`[background] Erro bloco ${inicioStr}:`, err);
      erros++;
    }
    
    blocos++;
    currentStart = addDays(currentEnd, 1);
  }
  
  // Atualizar controle ETL
  try {
    await supabase.from('etl_controle').upsert({
      entidade: 'vendas_agregado_diario',
      ultima_data: dataFim,
      atualizado_em: new Date().toISOString(),
    }, { onConflict: 'entidade' });
  } catch (err) {
    console.error('[background] Erro etl_controle:', err);
  }
  
  console.log(`[background] Concluído: ${blocos} blocos, ${totalRegistros} registros, ${erros} erros`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const url = new URL(req.url);
    const modoHistorico = url.searchParams.get('historico') === 'true';
    const empresa = url.searchParams.get('empresa') || undefined;
    
    // Parâmetros de data
    const hoje = formatDate(new Date());
    const dataInicio = url.searchParams.get('dataInicio') || hoje;
    const dataFim = url.searchParams.get('dataFim') || hoje;
    
    console.log(`[sync-agregados-diarios] Início`);
    console.log(`[sync-agregados-diarios] Período: ${dataInicio} a ${dataFim}`);
    console.log(`[sync-agregados-diarios] Histórico: ${modoHistorico}, Empresa: ${empresa || 'TODAS'}`);
    
    // Criar cliente Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    if (modoHistorico) {
      // Processar em background para períodos longos
      // @ts-ignore
      EdgeRuntime.waitUntil(processarSemanasBackground(supabase, dataInicio, dataFim));
      
      return new Response(
        JSON.stringify({
          success: true,
          modo: 'historico_background',
          periodo: `${dataInicio} a ${dataFim}`,
          message: `Sincronização iniciada em background. Processando em blocos semanais.`,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Modo síncrono - busca período inteiro de uma vez
      const result = await syncPeriodo(supabase, dataInicio, dataFim, empresa);
      
      return new Response(
        JSON.stringify({
          success: !result.erro,
          modo: 'normal',
          periodo: `${dataInicio} a ${dataFim}`,
          empresa: empresa || 'TODAS',
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
