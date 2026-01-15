// src/services/agregadosService.ts
// Service para buscar dados agregados do Supabase (cache local)
// COMPATÍVEL COM DADOS MENSAIS E DIÁRIOS
// COM POLÍTICA DE DADOS FECHADOS

import { supabase } from "@/integrations/supabase/client";
import { EmpresaParam } from "./firebirdBridge";

// ============================================
// TIPOS E INTERFACES
// ============================================

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

// Interface para diagnóstico de cache
export interface CacheDiagnostico {
  cacheHit: boolean;
  fonte: 'cache_mensal' | 'cache_diario' | 'firebird' | 'nenhum';
  periodoFechado: boolean;
  mesesFechados: string[];
  mesAberto: string | null;
  cobertura: number;
  registros: number;
  tempoMs: number;
  mensagem: string;
}

export interface InfoCache {
  tipo: 'diario' | 'mensal' | 'vazio';
  ultimaData: string | null;
  totalRegistros: number;
  mesesDisponiveis: string[];
  mesesFaltando: string[];
}

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

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
 * Verifica se um período contém APENAS meses fechados (anteriores ao mês atual)
 * Meses fechados = meses completos do passado (não o mês atual)
 */
export function isPeriodoFechado(dataInicio: string, dataFim: string): boolean {
  const hoje = new Date();
  const mesAtual = hoje.getMonth();
  const anoAtual = hoje.getFullYear();
  
  const fim = new Date(dataFim + 'T12:00:00');
  const mesFim = fim.getMonth();
  const anoFim = fim.getFullYear();
  
  // Se o dataFim é anterior ao mês atual, o período é fechado
  if (anoFim < anoAtual) return true;
  if (anoFim === anoAtual && mesFim < mesAtual) return true;
  
  return false;
}

/**
 * Separa um período em meses fechados e mês aberto
 */
export function separarPeriodo(dataInicio: string, dataFim: string): {
  mesesFechados: string[];  // Últimos dias de cada mês fechado
  mesAberto: { inicio: string; fim: string } | null;
  todosFechados: boolean;
} {
  const hoje = new Date();
  const mesAtual = hoje.getMonth();
  const anoAtual = hoje.getFullYear();
  
  const inicio = new Date(dataInicio + 'T12:00:00');
  const fim = new Date(dataFim + 'T12:00:00');
  
  const mesesFechados: string[] = [];
  let mesAberto: { inicio: string; fim: string } | null = null;
  
  let ano = inicio.getFullYear();
  let mes = inicio.getMonth();
  
  while (ano < fim.getFullYear() || (ano === fim.getFullYear() && mes <= fim.getMonth())) {
    const isMesAtual = ano === anoAtual && mes === mesAtual;
    const ultimoDia = getUltimoDiaMes(ano, mes);
    
    if (isMesAtual || (ano === anoAtual && mes > mesAtual) || ano > anoAtual) {
      // Mês atual ou futuro = aberto
      if (!mesAberto) {
        const primeiroDia = new Date(ano, mes, 1).toISOString().split('T')[0];
        mesAberto = {
          inicio: dataInicio > primeiroDia ? dataInicio : primeiroDia,
          fim: dataFim < ultimoDia ? dataFim : ultimoDia,
        };
      }
    } else {
      // Mês passado = fechado
      mesesFechados.push(ultimoDia);
    }
    
    mes++;
    if (mes > 11) {
      mes = 0;
      ano++;
    }
  }
  
  return {
    mesesFechados,
    mesAberto,
    todosFechados: mesAberto === null,
  };
}

/**
 * Expande o range de datas para incluir meses completos
 */
function expandirRangeParaMensal(dataInicio: string, dataFim: string): {
  dataInicio: string;
  dataFim: string;
  mesesAbrangidos: string[];
} {
  const inicio = new Date(dataInicio + 'T12:00:00');
  const fim = new Date(dataFim + 'T12:00:00');
  
  const mesInicioAno = inicio.getFullYear();
  const mesInicioMes = inicio.getMonth();
  const mesFimAno = fim.getFullYear();
  const mesFimMes = fim.getMonth();
  
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
  
  const primeiroMes = new Date(mesInicioAno, mesInicioMes, 1);
  const ultimoMes = new Date(mesFimAno, mesFimMes + 1, 0);
  
  return {
    dataInicio: primeiroMes.toISOString().split('T')[0],
    dataFim: ultimoMes.toISOString().split('T')[0],
    mesesAbrangidos,
  };
}

// ============================================
// FUNÇÕES PRINCIPAIS
// ============================================

/**
 * Busca agregados do Supabase por range de datas
 * COM DIAGNÓSTICO DE CACHE HIT/MISS
 */
export async function getVendasAgregado(
  params: GetVendasAgregadoParams
): Promise<AgregadoFormaPagamento[]> {
  const startTime = performance.now();
  console.log('[agregadosService] Buscando agregados:', params);
  
  // Verificar se período é fechado (pode usar cache 100%)
  const periodoInfo = separarPeriodo(params.dataInicio, params.dataFim);
  console.log('[agregadosService] Análise do período:', {
    mesesFechados: periodoInfo.mesesFechados.length,
    temMesAberto: !!periodoInfo.mesAberto,
    todosFechados: periodoInfo.todosFechados,
  });
  
  // Primeiro tenta buscar dados no range exato (dados diários)
  let query = supabase
    .from('vendas_agregado_diario')
    .select('*')
    .gte('data', params.dataInicio)
    .lte('data', params.dataFim);
  
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
    const tempoMs = Math.round(performance.now() - startTime);
    console.log(`[agregadosService] ✓ CACHE HIT (diário): ${data.length} registros em ${tempoMs}ms`);
    return processarDados(data);
  }
  
  // Se não encontrou dados diários, tenta buscar dados mensais
  console.log('[agregadosService] Cache diário vazio, buscando mensal...');
  
  const rangeMensal = expandirRangeParaMensal(params.dataInicio, params.dataFim);
  
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
    const tempoMs = Math.round(performance.now() - startTime);
    console.log(`[agregadosService] ✗ CACHE MISS: Nenhum dado encontrado (${tempoMs}ms)`);
    return [];
  }
  
  const tempoMs = Math.round(performance.now() - startTime);
  console.log(`[agregadosService] ✓ CACHE HIT (mensal): ${dataMensal.length} registros em ${tempoMs}ms`);
  return processarDados(dataMensal);
}

/**
 * Busca agregados COM DIAGNÓSTICO COMPLETO
 * Retorna dados + informações sobre fonte e cobertura
 */
export async function getVendasAgregadoComDiagnostico(
  params: GetVendasAgregadoParams
): Promise<{ dados: AgregadoFormaPagamento[]; diagnostico: CacheDiagnostico }> {
  const startTime = performance.now();
  const periodoInfo = separarPeriodo(params.dataInicio, params.dataFim);
  
  let diagnostico: CacheDiagnostico = {
    cacheHit: false,
    fonte: 'nenhum',
    periodoFechado: periodoInfo.todosFechados,
    mesesFechados: periodoInfo.mesesFechados,
    mesAberto: periodoInfo.mesAberto ? `${periodoInfo.mesAberto.inicio} a ${periodoInfo.mesAberto.fim}` : null,
    cobertura: 0,
    registros: 0,
    tempoMs: 0,
    mensagem: '',
  };
  
  // Buscar dados
  const dados = await getVendasAgregado(params);
  
  diagnostico.tempoMs = Math.round(performance.now() - startTime);
  diagnostico.registros = dados.length;
  
  if (dados.length > 0) {
    diagnostico.cacheHit = true;
    diagnostico.fonte = periodoInfo.todosFechados ? 'cache_mensal' : 'cache_diario';
    
    // Calcular cobertura
    const diasNoCache = await contarDiasNoCache(params.dataInicio, params.dataFim);
    const totalDias = Math.ceil(
      (new Date(params.dataFim).getTime() - new Date(params.dataInicio).getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;
    diagnostico.cobertura = Math.round((diasNoCache / totalDias) * 100);
    
    diagnostico.mensagem = diagnostico.periodoFechado
      ? `Período fechado: ${dados.length} registros do cache (${diagnostico.tempoMs}ms)`
      : `Cache parcial: ${diagnostico.cobertura}% cobertura (${diagnostico.tempoMs}ms)`;
  } else {
    diagnostico.mensagem = `Cache vazio para período (${diagnostico.tempoMs}ms)`;
  }
  
  return { dados, diagnostico };
}

/**
 * Processa os dados brutos do banco em formato agregado
 */
function processarDados(data: any[]): AgregadoFormaPagamento[] {
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
  
  return Array.from(mapaAgregados.values()).map((item) => ({
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
}

/**
 * Verifica se existem dados para um período (diários ou mensais)
 */
export async function temAgregadosParaPeriodo(
  dataInicio: string,
  dataFim: string
): Promise<boolean> {
  const { count: countDiario, error: erroDiario } = await supabase
    .from('vendas_agregado_diario')
    .select('*', { count: 'exact', head: true })
    .gte('data', dataInicio)
    .lte('data', dataFim);
  
  if (!erroDiario && (countDiario ?? 0) > 0) {
    return true;
  }
  
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
  const { data: dataDiaria, error: erroDiario } = await supabase
    .from('vendas_agregado_diario')
    .select('data')
    .gte('data', dataInicio)
    .lte('data', dataFim);
  
  if (!erroDiario && dataDiaria && dataDiaria.length > 0) {
    const datasUnicas = new Set(dataDiaria.map(d => d.data));
    return datasUnicas.size;
  }
  
  const rangeMensal = expandirRangeParaMensal(dataInicio, dataFim);
  const { data: dataMensal, error: erroMensal } = await supabase
    .from('vendas_agregado_diario')
    .select('data')
    .in('data', rangeMensal.mesesAbrangidos);
  
  if (erroMensal || !dataMensal) {
    return 0;
  }
  
  const mesesUnicos = new Set(dataMensal.map(d => d.data));
  return mesesUnicos.size;
}

/**
 * Retorna informações detalhadas sobre o cache
 */
export async function getInfoCache(): Promise<InfoCache> {
  const { data, error, count } = await supabase
    .from('vendas_agregado_diario')
    .select('data', { count: 'exact' })
    .order('data', { ascending: false })
    .limit(100);
  
  if (error || !data || data.length === 0) {
    return { 
      tipo: 'vazio', 
      ultimaData: null, 
      totalRegistros: 0,
      mesesDisponiveis: [],
      mesesFaltando: [],
    };
  }
  
  // Verificar meses disponíveis
  const datasUnicas = [...new Set(data.map(d => d.data))];
  const todasMensais = datasUnicas.every(d => isUltimoDiaMes(d));
  
  // Calcular meses faltando (últimos 12 meses)
  const hoje = new Date();
  const mesesEsperados: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    mesesEsperados.push(getUltimoDiaMes(d.getFullYear(), d.getMonth()));
  }
  
  const mesesDisponiveis = datasUnicas.filter(d => isUltimoDiaMes(d));
  const mesesFaltando = mesesEsperados.filter(m => !mesesDisponiveis.includes(m));
  
  return {
    tipo: todasMensais ? 'mensal' : 'diario',
    ultimaData: data[0].data,
    totalRegistros: count ?? 0,
    mesesDisponiveis,
    mesesFaltando,
  };
}

/**
 * Diagnóstico completo do cache para debug
 */
export async function diagnosticarCache(): Promise<{
  status: 'ok' | 'parcial' | 'vazio';
  resumo: string;
  detalhes: InfoCache;
  recomendacoes: string[];
}> {
  const info = await getInfoCache();
  
  let status: 'ok' | 'parcial' | 'vazio' = 'vazio';
  let resumo = '';
  const recomendacoes: string[] = [];
  
  if (info.tipo === 'vazio') {
    status = 'vazio';
    resumo = 'Nenhum dado no cache. Sincronização necessária.';
    recomendacoes.push('Execute a sincronização para popular o cache');
  } else if (info.mesesFaltando.length === 0) {
    status = 'ok';
    resumo = `Cache completo: ${info.totalRegistros} registros, última atualização ${info.ultimaData}`;
  } else {
    status = 'parcial';
    resumo = `Cache parcial: ${info.mesesDisponiveis.length} meses disponíveis, ${info.mesesFaltando.length} faltando`;
    recomendacoes.push(`Sincronizar meses faltando: ${info.mesesFaltando.slice(0, 3).join(', ')}...`);
  }
  
  return { status, resumo, detalhes: info, recomendacoes };
}
