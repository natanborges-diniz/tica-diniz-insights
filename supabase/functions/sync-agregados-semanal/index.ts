// supabase/functions/sync-agregados-semanal/index.ts
// Sincroniza agregados SEMANAIS de vendas da API Firebird para o Supabase
// Divide o mês em semanas para evitar timeout

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

/**
 * Retorna o último dia do mês
 */
function getUltimoDiaMes(ano: number, mes: number): Date {
  return new Date(ano, mes + 1, 0);
}

/**
 * Fazer requisição GET à API Railway com timeout curto
 */
async function firebirdGet(path: string, params: Record<string, any> = {}, timeoutMs = 45000) {
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
 * Sincronizar um período específico (data armazenada = último dia do mês)
 */
async function syncPeriodo(
  supabase: any,
  dataInicio: string,
  dataFim: string,
  dataArmazenamento: string // Último dia do mês para consolidar
): Promise<{ registros: number; erro?: string; dados?: AgregadoDiario[] }> {
  console.log(`[syncPeriodo] Buscando ${dataInicio} a ${dataFim} -> armazenar em ${dataArmazenamento}`);
  
  try {
    const response = await firebirdGet('/api/v1/vendas/resumo-formas-pagamento', {
      dataInicio,
      dataFim,
      cache: 0,
    }, 45000); // 45 segundos de timeout
    
    const dados: ResumoFormaPagamento[] = Array.isArray(response) 
      ? response 
      : (response?.data && Array.isArray(response.data) ? response.data : []);
    
    console.log(`[syncPeriodo] ${dataInicio} a ${dataFim}: ${dados.length} registros do Firebird`);
    
    if (dados.length === 0) {
      return { registros: 0, dados: [] };
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
          data: dataArmazenamento, // Armazena no último dia do mês
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
    
    return { registros: mapaAgregados.size, dados: Array.from(mapaAgregados.values()) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[syncPeriodo] Erro:`, message);
    return { registros: 0, erro: message };
  }
}

/**
 * Sincroniza um mês dividido em semanas
 */
async function syncMesPorSemanas(
  supabase: any,
  ano: number,
  mes: number
): Promise<{ registros: number; erros: number }> {
  const primeiroDia = new Date(ano, mes, 1);
  const ultimoDia = getUltimoDiaMes(ano, mes);
  const dataArmazenamento = formatDate(ultimoDia);
  
  console.log(`[syncMesPorSemanas] Mês ${mes + 1}/${ano}: ${formatDate(primeiroDia)} a ${dataArmazenamento}`);
  
  // Dividir em semanas
  const semanas: { inicio: string; fim: string }[] = [];
  let atual = new Date(primeiroDia);
  
  while (atual <= ultimoDia) {
    const inicioSemana = new Date(atual);
    const fimSemana = addDays(atual, 6);
    
    semanas.push({
      inicio: formatDate(inicioSemana),
      fim: formatDate(fimSemana > ultimoDia ? ultimoDia : fimSemana),
    });
    
    atual = addDays(atual, 7);
  }
  
  console.log(`[syncMesPorSemanas] Dividido em ${semanas.length} semanas`);
  
  // Consolidar todos os dados do mês
  const mapaConsolidado = new Map<string, AgregadoDiario>();
  let erros = 0;
  
  for (const semana of semanas) {
    const result = await syncPeriodo(supabase, semana.inicio, semana.fim, dataArmazenamento);
    
    if (result.erro) {
      console.warn(`[syncMesPorSemanas] Erro na semana ${semana.inicio}: ${result.erro}`);
      erros++;
    } else if (result.dados) {
      // Consolidar dados
      for (const d of result.dados) {
        const key = `${d.cod_empresa}|${d.vendedor}|${d.forma_pagamento}`;
        const existing = mapaConsolidado.get(key);
        
        if (existing) {
          existing.total_vendido += d.total_vendido;
          existing.total_bruto += d.total_bruto;
          existing.total_desconto += d.total_desconto;
          existing.qtd_vendas += d.qtd_vendas;
        } else {
          mapaConsolidado.set(key, { ...d });
        }
      }
    }
    
    // Pausa entre requisições
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Salvar dados consolidados no Supabase
  if (mapaConsolidado.size > 0) {
    const agregados = Array.from(mapaConsolidado.values());
    console.log(`[syncMesPorSemanas] Salvando ${agregados.length} registros consolidados`);
    
    // Primeiro remove dados antigos deste mês
    const { error: deleteError } = await supabase
      .from('vendas_agregado_diario')
      .delete()
      .eq('data', dataArmazenamento);
    
    if (deleteError) {
      console.warn('[syncMesPorSemanas] Aviso ao deletar:', deleteError.message);
    }
    
    // Inserir novos dados
    const { error } = await supabase
      .from('vendas_agregado_diario')
      .upsert(agregados, {
        onConflict: 'data,cod_empresa,vendedor,forma_pagamento',
        ignoreDuplicates: false,
      });
    
    if (error) {
      console.error('[syncMesPorSemanas] Erro upsert:', error);
      erros++;
    } else {
      console.log(`[syncMesPorSemanas] ${agregados.length} registros salvos para ${dataArmazenamento}`);
    }
  }
  
  return { registros: mapaConsolidado.size, erros };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const url = new URL(req.url);
    
    const hoje = new Date();
    const anoAtual = hoje.getFullYear();
    const mesAtual = hoje.getMonth();
    
    const ano = parseInt(url.searchParams.get('ano') || String(anoAtual), 10);
    const mes = parseInt(url.searchParams.get('mes') || String(mesAtual + 1), 10) - 1;
    
    console.log(`[sync-agregados-semanal] Sincronizando ${mes + 1}/${ano} por semanas`);
    
    // Criar cliente Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const result = await syncMesPorSemanas(supabase, ano, mes);
    
    const ultimoDia = getUltimoDiaMes(ano, mes);
    
    return new Response(
      JSON.stringify({
        success: result.erros === 0,
        mes: mes + 1,
        ano,
        dataArmazenada: formatDate(ultimoDia),
        registros: result.registros,
        erros: result.erros,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[sync-agregados-semanal] Erro fatal:', message);
    
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
