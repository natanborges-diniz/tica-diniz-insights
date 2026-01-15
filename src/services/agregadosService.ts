// src/services/agregadosService.ts
// Service para buscar dados agregados do Supabase (cache local)
// VERSÃO SIMPLIFICADA: Dados são armazenados como DIÁRIOS

import { supabase } from "@/integrations/supabase/client";
import { EmpresaParam } from "./firebirdBridge";

// Interface agregada por forma de pagamento
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
 * Busca agregados do Supabase por range de datas
 * LÓGICA SIMPLES: WHERE data BETWEEN dataInicio AND dataFim
 */
export async function getVendasAgregado(
  params: GetVendasAgregadoParams
): Promise<AgregadoFormaPagamento[]> {
  console.log('[agregadosService] Buscando agregados:', params);
  
  let query = supabase
    .from('vendas_agregado_diario')
    .select('*')
    .gte('data', params.dataInicio)
    .lte('data', params.dataFim);
  
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
    console.log('[agregadosService] Nenhum agregado encontrado para o período');
    return [];
  }
  
  console.log(`[agregadosService] Encontrados ${data.length} registros brutos`);
  
  // Agregar por empresa + vendedor + forma_pagamento (somar valores de diferentes dias)
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
 * Verifica se existem dados para um período
 */
export async function temAgregadosParaPeriodo(
  dataInicio: string,
  dataFim: string
): Promise<boolean> {
  const { count, error } = await supabase
    .from('vendas_agregado_diario')
    .select('*', { count: 'exact', head: true })
    .gte('data', dataInicio)
    .lte('data', dataFim);
  
  if (error) {
    console.error('[agregadosService] Erro ao verificar agregados:', error);
    return false;
  }
  
  return (count ?? 0) > 0;
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

/**
 * Conta quantos dias estão no cache para um período
 */
export async function contarDiasNoCache(
  dataInicio: string,
  dataFim: string
): Promise<number> {
  const { data, error } = await supabase
    .from('vendas_agregado_diario')
    .select('data')
    .gte('data', dataInicio)
    .lte('data', dataFim);
  
  if (error || !data) {
    return 0;
  }
  
  // Contar datas únicas
  const datasUnicas = new Set(data.map(d => d.data));
  return datasUnicas.size;
}
