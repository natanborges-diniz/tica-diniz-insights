// src/services/agregadosService.ts
// Service para buscar dados agregados do Supabase (cache local)
// COMPATÍVEL COM DADOS MENSAIS E DIÁRIOS

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
 * Verifica se uma data é o último dia do mês (indica dados mensais)
 */
function isUltimoDiaMes(data: string): boolean {
  const d = new Date(data + 'T12:00:00');
  const ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return d.getDate() === ultimoDia;
}

/**
 * Retorna o último dia do mês para uma data
 */
function getUltimoDiaMes(ano: number, mes: number): string {
  const ultimoDia = new Date(ano, mes + 1, 0);
  return ultimoDia.toISOString().split('T')[0];
}

/**
 * Expande o range de datas para incluir meses completos
 * Isso permite que dados mensais (armazenados no último dia de cada mês)
 * sejam encontrados quando o usuário busca qualquer período dentro do mês
 */
function expandirRangeParaMensal(dataInicio: string, dataFim: string): {
  dataInicio: string;
  dataFim: string;
  mesesAbrangidos: string[];
} {
  const inicio = new Date(dataInicio + 'T12:00:00');
  const fim = new Date(dataFim + 'T12:00:00');
  
  // Encontrar o primeiro dia do mês de início
  const mesInicioAno = inicio.getFullYear();
  const mesInicioMes = inicio.getMonth();
  
  // Encontrar o último dia do mês de fim
  const mesFimAno = fim.getFullYear();
  const mesFimMes = fim.getMonth();
  
  // Lista de últimos dias de cada mês no range
  const mesesAbrangidos: string[] = [];
  let ano = mesInicioAno;
  let mes = mesInicioMes;
  
  while (ano < mesFimAno || (ano === mesFimAno && mes <= mesFimMes)) {
    mesesAbrangidos.push(getUltimoDiaMes(ano, mes));
    mes++;
    if (mes > 11) {
      mes = 0;
      ano++;
    }
  }
  
  // Para busca no banco, usamos o primeiro dia do primeiro mês
  // até o último dia do último mês
  const primeiroMes = new Date(mesInicioAno, mesInicioMes, 1);
  const ultimoMes = new Date(mesFimAno, mesFimMes + 1, 0);
  
  return {
    dataInicio: primeiroMes.toISOString().split('T')[0],
    dataFim: ultimoMes.toISOString().split('T')[0],
    mesesAbrangidos,
  };
}

/**
 * Busca agregados do Supabase por range de datas
 * COMPATÍVEL COM DADOS MENSAIS E DIÁRIOS
 * 
 * Estratégia:
 * 1. Primeiro busca dados diários no range exato
 * 2. Se não encontrar, expande para range mensal e busca dados mensais
 * 3. Se encontrar dados mensais, retorna esses dados
 */
export async function getVendasAgregado(
  params: GetVendasAgregadoParams
): Promise<AgregadoFormaPagamento[]> {
  console.log('[agregadosService] Buscando agregados:', params);
  
  // Primeiro tenta buscar dados no range exato (dados diários)
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
  
  // Se encontrou dados diários, usa esses
  if (data && data.length > 0) {
    console.log(`[agregadosService] Encontrados ${data.length} registros diários`);
    return processarDados(data);
  }
  
  // Se não encontrou dados diários, tenta buscar dados mensais
  console.log('[agregadosService] Nenhum dado diário, buscando dados mensais...');
  
  const rangeMensal = expandirRangeParaMensal(params.dataInicio, params.dataFim);
  console.log(`[agregadosService] Range mensal expandido: ${rangeMensal.dataInicio} a ${rangeMensal.dataFim}`);
  console.log(`[agregadosService] Meses abrangidos (últimos dias): ${rangeMensal.mesesAbrangidos.join(', ')}`);
  
  // Buscar dados nos últimos dias de cada mês (onde ficam os dados mensais)
  let queryMensal = supabase
    .from('vendas_agregado_diario')
    .select('*')
    .in('data', rangeMensal.mesesAbrangidos);
  
  if (params.empresa !== 'ALL') {
    const codEmpresa = typeof params.empresa === 'string' 
      ? parseInt(params.empresa, 10) 
      : params.empresa;
    queryMensal = queryMensal.eq('cod_empresa', codEmpresa);
  }
  
  const { data: dataMensal, error: errorMensal } = await queryMensal;
  
  if (errorMensal) {
    console.error('[agregadosService] Erro ao buscar agregados mensais:', errorMensal);
    return [];
  }
  
  if (!dataMensal || dataMensal.length === 0) {
    console.log('[agregadosService] Nenhum agregado mensal encontrado para o período');
    return [];
  }
  
  console.log(`[agregadosService] Encontrados ${dataMensal.length} registros mensais`);
  return processarDados(dataMensal);
}

/**
 * Processa os dados brutos do banco em formato agregado
 */
function processarDados(data: any[]): AgregadoFormaPagamento[] {
  // Agregar por empresa + vendedor + forma_pagamento (somar valores de diferentes dias/meses)
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
 * Verifica se existem dados para um período (diários ou mensais)
 */
export async function temAgregadosParaPeriodo(
  dataInicio: string,
  dataFim: string
): Promise<boolean> {
  // Primeiro verifica diários
  const { count: countDiario, error: erroDiario } = await supabase
    .from('vendas_agregado_diario')
    .select('*', { count: 'exact', head: true })
    .gte('data', dataInicio)
    .lte('data', dataFim);
  
  if (!erroDiario && (countDiario ?? 0) > 0) {
    return true;
  }
  
  // Se não tem diários, verifica mensais
  const rangeMensal = expandirRangeParaMensal(dataInicio, dataFim);
  const { count: countMensal, error: erroMensal } = await supabase
    .from('vendas_agregado_diario')
    .select('*', { count: 'exact', head: true })
    .in('data', rangeMensal.mesesAbrangidos);
  
  if (erroMensal) {
    console.error('[agregadosService] Erro ao verificar agregados:', erroMensal);
    return false;
  }
  
  return (countMensal ?? 0) > 0;
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
 * Conta quantos dias/meses estão no cache para um período
 */
export async function contarDiasNoCache(
  dataInicio: string,
  dataFim: string
): Promise<number> {
  // Primeiro conta dados diários
  const { data: dataDiaria, error: erroDiario } = await supabase
    .from('vendas_agregado_diario')
    .select('data')
    .gte('data', dataInicio)
    .lte('data', dataFim);
  
  if (!erroDiario && dataDiaria && dataDiaria.length > 0) {
    const datasUnicas = new Set(dataDiaria.map(d => d.data));
    return datasUnicas.size;
  }
  
  // Se não tem diários, conta mensais
  const rangeMensal = expandirRangeParaMensal(dataInicio, dataFim);
  const { data: dataMensal, error: erroMensal } = await supabase
    .from('vendas_agregado_diario')
    .select('data')
    .in('data', rangeMensal.mesesAbrangidos);
  
  if (erroMensal || !dataMensal) {
    return 0;
  }
  
  // Para dados mensais, cada registro representa um mês inteiro
  const mesesUnicos = new Set(dataMensal.map(d => d.data));
  return mesesUnicos.size;
}

/**
 * Retorna informações sobre o tipo de dados disponíveis no cache
 */
export async function getInfoCache(): Promise<{
  tipo: 'diario' | 'mensal' | 'vazio';
  ultimaData: string | null;
  totalRegistros: number;
}> {
  const { data, error, count } = await supabase
    .from('vendas_agregado_diario')
    .select('data', { count: 'exact' })
    .order('data', { ascending: false })
    .limit(10);
  
  if (error || !data || data.length === 0) {
    return { tipo: 'vazio', ultimaData: null, totalRegistros: 0 };
  }
  
  // Verificar se os dados são mensais (todas as datas são últimos dias de mês)
  const todasMensais = data.every(d => isUltimoDiaMes(d.data));
  
  return {
    tipo: todasMensais ? 'mensal' : 'diario',
    ultimaData: data[0].data,
    totalRegistros: count ?? 0,
  };
}
