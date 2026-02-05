// src/hooks/useVendasDashboard.ts
// Hook para dashboard de vendas - VERSÃO FIREBIRD-FIRST
// Estratégia: Buscar dados SEMPRE do Firebird Bridge para garantir dados atualizados
// O Firebird Bridge é a fonte primária de verdade (ERP real)

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  getResumoFormasPagamento,
  ResumoFormaPagamento,
  ResumoEmpresaVendedor as ResumoEmpresaVendedorAPI,
} from "@/services/vendasService";
import { EmpresaParam } from "@/services/firebirdBridge";
import { getPeriodoComercial, formatLocalDate, diffInDays } from "@/utils/dateValidation";
import { supabase } from "@/integrations/supabase/client";

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
  /** Timeout para primeira tentativa */
  TIMEOUT_PRIMEIRA_TENTATIVA: 60000, // 60s
  /** Timeout para retry (um pouco maior) */
  TIMEOUT_RETRY: 90000, // 90s
  /** Limite máximo de dias para alertar o usuário */
  LIMITE_DIAS_ALERTA: 45,
  /** Limite máximo de dias permitido */
  LIMITE_DIAS_MAXIMO: 90,
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

function calcularMetricasFormasPagamento(dados: ResumoFormaPagamento[]) {
  let totalVendido = 0;
  let totalCreditos = 0;
  let totalDevolucoes = 0;
  let qtdTransacoes = 0;
  let totalBruto = 0;
  let totalDesconto = 0;

  dados.forEach((d) => {
    const formaPagamentoUpper = (d.formaPagamento || '').toUpperCase().trim();
    const isDevolucao = formaPagamentoUpper === 'DEVOLUCAO';
    const isCredito = formaPagamentoUpper === 'CREDITOS' || formaPagamentoUpper === 'CREDITO';
    
    if (isDevolucao) {
      totalDevolucoes += Math.abs(d.totalGeral);
    } else {
      totalVendido += d.totalGeral;
      if (isCredito) {
        totalCreditos += d.totalGeral;
      }
      qtdTransacoes += d.qtdVendas;
      totalBruto += d.totalBruto || 0;
      totalDesconto += d.totalDesconto || 0;
    }
  });

  const totalVendidoSemCreditos = totalVendido - totalCreditos;
  const ticketMedio = qtdTransacoes > 0 ? totalVendidoSemCreditos / qtdTransacoes : 0;
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
    totalBruto: number;
    totalDesconto: number;
  }>();

  dados.forEach((d) => {
    const existing = mapaFormas.get(d.codEmpresa);
    
    const formaPagamentoUpper = (d.formaPagamento || '').toUpperCase().trim();
    const isDevolucao = formaPagamentoUpper === 'DEVOLUCAO';
    const isCredito = formaPagamentoUpper === 'CREDITOS' || formaPagamentoUpper === 'CREDITO';
    
    const valorVenda = isDevolucao ? 0 : d.totalGeral;
    const valorCredito = isCredito ? d.totalGeral : 0;
    const valorDevolucao = isDevolucao ? Math.abs(d.totalGeral) : 0;
    const qtdVendas = isDevolucao ? 0 : d.qtdVendas;
    const valorBruto = isDevolucao ? 0 : (d.totalBruto ?? 0);
    const valorDesconto = isDevolucao ? 0 : (d.totalDesconto ?? 0);
    
    if (existing) {
      existing.totalVendido += valorVenda;
      existing.totalCreditos += valorCredito;
      existing.totalDevolucoes += valorDevolucao;
      existing.qtdTransacao += qtdVendas;
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
        totalBruto: valorBruto,
        totalDesconto: valorDesconto,
      });
    }
  });

  return Array.from(mapaFormas.values()).map((item) => {
    const totalVendidoSemCreditos = item.totalVendido - item.totalCreditos;
    const ticketMedio = item.qtdTransacao > 0 ? totalVendidoSemCreditos / item.qtdTransacao : 0;
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
    totalBruto: number;
    totalDesconto: number;
  }>();

  dados.forEach((d) => {
    const vendedorKey = `${d.vendedor || 'SEM VENDEDOR'}|${d.codEmpresa}`;
    const existing = mapaVendedores.get(vendedorKey);
    
    const formaPagamentoUpper = (d.formaPagamento || '').toUpperCase().trim();
    const isDevolucao = formaPagamentoUpper === 'DEVOLUCAO';
    const isCredito = formaPagamentoUpper === 'CREDITOS' || formaPagamentoUpper === 'CREDITO';
    
    const valorVenda = isDevolucao ? 0 : d.totalGeral;
    const valorCredito = isCredito ? d.totalGeral : 0;
    const valorDevolucao = isDevolucao ? Math.abs(d.totalGeral) : 0;
    const qtdVendas = isDevolucao ? 0 : d.qtdVendas;
    const valorBruto = isDevolucao ? 0 : (d.totalBruto ?? 0);
    const valorDesconto = isDevolucao ? 0 : (d.totalDesconto ?? 0);
    
    if (existing) {
      existing.totalVendido += valorVenda;
      existing.totalCreditos += valorCredito;
      existing.totalDevolucoes += valorDevolucao;
      existing.qtdTransacao += qtdVendas;
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
        totalBruto: valorBruto,
        totalDesconto: valorDesconto,
      });
    }
  });

  return Array.from(mapaVendedores.values()).map((item) => {
    const totalVendidoSemCreditos = item.totalVendido - item.totalCreditos;
    const ticketMedio = item.qtdTransacao > 0 ? totalVendidoSemCreditos / item.qtdTransacao : 0;
    const percentualDesconto = item.totalBruto > 0 ? (item.totalDesconto / item.totalBruto) * 100 : 0;
    
    return {
      empresa: item.empresa,
      empresaCodLogico: item.empresaCodLogico,
      empresaNomeLogico: item.empresa,
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

// Timeout wrapper para fetch
async function fetchWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
    )
  ]);
}

export function useVendasDashboard() {
  const defaultPeriodo = getPeriodoComercial();

  const [filters, setFilters] = useState<VendasFiltersState>({
    dataInicio: defaultPeriodo.dataIni,
    dataFim: defaultPeriodo.dataFim,
    viewMode: "loja",
    empresa: 'ALL',
  });

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

  // Ref para controlar requisições em andamento
  const abortControllerRef = useRef<AbortController | null>(null);

  // Função de fetch com retry automático
  const fetchComRetry = useCallback(async <T>(
    fetchFn: () => Promise<T>,
    tentativaAtual = 1
  ): Promise<T> => {
    const timeout = tentativaAtual === 1 
      ? CONFIG.TIMEOUT_PRIMEIRA_TENTATIVA 
      : CONFIG.TIMEOUT_RETRY;
    
    try {
      return await fetchWithTimeout(
        fetchFn(),
        timeout,
        `Timeout na tentativa ${tentativaAtual} (${timeout/1000}s)`
      );
    } catch (error) {
      if (tentativaAtual === 1 && error instanceof Error && error.message.includes('Timeout')) {
        console.log('[useVendasDashboard] Primeira tentativa falhou, fazendo retry...');
        return fetchComRetry(fetchFn, 2);
      }
      throw error;
    }
  }, []);

  const fetchData = useCallback(async (
    empresa: EmpresaParam, 
    dataInicio: string, 
    dataFim: string
  ) => {
    // Cancelar requisição anterior se existir
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    
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
    
    console.log('[useVendasDashboard] 🔄 Buscando dados DIRETO DO FIREBIRD:', { empresa, dataInicio, dataFim, diasNoPeriodo });
    
    const startTime = performance.now();
    
    try {
      // ========================================
      // ESTRATÉGIA FIREBIRD-FIRST
      // Buscar dados sempre do Firebird Bridge (fonte primária)
      // ========================================
      
      console.log('[useVendasDashboard] Chamando getResumoFormasPagamento...');
      
      const dados = await fetchComRetry(() => getResumoFormasPagamento({
        empresa,
        dataInicio,
        dataFim,
        bypassCache: true, // Sempre buscar dados frescos
        incluirDevolucoes: true,
      }));
      
      const tempoMs = Math.round(performance.now() - startTime);
      
      console.log(`[useVendasDashboard] ✓ Firebird retornou ${dados.length} registros em ${tempoMs}ms`);
      
      if (dados.length > 0) {
        setDadosFormasPagamento(dados);
        setFontesDados({ 
          supabase: false, 
          firebird: true,
          mensagem: `Dados ao vivo (${tempoMs}ms)`
        });
        setDataLoaded(true);
        setLoading(false);
        setLoadingDesconto(false);
      } else {
        // Sem dados para o período
        setDadosFormasPagamento([]);
        setFontesDados({ 
          supabase: false, 
          firebird: true,
          mensagem: 'Nenhuma venda no período'
        });
        setDataLoaded(true);
        setLoading(false);
        setLoadingDesconto(false);
      }
      
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[useVendasDashboard] ❌ Erro ao buscar dados:', message);
      
      setError(`Erro ao carregar dados: ${message}`);
      setDadosFormasPagamento([]);
      setFontesDados({ 
        supabase: false, 
        firebird: false, 
        parcial: true,
        mensagem: `Erro: ${message}`
      });
      setDataLoaded(true);
      setLoading(false);
      setLoadingDesconto(false);
    }
  }, [fetchComRetry]);

  // Carregar dados ao montar e quando filtros mudam
  useEffect(() => {
    if (filters.empresa && filters.empresa !== 'ALL') {
      fetchData(filters.empresa, filters.dataInicio, filters.dataFim);
    } else if (filters.empresa === 'ALL') {
      fetchData('ALL', filters.dataInicio, filters.dataFim);
    }
    
    // Cleanup: cancelar requisição ao desmontar
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [filters.empresa, filters.dataInicio, filters.dataFim, fetchData]);

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
    const hoje = new Date();
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

  // Reload
  const reload = useCallback(() => {
    fetchData(filters.empresa, filters.dataInicio, filters.dataFim);
  }, [filters, fetchData]);

  // Force refresh (mesmo comportamento agora, sempre busca do Firebird)
  const forceRefresh = useCallback(() => {
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
    // Estados removidos (mantidos para compatibilidade)
    syncStatus: null,
    isSyncing: false,
  };
}
