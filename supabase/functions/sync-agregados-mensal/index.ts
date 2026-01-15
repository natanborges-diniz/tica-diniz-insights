// supabase/functions/sync-agregados-mensal/index.ts
// Sincroniza agregados MENSAIS de vendas da API Firebird para o Supabase
// DADOS SÃO ARMAZENADOS NO ÚLTIMO DIA DE CADA MÊS

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

interface AgregadoMensal {
  data: string; // Último dia do mês
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
 * Retorna o primeiro dia do mês
 */
function getPrimeiroDiaMes(ano: number, mes: number): string {
  const d = new Date(ano, mes, 1);
  return d.toISOString().split('T')[0];
}

/**
 * Retorna o último dia do mês
 */
function getUltimoDiaMes(ano: number, mes: number): string {
  const d = new Date(ano, mes + 1, 0);
  return d.toISOString().split('T')[0];
}

/**
 * Fazer requisição GET à API Railway
 */
async function firebirdGet(path: string, params: Record<string, any> = {}, timeoutMs = 90000) {
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

/**
 * Sincronizar um mês específico
 */
async function syncMes(
  supabase: any,
  ano: number,
  mes: number
): Promise<{ registros: number; erro?: string }> {
  const dataInicio = getPrimeiroDiaMes(ano, mes);
  const dataFim = getUltimoDiaMes(ano, mes);
  
  console.log(`[syncMes] Buscando ${dataInicio} a ${dataFim}...`);
  
  try {
    const response = await firebirdGet('/api/v1/vendas/resumo-formas-pagamento', {
      dataInicio,
      dataFim,
      cache: 0,
    }, 90000); // 90 segundos de timeout para mês inteiro
    
    const dados: ResumoFormaPagamento[] = Array.isArray(response) 
      ? response 
      : (response?.data && Array.isArray(response.data) ? response.data : []);
    
    console.log(`[syncMes] ${dataInicio} a ${dataFim}: ${dados.length} registros do Firebird`);
    
    if (dados.length === 0) {
      return { registros: 0 };
    }
    
    const agora = new Date().toISOString();
    
    // Agrupar por empresa + vendedor + forma_pagamento
    const mapaAgregados = new Map<string, AgregadoMensal>();
    
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
          data: dataFim, // Armazena no ÚLTIMO dia do mês
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
    console.log(`[syncMes] ${dataFim}: ${agregados.length} agregados únicos`);
    
    // Primeiro remove dados antigos deste mês
    const { error: deleteError } = await supabase
      .from('vendas_agregado_diario')
      .delete()
      .eq('data', dataFim);
    
    if (deleteError) {
      console.warn('[syncMes] Aviso ao deletar dados antigos:', deleteError.message);
    }
    
    // Upsert no Supabase
    const { error } = await supabase
      .from('vendas_agregado_diario')
      .upsert(agregados, {
        onConflict: 'data,cod_empresa,vendedor,forma_pagamento',
        ignoreDuplicates: false,
      });
    
    if (error) {
      console.error(`[syncMes] Erro upsert:`, error);
      throw error;
    }
    
    console.log(`[syncMes] ${dataFim}: ${agregados.length} registros salvos`);
    return { registros: agregados.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[syncMes] Erro ${dataFim}:`, message);
    return { registros: 0, erro: message };
  }
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
      const result = await syncMes(supabase, ano, mes);
      totalRegistros += result.registros;
      if (result.erro) erros++;
      
      // Pausa de 2s entre meses para não sobrecarregar
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (err) {
      console.error(`[background] Erro ${mes + 1}/${ano}:`, err);
      erros++;
    }
    
    mesesProcessados++;
    mes++;
    if (mes > 11) {
      mes = 0;
      ano++;
    }
  }
  
  // Atualizar controle ETL
  const ultimaData = getUltimoDiaMes(anoFim, mesFim);
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
    const mes = parseInt(url.searchParams.get('mes') || String(mesAtual + 1), 10) - 1; // mes é 0-indexed
    
    // Para histórico
    const anoInicio = parseInt(url.searchParams.get('anoInicio') || String(anoAtual), 10);
    const mesInicio = parseInt(url.searchParams.get('mesInicio') || '1', 10) - 1;
    const anoFim = parseInt(url.searchParams.get('anoFim') || String(anoAtual), 10);
    const mesFim = parseInt(url.searchParams.get('mesFim') || String(mesAtual + 1), 10) - 1;
    
    console.log(`[sync-agregados-mensal] Início`);
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
          modo: 'historico_background',
          periodo: `${mesInicio + 1}/${anoInicio} a ${mesFim + 1}/${anoFim}`,
          message: 'Sincronização mensal iniciada em background.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      console.log(`[sync-agregados-mensal] Mês único: ${mes + 1}/${ano}`);
      
      // Modo síncrono para um único mês
      const result = await syncMes(supabase, ano, mes);
      
      return new Response(
        JSON.stringify({
          success: !result.erro,
          modo: 'normal',
          mes: mes + 1,
          ano,
          dataArmazenada: getUltimoDiaMes(ano, mes),
          registros: result.registros,
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
