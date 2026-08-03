// src/hooks/useVendasDashboard.ts
// Hook para dashboard de vendas - VERSÃO CACHE-FIRST
// Estratégia:
//   1. Buscar cache Supabase IMEDIATAMENTE (vendas_agregado_diario)
//   2. Disparar Firebird em background para atualizar os dados
//   3. Se Firebird retornar, sobrescrever cache e atualizar UI
//   4. Se Firebird falhar, manter os dados do cache (transparente)

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  ResumoFormaPagamento,
  ResumoEmpresaVendedor as ResumoEmpresaVendedorAPI,
} from "@/services/vendasService";
import { EmpresaParam, aplicarFiltroEmpresaSupabase } from "@/services/firebirdBridge";
import { isCredito, isDevolucao, calcularTicketMedio } from "@/lib/vendas/formaPagamento";
import { codLojaLogico, nomeLojaLogico } from "@/lib/metas/lojas";
import { getPeriodoComercial, formatLocalDate, diffInDays } from "@/utils/dateValidation";
import { supabase } from "@/integrations/supabase/client";
import { useDefaultEmpresa } from "./useDefaultEmpresa";
import { agoraSP } from "@/lib/datetime";

// Tipo para progresso (mantido para compatibilidade com UI)
export interface ProgressoPaginacao {
  paginaAtual: number;
  totalEstimado: number;
  registrosCarregados: number;
  concluido: boolean;
}

export type ViewMode = "loja" | "vendedor";

// CONFIGURAÇÕES
const CONFIG = {
  /** Limite máximo de dias para alertar o usuário */
  LIMITE_DIAS_ALERTA: 45,
  /** Limite máximo de dias permitido */
  LIMITE_DIAS_MAXIMO: 90,
  /** Debounce de filtros em ms */
  DEBOUNCE_MS: 600,
};

export interface VendasFiltersState {
  dataInicio: string;
  dataFim: string;
  viewMode: ViewMode;
  empresa: EmpresaParam;
}

export interface VendasMetrics {
  totalVendido: number;
  totalCreditos: number;
  totalDevolucoes: number;
  totalVendidoSemCreditos: number;
  qtdTransacoes: number;
  ticketMedio: number;
  totalBruto: number;
  totalDesconto: number;
  percentualDesconto: number;
  descontoDisponivel: boolean;
}

export interface ProjecaoFechamento {
  temProjecao: boolean;
  diasTotais: number;
  diasDecorridos: number;
  diasRestantes: number;
  mediaDiaria: number;
  projecaoFechamento: number;
  percentualPeriodo: number;
}

export interface ResumoLoja {
  empresa: string;
  totalVendido: number;
  totalCreditos: number;
  totalDevolucoes: number;
  totalVendidoSemCreditos: number;
  qtdTransacao: number;
  ticketMedio: number;
  totalBruto: number;
  totalDesconto: number;
  percentualDesconto: number;
}

export type { ResumoEmpresaVendedorAPI as ResumoEmpresaVendedor };
export type { ResumoFormaPagamento };

// Cache de nomes de empresas (local, para enriquecer dados)
let empresasCache: Map<number, string> | null = null;
let empresasCacheTime: number = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function getEmpresasMap(): Promise<Map<number, string>> {
  const now = Date.now();
  if (empresasCache && (now - empresasCacheTime) < CACHE_TTL) {
    return empresasCache;
  }
  
  const { data } = await supabase.from('empresa').select('cod_empresa, nome_fantasia');
  
  empresasCache = new Map();
  data?.forEach((e) => {
    empresasCache!.set(e.cod_empresa, e.nome_fantasia || `Loja ${e.cod_empresa}`);
  });
  empresasCacheTime = now;
  
  return empresasCache;
}

// ========================================
// VALIDAÇÃO DE DATAS
// ========================================

/** Retorna true se a data é válida e razoável (ano >= 2020) */
function isDateValid(dateStr: string): boolean {
  if (!dateStr || dateStr.length < 10) return false;
  const d = new Date(dateStr + 'T12:00:00');
  if (isNaN(d.getTime())) return false;
  const year = d.getFullYear();
  return year >= 2020 && year <= 2099;
}

/** Retorna true se ambas as datas são válidas e o range faz sentido */
function isDateRangeValid(dataInicio: string, dataFim: string): boolean {
  if (!isDateValid(dataInicio) || !isDateValid(dataFim)) return false;
  return dataInicio <= dataFim;
}

function calcularMetricasFormasPagamento(dados: ResumoFormaPagamento[]) {
  let totalVendido = 0;
  let totalCreditos = 0;
  let totalDevolucoes = 0;
  let qtdTransacoes = 0;
  let qtdTransacoesSemCreditos = 0;
  let totalBruto = 0;
  let totalDesconto = 0;

  dados.forEach((d) => {
    const devolucao = isDevolucao(d.formaPagamento);
    const credito = isCredito(d.formaPagamento);

    if (devolucao) {
      totalDevolucoes += Math.abs(d.totalGeral);
    } else {
      totalVendido += d.totalGeral;
      if (credito) {
        totalCreditos += d.totalGeral;
      } else {
        qtdTransacoesSemCreditos += d.qtdVendas;
      }
      qtdTransacoes += d.qtdVendas;
      totalBruto += d.totalBruto || 0;
      totalDesconto += d.totalDesconto || 0;
    }
  });

  const totalVendidoSemCreditos = totalVendido - totalCreditos;
  const ticketMedio = calcularTicketMedio(totalVendidoSemCreditos, qtdTransacoesSemCreditos);
  const percentualDesconto = totalBruto > 0 ? (totalDesconto / totalBruto) * 100 : 0;

  return {
    totalVendido,
    totalCreditos,
    totalDevolucoes,
    totalVendidoSemCreditos,
    qtdTransacoes,
    ticketMedio,
    totalBruto,
    totalDesconto,
    percentualDesconto,
  };
}

function agruparPorLoja(dados: ResumoFormaPagamento[]): ResumoLoja[] {
  const mapaFormas = new Map<number, {
    empresa: string;
    codEmpresa: number;
    totalVendido: number;
    totalCreditos: number;
    totalDevolucoes: number;
    qtdTransacao: number;
    qtdTransacaoSemCreditos: number;
    totalBruto: number;
    totalDesconto: number;
  }>();

  dados.forEach((d) => {
    const existing = mapaFormas.get(d.codEmpresa);

    const devolucao = isDevolucao(d.formaPagamento);
    const credito = isCredito(d.formaPagamento);

    const valorVenda = devolucao ? 0 : d.totalGeral;
    const valorCredito = credito ? d.totalGeral : 0;
    const valorDevolucao = devolucao ? Math.abs(d.totalGeral) : 0;
    const qtdVendas = devolucao ? 0 : d.qtdVendas;
    const qtdVendasSemCreditos = (devolucao || credito) ? 0 : d.qtdVendas;
    const valorBruto = devolucao ? 0 : (d.totalBruto ?? 0);
    const valorDesconto = devolucao ? 0 : (d.totalDesconto ?? 0);

    if (existing) {
      existing.totalVendido += valorVenda;
      existing.totalCreditos += valorCredito;
      existing.totalDevolucoes += valorDevolucao;
      existing.qtdTransacao += qtdVendas;
      existing.qtdTransacaoSemCreditos += qtdVendasSemCreditos;
      existing.totalBruto += valorBruto;
      existing.totalDesconto += valorDesconto;
    } else {
      mapaFormas.set(d.codEmpresa, {
        empresa: d.empresa,
        codEmpresa: d.codEmpresa,
        totalVendido: valorVenda,
        totalCreditos: valorCredito,
        totalDevolucoes: valorDevolucao,
        qtdTransacao: qtdVendas,
        qtdTransacaoSemCreditos: qtdVendasSemCreditos,
        totalBruto: valorBruto,
        totalDesconto: valorDesconto,
      });
    }
  });

  return Array.from(mapaFormas.values()).map((item) => {
    const totalVendidoSemCreditos = item.totalVendido - item.totalCreditos;
    const ticketMedio = calcularTicketMedio(totalVendidoSemCreditos, item.qtdTransacaoSemCreditos);
    const percentualDesconto = item.totalBruto > 0 ? (item.totalDesconto / item.totalBruto) * 100 : 0;
    
    return {
      empresa: item.empresa,
      totalVendido: item.totalVendido,
      totalCreditos: item.totalCreditos,
      totalDevolucoes: item.totalDevolucoes,
      totalVendidoSemCreditos,
      qtdTransacao: item.qtdTransacao,
      ticketMedio,
      totalBruto: item.totalBruto,
      totalDesconto: item.totalDesconto,
      percentualDesconto,
    };
  });
}

// Agrupar por vendedor (para visão "Por Vendedor")
function agruparPorVendedor(dados: ResumoFormaPagamento[]): ResumoEmpresaVendedorAPI[] {
  const mapaVendedores = new Map<string, {
    vendedor: string;
    empresa: string;
    empresaCodLogico: number;
    totalVendido: number;
    totalCreditos: number;
    totalDevolucoes: number;
    qtdTransacao: number;
    qtdTransacaoSemCreditos: number;
    totalBruto: number;
    totalDesconto: number;
  }>();

  dados.forEach((d) => {
    const vendedorKey = `${d.vendedor || 'SEM VENDEDOR'}|${d.codEmpresa}`;
    const existing = mapaVendedores.get(vendedorKey);

    const devolucao = isDevolucao(d.formaPagamento);
    const credito = isCredito(d.formaPagamento);

    const valorVenda = devolucao ? 0 : d.totalGeral;
    const valorCredito = credito ? d.totalGeral : 0;
    const valorDevolucao = devolucao ? Math.abs(d.totalGeral) : 0;
    const qtdVendas = devolucao ? 0 : d.qtdVendas;
    const qtdVendasSemCreditos = (devolucao || credito) ? 0 : d.qtdVendas;
    const valorBruto = devolucao ? 0 : (d.totalBruto ?? 0);
    const valorDesconto = devolucao ? 0 : (d.totalDesconto ?? 0);

    if (existing) {
      existing.totalVendido += valorVenda;
      existing.totalCreditos += valorCredito;
      existing.totalDevolucoes += valorDevolucao;
      existing.qtdTransacao += qtdVendas;
      existing.qtdTransacaoSemCreditos += qtdVendasSemCreditos;
      existing.totalBruto += valorBruto;
      existing.totalDesconto += valorDesconto;
    } else {
      mapaVendedores.set(vendedorKey, {
        vendedor: d.vendedor || 'SEM VENDEDOR',
        empresa: d.empresa,
        empresaCodLogico: d.codEmpresa,
        totalVendido: valorVenda,
        totalCreditos: valorCredito,
        totalDevolucoes: valorDevolucao,
        qtdTransacao: qtdVendas,
        qtdTransacaoSemCreditos: qtdVendasSemCreditos,
        totalBruto: valorBruto,
        totalDesconto: valorDesconto,
      });
    }
  });

  return Array.from(mapaVendedores.values()).map((item) => {
    const totalVendidoSemCreditos = item.totalVendido - item.totalCreditos;
    const ticketMedio = calcularTicketMedio(totalVendidoSemCreditos, item.qtdTransacaoSemCreditos);
    const percentualDesconto = item.totalBruto > 0 ? (item.totalDesconto / item.totalBruto) * 100 : 0;
    
    return {
      empresa: item.empresa,
      empresaCodLogico: item.empresaCodLogico,
      empresaNomeLogico: item.empresa,
      // Agregado por forma de pagamento não carrega o código do vendedor
      codVendedor: 0,
      vendedor: item.vendedor,
      qtdTransacao: item.qtdTransacao,
      qtdProdutos: 0,
      totalBruto: item.totalBruto,
      totalVendido: item.totalVendido,
      totalDesconto: item.totalDesconto,
      percentualDesconto,
      totalCreditos: item.totalCreditos,
      totalVendidoSemCreditos,
      ticketMedio,
    };
  });
}

// ========================================
// CONVERTER CACHE SUPABASE → ResumoFormaPagamento
// ========================================
function cacheToFormasPagamento(
  cacheData: Array<{
    cod_empresa: number;
    vendedor: string;
    forma_pagamento: string;
    total_vendido: number | null;
    qtd_vendas: number | null;
    total_bruto: number | null;
    total_desconto: number | null;
  }>,
  empresasMap: Map<number, string>
): ResumoFormaPagamento[] {
  // regra 13/18: movimentacao das duas empresas soma na loja logica (18),
  // exibida sempre com o nome atual DINIZ SUPER SHOPPING
  return cacheData.map(d => ({
    codEmpresa: codLojaLogico(d.cod_empresa),
    empresa: nomeLojaLogico(
      d.cod_empresa,
      empresasMap.get(d.cod_empresa) || `Loja ${d.cod_empresa}`
    ),
    vendedor: d.vendedor,
    formaPagamento: d.forma_pagamento,
    totalGeral: Number(d.total_vendido) || 0,
    qtdVendas: Number(d.qtd_vendas) || 0,
    totalBruto: Number(d.total_bruto) || 0,
    totalDesconto: Number(d.total_desconto) || 0,
    percentualDesconto: (Number(d.total_bruto) || 0) > 0
      ? ((Number(d.total_desconto) || 0) / (Number(d.total_bruto) || 0)) * 100
      : 0,
  }));
}

// ========================================
// AGREGAR DADOS (de-dup por chave única)
// ========================================
function agregarDados(dados: ResumoFormaPagamento[]): ResumoFormaPagamento[] {
  const mapa = new Map<string, ResumoFormaPagamento>();
  
  dados.forEach(d => {
    const key = `${d.codEmpresa}|${d.vendedor}|${d.formaPagamento}`;
    const existing = mapa.get(key);
    
    if (existing) {
      existing.totalGeral += d.totalGeral;
      existing.qtdVendas += d.qtdVendas;
      existing.totalBruto += d.totalBruto;
      existing.totalDesconto += d.totalDesconto;
    } else {
      mapa.set(key, { ...d });
    }
  });
  
  return Array.from(mapa.values()).map(d => ({
    ...d,
    percentualDesconto: d.totalBruto > 0 ? (d.totalDesconto / d.totalBruto) * 100 : 0,
  }));
}

// ========================================
// LER CACHE DIÁRIO (Supabase)
// ========================================
async function lerCacheAgregado(
  empresa: EmpresaParam,
  dataInicio: string,
  dataFim: string
): Promise<ResumoFormaPagamento[]> {
  let queryCache = supabase
    .from('vendas_agregado_diario')
    .select('*')
    .gte('data', dataInicio)
    .lte('data', dataFim);

  queryCache = aplicarFiltroEmpresaSupabase(queryCache, empresa);

  const { data: cacheData, error: cacheError } = await queryCache;
  if (cacheError || !cacheData || cacheData.length === 0) {
    if (cacheError) console.warn('[useVendasDashboard] Erro ao ler cache:', cacheError.message);
    return [];
  }

  const empresasMap = await getEmpresasMap();
  return cacheToFormasPagamento(cacheData, empresasMap);
}

// ========================================
// SINCRONIZAR PERÍODO VIA EDGE FUNCTION (F5)
// ========================================
// O botão "Atualizar" NÃO grava mais o cache client-side. A gravação antiga
// (salvarNoCache) apagava o período inteiro e regravava o agregado do Firebird
// com uma ÚNICA data (dataInicio), destruindo a granularidade diária usada
// pela aba "Por Dia", pelo ComparativoPanel e pela Inteligência de Vendas.
// Agora o sync é feito pela edge function `sync-agregados-diarios`, que
// reagrega dia a dia direto do Firebird e regrava o cache no servidor.
// Obs.: a edge function exige usuário admin (ou service_role); usuários sem
// permissão recebem erro e o dashboard continua exibindo o cache existente.

interface ResultadoSyncEdge {
  /** true quando o sync roda em background no servidor (modo 'ALL'/histórico) */
  background: boolean;
  registros: number;
  erros: string[];
}

async function sincronizarPeriodoViaEdge(
  empresa: EmpresaParam,
  dataInicio: string,
  dataFim: string
): Promise<ResultadoSyncEdge> {
  const empresas: number[] | null = Array.isArray(empresa)
    ? empresa
    : (empresa === 'ALL' || empresa === null || empresa === '')
      ? null
      : [Number(empresa)].filter((n) => !Number.isNaN(n));

  if (empresas && empresas.length > 0) {
    // Modo normal da edge function: síncrono, mas aceita UMA empresa por
    // chamada — por isso o loop sequencial para seleção multi-loja.
    const erros: string[] = [];
    let registros = 0;
    for (const cod of empresas) {
      const { data, error } = await supabase.functions.invoke('sync-agregados-diarios', {
        body: { empresa: cod, dataInicio, dataFim },
      });
      if (error) {
        erros.push(`Loja ${cod}: ${error.message || String(error)}`);
      } else if (data?.erro) {
        erros.push(`Loja ${cod}: ${data.erro}`);
      } else {
        registros += Number(data?.registros) || 0;
      }
    }
    return { background: false, registros, erros };
  }

  // 'ALL': modo histórico — a edge function processa todas as empresas em
  // background (EdgeRuntime.waitUntil) e o cache vai sendo atualizado aos
  // poucos. Limitação conhecida: não há como aguardar a conclusão aqui; a
  // leitura logo abaixo pode ainda refletir dados antigos.
  const { data, error } = await supabase.functions.invoke('sync-agregados-diarios', {
    body: { historico: true, dataInicio, dataFim },
  });
  if (error) {
    return { background: true, registros: 0, erros: [error.message || String(error)] };
  }
  return { background: true, registros: Number(data?.registros) || 0, erros: [] };
}

// ========================================
// MAIN HOOK
// ========================================
export function useVendasDashboard() {
  // Importar empresa padrão do profile — nunca ALL por default
  const { defaultEmpresa } = useDefaultEmpresa();
  
  const [filters, setFilters] = useState<VendasFiltersState>({
    dataInicio: formatLocalDate(new Date(agoraSP().getFullYear(), agoraSP().getMonth(), 1)),
    dataFim: formatLocalDate(new Date(agoraSP().getFullYear(), agoraSP().getMonth() + 1, 0)),
    viewMode: "loja",
    empresa: '', // Será preenchido pelo useEffect abaixo
  });

  // Preencher empresa do profile quando disponível
  const empresaInicializada = useRef(false);
  useEffect(() => {
    if (defaultEmpresa && !empresaInicializada.current) {
      empresaInicializada.current = true;
      setFilters(prev => ({ ...prev, empresa: defaultEmpresa }));
    }
  }, [defaultEmpresa]);

  // Carregar período comercial do banco ao montar
  const periodoCarregado = useRef(false);
  // Range do cache disponível (para exibição e fallback)
  const [cacheDisponivel, setCacheDisponivel] = useState<{ minData: string; maxData: string } | null>(null);

  useEffect(() => {
    if (periodoCarregado.current) return;
    periodoCarregado.current = true;

    async function detectarPeriodo() {
      // 1. Obter período comercial (mês atual por padrão)
      const periodo = await getPeriodoComercial();

      // 2. Verificar se existe cache para esse período
      const { count: cacheCount } = await supabase
        .from('vendas_agregado_diario')
        .select('id', { count: 'exact', head: true })
        .gte('data', periodo.dataIni)
        .lte('data', periodo.dataFim);

      // 3. Buscar range total do cache
      const [{ data: minRow }, { data: maxRow }] = await Promise.all([
        supabase.from('vendas_agregado_diario').select('data').order('data', { ascending: true }).limit(1),
        supabase.from('vendas_agregado_diario').select('data').order('data', { ascending: false }).limit(1),
      ]);

      const minData = minRow?.[0]?.data;
      const maxData = maxRow?.[0]?.data;
      if (minData && maxData) {
        setCacheDisponivel({ minData, maxData });
      }

      if ((cacheCount ?? 0) > 0) {
        // Cache disponível no período comercial — usar normalmente
        setFilters(prev => ({ ...prev, dataInicio: periodo.dataIni, dataFim: periodo.dataFim }));
      } else if (maxData) {
        // Cache vazio no mês atual — ajustar para o último mês com dados
        const maxDate = new Date(maxData + 'T12:00:00');
        const fallbackInicio = formatLocalDate(new Date(maxDate.getFullYear(), maxDate.getMonth(), 1));
        const fallbackFim = formatLocalDate(new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0));
        console.log(`[useVendasDashboard] ⚠ Cache vazio para ${periodo.dataIni}..${periodo.dataFim}, usando último período com dados: ${fallbackInicio}..${fallbackFim}`);
        setFilters(prev => ({ ...prev, dataInicio: fallbackInicio, dataFim: fallbackFim }));
      } else {
        // Nenhum cache — manter período comercial padrão
        setFilters(prev => ({ ...prev, dataInicio: periodo.dataIni, dataFim: periodo.dataFim }));
      }
    }

    detectarPeriodo();
  }, []);

  const [dadosFormasPagamento, setDadosFormasPagamento] = useState<ResumoFormaPagamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDesconto, setLoadingDesconto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [erroDesconto, setErroDesconto] = useState<string | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [fontesDados, setFontesDados] = useState<{ 
    supabase: boolean; 
    firebird: boolean;
    parcial?: boolean;
    mensagem?: string;
  }>({ supabase: false, firebird: false });
  
  // Alerta para períodos longos
  const [alertaPeriodo, setAlertaPeriodo] = useState<string | null>(null);
  
  // Progresso da paginação
  const [progressoPaginacao, setProgressoPaginacao] = useState<ProgressoPaginacao | null>(null);

  // Ref para debounce
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ========================================
  // fetchData ("Atualizar"): dispara o sync via edge function e relê o cache.
  // F5: não há mais gravação de cache client-side — o servidor reagrega dia a
  // dia, preservando a granularidade diária do vendas_agregado_diario.
  // ========================================
  const fetchData = useCallback(async (
    empresa: EmpresaParam,
    dataInicio: string,
    dataFim: string
  ) => {
    // ========================================
    // GUARD: Validar inputs antes de qualquer fetch
    // ========================================
    if (!empresa || empresa === '') {
      console.log('[useVendasDashboard] ⏳ Aguardando empresa ser definida...');
      return;
    }

    if (!isDateRangeValid(dataInicio, dataFim)) {
      console.log('[useVendasDashboard] ⏳ Datas inválidas, ignorando fetch:', { dataInicio, dataFim });
      return;
    }

    // Verificar limite de dias
    const diasNoPeriodo = diffInDays(dataInicio, dataFim) + 1;

    if (diasNoPeriodo > CONFIG.LIMITE_DIAS_MAXIMO) {
      setAlertaPeriodo(`Período muito longo (${diasNoPeriodo} dias). O máximo recomendado é ${CONFIG.LIMITE_DIAS_MAXIMO} dias.`);
      setError(`Reduza o período para no máximo ${CONFIG.LIMITE_DIAS_MAXIMO} dias para melhor performance.`);
      setLoading(false);
      return;
    } else if (diasNoPeriodo > CONFIG.LIMITE_DIAS_ALERTA) {
      setAlertaPeriodo(`Período longo (${diasNoPeriodo} dias) pode demorar mais para carregar.`);
    } else {
      setAlertaPeriodo(null);
    }

    // Loading
    setLoading(true);
    setError(null);
    setLoadingDesconto(true);
    setProgressoPaginacao(null);
    setErroDesconto(null);
    setFontesDados({ supabase: false, firebird: false });

    const startTime = performance.now();
    let infoSync = '';
    let syncFalhou = false;

    // ========================================
    // PASSO 1: SINCRONIZAR o período via edge function (servidor grava o cache)
    // ========================================
    try {
      console.log('[useVendasDashboard] 🔄 Sincronizando via edge function...', { empresa, dataInicio, dataFim });
      const resultado = await sincronizarPeriodoViaEdge(empresa, dataInicio, dataFim);

      if (resultado.erros.length > 0) {
        console.warn('[useVendasDashboard] ⚠ Sync com erros:', resultado.erros);
        syncFalhou = resultado.registros === 0;
        infoSync = ` — sync com erro: ${resultado.erros[0]}`;
      } else if (resultado.background) {
        infoSync = ' — sync de todas as lojas continua em background';
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[useVendasDashboard] ⚠ Falha ao sincronizar via edge function:', msg);
      infoSync = ` — atualização indisponível (${msg})`;
      syncFalhou = true;
    }

    // ========================================
    // PASSO 2: RELER o cache diário (fonte única dos dashboards)
    // ========================================
    try {
      const dadosCache = await lerCacheAgregado(empresa, dataInicio, dataFim);
      const tempoMs = Math.round(performance.now() - startTime);

      if (dadosCache.length > 0) {
        setDadosFormasPagamento(agregarDados(dadosCache));
        setFontesDados({
          supabase: true,
          firebird: !syncFalhou,
          parcial: infoSync !== '' || undefined,
          mensagem: syncFalhou
            ? `Cache (${tempoMs}ms)${infoSync}`
            : `Atualizado (${tempoMs}ms)${infoSync}`,
        });
        console.log(`[useVendasDashboard] ✓ Atualização concluída em ${tempoMs}ms (${dadosCache.length} registros)`);
      } else {
        setDadosFormasPagamento([]);
        setFontesDados({
          supabase: false,
          firebird: false,
          parcial: syncFalhou || undefined,
          mensagem: syncFalhou
            ? `Sem dados em cache${infoSync}`
            : `Nenhuma venda no período${infoSync}`,
        });
        if (syncFalhou) {
          setError('Dados indisponíveis no momento. Clique em Atualizar para tentar novamente.');
        }
      }
      setDataLoaded(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[useVendasDashboard] ❌ Erro ao reler cache:', message);
      setError(`Erro ao carregar dados: ${message}`);
      setDadosFormasPagamento([]);
      setFontesDados({
        supabase: false,
        firebird: false,
        parcial: true,
        mensagem: `Erro: ${message}`,
      });
      setDataLoaded(true);
    } finally {
      setLoading(false);
      setLoadingDesconto(false);
    }
  }, []);

  // ========================================
  // fetchCacheOnly: Apenas lê cache Supabase (carregamento automático)
  // ========================================
  const fetchCacheOnly = useCallback(async (
    empresa: EmpresaParam,
    dataInicio: string,
    dataFim: string
  ) => {
    if (!empresa || empresa === '') return;
    if (!isDateRangeValid(dataInicio, dataFim)) return;

    const diasNoPeriodo = diffInDays(dataInicio, dataFim) + 1;
    if (diasNoPeriodo > CONFIG.LIMITE_DIAS_MAXIMO) {
      setAlertaPeriodo(`Período muito longo (${diasNoPeriodo} dias). O máximo recomendado é ${CONFIG.LIMITE_DIAS_MAXIMO} dias.`);
      setError(`Reduza o período para no máximo ${CONFIG.LIMITE_DIAS_MAXIMO} dias para melhor performance.`);
      return;
    } else if (diasNoPeriodo > CONFIG.LIMITE_DIAS_ALERTA) {
      setAlertaPeriodo(`Período longo (${diasNoPeriodo} dias) pode demorar mais para carregar.`);
    } else {
      setAlertaPeriodo(null);
    }

    setLoading(true);
    setError(null);
    setFontesDados({ supabase: false, firebird: false });

    const startTime = performance.now();

    try {
      console.log('[useVendasDashboard] 📦 Buscando apenas cache Supabase...');

      const dadosCache = await lerCacheAgregado(empresa, dataInicio, dataFim);

      if (dadosCache.length > 0) {
        const dadosAgregados = agregarDados(dadosCache);
        const tempoMs = Math.round(performance.now() - startTime);

        setDadosFormasPagamento(dadosAgregados);
        setFontesDados({
          supabase: true,
          firebird: false,
          mensagem: `Cache (${tempoMs}ms)`,
        });
        setDataLoaded(true);
        console.log(`[useVendasDashboard] ✓ Cache: ${dadosCache.length} registros em ${tempoMs}ms`);
      } else {
        console.log('[useVendasDashboard] ⚠ Cache vazio — clique em Atualizar para buscar dados');
        setDadosFormasPagamento([]);
        setFontesDados({
          supabase: false,
          firebird: false,
          mensagem: 'Sem dados em cache. Clique em Atualizar para buscar.',
        });
        setDataLoaded(true);
      }
    } catch (err) {
      console.warn('[useVendasDashboard] Erro ao ler cache:', err);
      setDadosFormasPagamento([]);
      setDataLoaded(true);
    } finally {
      setLoading(false);
      setLoadingDesconto(false);
    }
  }, []);

  // ========================================
  // DEBOUNCED EFFECT: Carregar APENAS CACHE ao mudar filtros
  // ========================================
  useEffect(() => {
    const { empresa, dataInicio, dataFim } = filters;
    
    if (!empresa || empresa === '') return;
    if (!isDateRangeValid(dataInicio, dataFim)) return;
    
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    debounceTimerRef.current = setTimeout(() => {
      fetchCacheOnly(empresa, dataInicio, dataFim);
    }, CONFIG.DEBOUNCE_MS);
    
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [filters.empresa, filters.dataInicio, filters.dataFim, fetchCacheOnly]);

  // Calcular métricas
  const metrics = useMemo((): VendasMetrics => {
    const calculated = calcularMetricasFormasPagamento(dadosFormasPagamento);
    return {
      ...calculated,
      descontoDisponivel: calculated.totalBruto > 0,
    };
  }, [dadosFormasPagamento]);

  // Calcular projeção
  const projecao = useMemo((): ProjecaoFechamento => {
    const hoje = agoraSP();
    const dataFimDate = new Date(filters.dataFim + 'T23:59:59');
    const dataInicioDate = new Date(filters.dataInicio + 'T00:00:00');
    
    const diasTotais = diffInDays(filters.dataInicio, filters.dataFim) + 1;
    
    if (dataFimDate <= hoje) {
      return {
        temProjecao: false,
        diasTotais,
        diasDecorridos: diasTotais,
        diasRestantes: 0,
        mediaDiaria: diasTotais > 0 ? metrics.totalVendidoSemCreditos / diasTotais : 0,
        projecaoFechamento: metrics.totalVendidoSemCreditos,
        percentualPeriodo: 100,
      };
    }
    
    const diasDecorridos = Math.max(0, diffInDays(filters.dataInicio, formatLocalDate(hoje)) + 1);
    const diasRestantes = diasTotais - diasDecorridos;
    const mediaDiaria = diasDecorridos > 0 ? metrics.totalVendidoSemCreditos / diasDecorridos : 0;
    const projecaoFechamento = mediaDiaria * diasTotais;
    const percentualPeriodo = diasTotais > 0 ? (diasDecorridos / diasTotais) * 100 : 0;
    
    return {
      temProjecao: true,
      diasTotais,
      diasDecorridos,
      diasRestantes,
      mediaDiaria,
      projecaoFechamento,
      percentualPeriodo,
    };
  }, [filters.dataInicio, filters.dataFim, metrics.totalVendidoSemCreditos]);

  // Agrupar por loja
  const dadosPorLoja = useMemo((): ResumoLoja[] => {
    return agruparPorLoja(dadosFormasPagamento);
  }, [dadosFormasPagamento]);

  // Agrupar por vendedor (derivado de dadosFormasPagamento)
  const dadosComDescontoComputed = useMemo((): ResumoEmpresaVendedorAPI[] => {
    return agruparPorVendedor(dadosFormasPagamento);
  }, [dadosFormasPagamento]);

  // Reload (imediato, sem debounce)
  const reload = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    fetchData(filters.empresa, filters.dataInicio, filters.dataFim);
  }, [filters, fetchData]);

  // Force refresh (mesmo comportamento)
  const forceRefresh = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    fetchData(filters.empresa, filters.dataInicio, filters.dataFim);
  }, [filters, fetchData]);

  return {
    filters,
    setFilters,
    dadosFormasPagamento,
    dadosComDesconto: dadosComDescontoComputed,
    loading,
    loadingDesconto,
    error,
    erroDesconto,
    dataLoaded,
    metrics,
    projecao,
    dadosPorLoja,
    fontesDados,
    alertaPeriodo,
    progressoPaginacao,
    reload,
    forceRefresh,
    cacheDisponivel,
    // Estados removidos (mantidos para compatibilidade)
    syncStatus: null,
    isSyncing: false,
  };
}
