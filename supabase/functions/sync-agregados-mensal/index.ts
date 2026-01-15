// supabase/functions/sync-agregados-mensal/index.ts
// Sincroniza agregados MENSAIS de vendas da API Firebird para o Supabase
// USA MICRO-BATCHES DE 1 DIA para evitar timeouts (ultra granular)
// DADOS SÃO ARMAZENADOS NO ÚLTIMO DIA DE CADA MÊS

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FIREBIRD_API_BASE_URL = Deno.env.get('FIREBIRD_API_BASE_URL') || 'https://firebird-bridge-production.up.railway.app';

// Configurações de micro-batches (1 dia por vez para máxima resiliência)
const CONFIG = {
  DIAS_POR_BATCH: 1,           // 1 DIA POR VEZ - ultra granular
  TIMEOUT_BATCH: 15000,        // 15 segundos por dia (mais curto)
  RETRIES_POR_BATCH: 3,        // 3 tentativas por dia
  PAUSA_ENTRE_BATCHES: 300,    // 300ms entre dias (mais rápido)
  PAUSA_ENTRE_MESES: 1000,     // 1 segundo entre meses
};

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

interface AgregadoMensal {
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

/**
 * Formata data como YYYY-MM-DD
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Adiciona dias a uma data
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Retorna o primeiro dia do mês
 */
function getPrimeiroDiaMes(ano: number, mes: number): Date {
  return new Date(ano, mes, 1);
}

/**
 * Retorna o último dia do mês
 */
function getUltimoDiaMes(ano: number, mes: number): Date {
  return new Date(ano, mes + 1, 0);
}

/**
 * Fazer requisição GET à API Railway com retry
 */
async function firebirdGetComRetry(
  path: string, 
  params: Record<string, any> = {}, 
  timeoutMs: number = CONFIG.TIMEOUT_BATCH,
  retries: number = CONFIG.RETRIES_POR_BATCH
): Promise<any> {
  let lastError: Error | null = null;
  
  for (let tentativa = 0; tentativa <= retries; tentativa++) {
    try {
      const url = new URL(path, FIREBIRD_API_BASE_URL);
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      });

      if (tentativa > 0) {
        console.log(`[firebirdGet] Tentativa ${tentativa + 1}/${retries + 1}: ${url.toString()}`);
      } else {
        console.log('[firebirdGet] URL:', url.toString());
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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

      return await res.json();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      
      if (lastError.name === 'AbortError') {
        lastError = new Error(`Timeout após ${timeoutMs / 1000}s`);
      }
      
      if (tentativa < retries) {
        // Espera antes do retry (exponencial)
        const delay = 1000 * (tentativa + 1);
        console.log(`[firebirdGet] Aguardando ${delay}ms antes do retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

/**
 * Sincronizar um mês usando micro-batches de 1 dia (ultra granular)
 */
async function syncMesPorBatches(
  supabase: any,
  ano: number,
  mes: number
): Promise<{ registros: number; batchesOk: number; batchesFalha: number; diasProcessados: string[]; diasFalha: string[]; erro?: string }> {
  const primeiroDia = getPrimeiroDiaMes(ano, mes);
  const ultimoDia = getUltimoDiaMes(ano, mes);
  const dataArmazenamento = formatDate(ultimoDia);
  
  console.log(`[syncMesPorBatches] Iniciando ${mes + 1}/${ano}: ${formatDate(primeiroDia)} a ${dataArmazenamento} (1 dia por vez)`);
  
  // Coletar todos os dados do mês, 1 dia por vez
  const todosOsDados: ResumoFormaPagamento[] = [];
  let batchesOk = 0;
  let batchesFalha = 0;
  const diasProcessados: string[] = [];
  const diasFalha: string[] = [];
  let diaAtual = primeiroDia;
  
  while (diaAtual <= ultimoDia) {
    const dataStr = formatDate(diaAtual);
    
    try {
      // Buscar apenas 1 dia por vez
      const response = await firebirdGetComRetry('/api/v1/vendas/resumo-formas-pagamento', {
        dataInicio: dataStr,
        dataFim: dataStr,
      });
      
      const dados: ResumoFormaPagamento[] = Array.isArray(response) 
        ? response 
        : (response?.data && Array.isArray(response.data) ? response.data : []);
      
      if (dados.length > 0) {
        console.log(`[dia] ${dataStr}: ${dados.length} registros ✓`);
        todosOsDados.push(...dados);
        diasProcessados.push(dataStr);
      } else {
        console.log(`[dia] ${dataStr}: vazio (pode ser domingo/feriado)`);
        diasProcessados.push(dataStr);
      }
      batchesOk++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[dia] ${dataStr}: FALHOU - ${message}`);
      batchesFalha++;
      diasFalha.push(dataStr);
      // Continua para o próximo dia mesmo com erro
    }
    
    // Pausa entre dias (curta)
    await new Promise(resolve => setTimeout(resolve, CONFIG.PAUSA_ENTRE_BATCHES));
    
    // Avança para próximo dia
    diaAtual = addDays(diaAtual, 1);
  }
  
  console.log(`[syncMesPorBatches] ${mes + 1}/${ano}: ${todosOsDados.length} registros coletados (${batchesOk} dias OK, ${batchesFalha} dias falha)`);
  
  if (todosOsDados.length === 0) {
    return { registros: 0, batchesOk, batchesFalha, diasProcessados, diasFalha, erro: batchesFalha > 0 ? 'Alguns dias falharam' : undefined };
  }
  
  // Agregar por empresa + vendedor + forma_pagamento
  const agora = new Date().toISOString();
  const mapaAgregados = new Map<string, AgregadoMensal>();
  
  todosOsDados.forEach((d) => {
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
        data: dataArmazenamento,
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
  console.log(`[syncMesPorBatches] ${dataArmazenamento}: ${agregados.length} agregados únicos`);
  
  // Remove dados antigos deste mês
  const { error: deleteError } = await supabase
    .from('vendas_agregado_diario')
    .delete()
    .eq('data', dataArmazenamento);
  
  if (deleteError) {
    console.warn('[syncMesPorBatches] Aviso ao deletar:', deleteError.message);
  }
  
  // Upsert no Supabase
  const { error } = await supabase
    .from('vendas_agregado_diario')
    .upsert(agregados, {
      onConflict: 'data,cod_empresa,vendedor,forma_pagamento',
      ignoreDuplicates: false,
    });
  
  if (error) {
    console.error(`[syncMesPorBatches] Erro upsert:`, error);
    throw error;
  }
  
  console.log(`[syncMesPorBatches] ${dataArmazenamento}: ${agregados.length} registros salvos`);
  return { registros: agregados.length, batchesOk, batchesFalha, diasProcessados, diasFalha };
}

/**
 * Processar múltiplos meses em background
 */
async function processarMesesBackground(
  supabase: any,
  anoInicio: number,
  mesInicio: number,
  anoFim: number,
  mesFim: number
): Promise<void> {
  console.log(`[background] Processando de ${mesInicio + 1}/${anoInicio} a ${mesFim + 1}/${anoFim}`);
  
  let ano = anoInicio;
  let mes = mesInicio;
  let mesesProcessados = 0;
  let totalRegistros = 0;
  let erros = 0;
  
  while (ano < anoFim || (ano === anoFim && mes <= mesFim)) {
    try {
      const result = await syncMesPorBatches(supabase, ano, mes);
      totalRegistros += result.registros;
      if (result.batchesFalha > 0) erros++;
      
      console.log(`[background] ${mes + 1}/${ano}: ${result.registros} registros (${result.batchesOk} batches OK, ${result.batchesFalha} falhas)`);
    } catch (err) {
      console.error(`[background] Erro fatal ${mes + 1}/${ano}:`, err);
      erros++;
    }
    
    mesesProcessados++;
    
    // Pausa entre meses
    await new Promise(resolve => setTimeout(resolve, CONFIG.PAUSA_ENTRE_MESES));
    
    mes++;
    if (mes > 11) {
      mes = 0;
      ano++;
    }
  }
  
  // Atualizar controle ETL
  const ultimaData = formatDate(getUltimoDiaMes(anoFim, mesFim));
  try {
    await supabase.from('etl_controle').upsert({
      entidade: 'vendas_agregado_mensal',
      ultima_data: ultimaData,
      atualizado_em: new Date().toISOString(),
    }, { onConflict: 'entidade' });
  } catch (err) {
    console.error('[background] Erro etl_controle:', err);
  }
  
  console.log(`[background] Concluído: ${mesesProcessados} meses, ${totalRegistros} registros, ${erros} erros`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const url = new URL(req.url);
    const modoHistorico = url.searchParams.get('historico') === 'true';
    
    // Parâmetros de mês/ano
    const hoje = new Date();
    const anoAtual = hoje.getFullYear();
    const mesAtual = hoje.getMonth();
    
    // Para um único mês
    const ano = parseInt(url.searchParams.get('ano') || String(anoAtual), 10);
    const mes = parseInt(url.searchParams.get('mes') || String(mesAtual + 1), 10) - 1;
    
    // Para histórico
    const anoInicio = parseInt(url.searchParams.get('anoInicio') || String(anoAtual), 10);
    const mesInicio = parseInt(url.searchParams.get('mesInicio') || '1', 10) - 1;
    const anoFim = parseInt(url.searchParams.get('anoFim') || String(anoAtual), 10);
    const mesFim = parseInt(url.searchParams.get('mesFim') || String(mesAtual + 1), 10) - 1;
    
    console.log(`[sync-agregados-mensal] Início - Modo ultra-granular (1 dia por vez, timeout ${CONFIG.TIMEOUT_BATCH}ms)`);
    console.log(`[sync-agregados-mensal] Histórico: ${modoHistorico}`);
    
    // Criar cliente Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    if (modoHistorico) {
      console.log(`[sync-agregados-mensal] Período: ${mesInicio + 1}/${anoInicio} a ${mesFim + 1}/${anoFim}`);
      
      // Processar em background
      // @ts-ignore
      EdgeRuntime.waitUntil(processarMesesBackground(supabase, anoInicio, mesInicio, anoFim, mesFim));
      
      return new Response(
        JSON.stringify({
          success: true,
          modo: 'historico_background_microbatches',
          periodo: `${mesInicio + 1}/${anoInicio} a ${mesFim + 1}/${anoFim}`,
          config: {
            diasPorBatch: CONFIG.DIAS_POR_BATCH,
            timeoutBatch: CONFIG.TIMEOUT_BATCH,
            retriesPorBatch: CONFIG.RETRIES_POR_BATCH,
          },
          message: 'Sincronização com micro-batches iniciada em background.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      console.log(`[sync-agregados-mensal] Mês único: ${mes + 1}/${ano}`);
      
      const result = await syncMesPorBatches(supabase, ano, mes);
      
      return new Response(
        JSON.stringify({
          success: result.batchesFalha === 0,
          modo: 'normal_microbatches',
          mes: mes + 1,
          ano,
          dataArmazenada: formatDate(getUltimoDiaMes(ano, mes)),
          registros: result.registros,
          batchesOk: result.batchesOk,
          batchesFalha: result.batchesFalha,
          erro: result.erro,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[sync-agregados-mensal] Erro fatal:', message);
    
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
