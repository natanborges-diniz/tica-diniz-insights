// src/services/agregadosService.ts
// Service para buscar dados agregados do Supabase (cache local)
// NOTA: Os dados são armazenados como agregados MENSAIS (último dia do mês)

import { supabase } from "@/integrations/supabase/client";
import { EmpresaParam } from "./firebirdBridge";

// Interface para agregado diário do Supabase
export interface VendasAgregadoDiario {
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

// Interface agregada por forma de pagamento (compatível com ResumoFormaPagamento)
export interface AgregadoFormaPagamento {
  codEmpresa: number;
  empresa: string;
  vendedor: string;
  formaPagamento: string;
  totalGeral: number;
  qtdVendas: number;
  totalBruto: number;
  totalDesconto: number;
  percentualDesconto: number;
}

export interface GetVendasAgregadoParams {
  empresa: EmpresaParam;
  dataInicio: string;
  dataFim: string;
}

/**
 * Busca TODAS as datas de referência no cache que correspondem ao período solicitado
 * Os dados podem estar como último dia do mês OU como datas específicas (ex: 2026-01-12)
 */
async function getDatasNoCache(dataInicio: string, dataFim: string): Promise<string[]> {
  // Buscar todas as datas únicas no cache
  const { data, error } = await supabase
    .from('vendas_agregado_diario')
    .select('data')
    .order('data', { ascending: true });
  
  if (error || !data) {
    console.error('[agregadosService] Erro ao buscar datas do cache:', error);
    return [];
  }
  
  // Datas únicas
  const datasUnicas = [...new Set(data.map(d => d.data))];
  
  // Filtrar datas que correspondem ao período
  const inicio = new Date(dataInicio + 'T00:00:00');
  const fim = new Date(dataFim + 'T23:59:59');
  
  const datasNoRange = datasUnicas.filter(dataStr => {
    const dataCache = new Date(dataStr + 'T12:00:00');
    
    // Se é último dia do mês (dados mensais), verificar se o mês se sobrepõe ao período
    const ultimoDiaMes = new Date(dataCache.getFullYear(), dataCache.getMonth() + 1, 0);
    const primeiroDiaMes = new Date(dataCache.getFullYear(), dataCache.getMonth(), 1);
    
    // Verificar se é uma data de "último dia do mês"
    const isUltimoDiaMes = dataCache.getDate() === ultimoDiaMes.getDate();
    
    if (isUltimoDiaMes) {
      // Dados mensais: incluir se qualquer dia do mês se sobrepõe ao período
      return primeiroDiaMes <= fim && ultimoDiaMes >= inicio;
    } else {
      // Dados diários: incluir se a data está dentro do período
      return dataCache >= inicio && dataCache <= fim;
    }
  });
  
  console.log(`[agregadosService] Datas no cache para ${dataInicio} a ${dataFim}:`, datasNoRange);
  return datasNoRange;
}

/**
 * Busca agregados do Supabase (cache local, super rápido!)
 * NOTA: Os dados são mensais, então buscamos pelos meses no período
 */
export async function getVendasAgregado(
  params: GetVendasAgregadoParams
): Promise<AgregadoFormaPagamento[]> {
  console.log('[agregadosService] Buscando agregados do Supabase:', params);
  
  // Obter as datas de referência no período solicitado
  const datasRef = await getDatasNoCache(params.dataInicio, params.dataFim);
  
  if (datasRef.length === 0) {
    console.log('[agregadosService] Nenhuma data no range');
    return [];
  }
  
  let query = supabase
    .from('vendas_agregado_diario')
    .select('*')
    .in('data', datasRef);
  
  // Filtrar por empresa se não for 'ALL'
  if (params.empresa !== 'ALL') {
    const codEmpresa = typeof params.empresa === 'string' 
      ? parseInt(params.empresa, 10) 
      : params.empresa;
    query = query.eq('cod_empresa', codEmpresa);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('[agregadosService] Erro ao buscar agregados:', error);
    throw new Error(`Erro ao buscar agregados: ${error.message}`);
  }
  
  if (!data || data.length === 0) {
    console.log('[agregadosService] Nenhum agregado encontrado para as datas:', datasRef);
    return [];
  }
  
  console.log(`[agregadosService] Encontrados ${data.length} registros brutos`);
  
  // Agregar por empresa + vendedor + forma_pagamento (somar valores de diferentes meses)
  const mapaAgregados = new Map<string, {
    codEmpresa: number;
    vendedor: string;
    formaPagamento: string;
    totalVendido: number;
    totalBruto: number;
    totalDesconto: number;
    qtdVendas: number;
  }>();
  
  data.forEach((d) => {
    const key = `${d.cod_empresa}|${d.vendedor}|${d.forma_pagamento}`;
    const existing = mapaAgregados.get(key);
    
    if (existing) {
      existing.totalVendido += Number(d.total_vendido) || 0;
      existing.totalBruto += Number(d.total_bruto) || 0;
      existing.totalDesconto += Number(d.total_desconto) || 0;
      existing.qtdVendas += Number(d.qtd_vendas) || 0;
    } else {
      mapaAgregados.set(key, {
        codEmpresa: d.cod_empresa,
        vendedor: d.vendedor,
        formaPagamento: d.forma_pagamento,
        totalVendido: Number(d.total_vendido) || 0,
        totalBruto: Number(d.total_bruto) || 0,
        totalDesconto: Number(d.total_desconto) || 0,
        qtdVendas: Number(d.qtd_vendas) || 0,
      });
    }
  });
  
  // Converter para array no formato esperado
  const resultado = Array.from(mapaAgregados.values()).map((item) => ({
    codEmpresa: item.codEmpresa,
    empresa: String(item.codEmpresa),
    vendedor: item.vendedor,
    formaPagamento: item.formaPagamento,
    totalGeral: item.totalVendido,
    qtdVendas: item.qtdVendas,
    totalBruto: item.totalBruto,
    totalDesconto: item.totalDesconto,
    percentualDesconto: item.totalBruto > 0 
      ? (item.totalDesconto / item.totalBruto) * 100 
      : 0,
  }));
  
  console.log(`[agregadosService] Retornando ${resultado.length} registros agregados`);
  
  return resultado;
}

/**
 * Verifica se existem agregados para um período
 */
export async function temAgregadosParaPeriodo(
  dataInicio: string,
  dataFim: string
): Promise<boolean> {
  const datasRef = await getDatasNoCache(dataInicio, dataFim);
  
  if (datasRef.length === 0) return false;
  
  return datasRef.length > 0;
}

/**
 * Retorna a última data sincronizada
 */
export async function getUltimaDataSincronizada(): Promise<string | null> {
  const { data, error } = await supabase
    .from('vendas_agregado_diario')
    .select('data')
    .order('data', { ascending: false })
    .limit(1);
  
  if (error || !data || data.length === 0) {
    return null;
  }
  
  return data[0].data;
}
