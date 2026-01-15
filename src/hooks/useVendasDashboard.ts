// src/hooks/useVendasDashboard.ts
// Hook para dashboard de vendas - VERSÃO OTIMIZADA
// Otimizações implementadas:
// 1. Sempre usar cache do backend (não enviar cache=0)
// 2. Loading progressivo (placeholders primeiro)
// 3. Limitar range padrão a 30 dias
// 4. Evitar múltiplas empresas simultaneamente
// 5. Retry automático (1x) em caso de timeout
// 6. Carregar dados principais primeiro

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  getResumoFormasPagamento,
  getResumoEmpresaVendedor,
  ResumoFormaPagamento,
  ResumoEmpresaVendedor as ResumoEmpresaVendedorAPI,
} from "@/services/vendasService";
import { getVendasAgregado, AgregadoFormaPagamento, contarDiasNoCache } from "@/services/agregadosService";
import { EmpresaParam } from "@/services/firebirdBridge";
import { getPeriodoComercial, formatLocalDate, diffInDays } from "@/utils/dateValidation";
import { supabase } from "@/integrations/supabase/client";

export type ViewMode = "loja" | "vendedor";

// CONFIGURAÇÕES DE OTIMIZAÇÃO
const CONFIG = {
  /** Timeout para primeira tentativa (mais curto) */
  TIMEOUT_PRIMEIRA_TENTATIVA: 15000, // 15s
  /** Timeout para retry (um pouco maior) */
  TIMEOUT_RETRY: 25000, // 25s
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

// Cache de nomes de empresas
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

async function converterAgregadoParaResumo(
  agregados: AgregadoFormaPagamento[]
): Promise<ResumoFormaPagamento[]> {
  const empresasMap = await getEmpresasMap();
  
  return agregados.map((a) => ({
    codEmpresa: a.codEmpresa,
    empresa: empresasMap.get(a.codEmpresa) || `Loja ${a.codEmpresa}`,
    vendedor: a.vendedor,
    formaPagamento: a.formaPagamento,
    totalGeral: a.totalGeral,
    qtdVendas: a.qtdVendas,
    totalBruto: a.totalBruto,
    totalDesconto: a.totalDesconto,
    percentualDesconto: a.percentualDesconto,
  }));
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
  const [dadosComDesconto, setDadosComDesconto] = useState<ResumoEmpresaVendedorAPI[]>([]);
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

  // Ref para controlar requisições em andamento
  const abortControllerRef = useRef<AbortController | null>(null);

  // OTIMIZAÇÃO 5: Função de fetch com retry automático
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
      // OTIMIZAÇÃO 5: Se for a primeira tentativa e for timeout, tenta novamente
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
    
    // OTIMIZAÇÃO 3: Verificar limite de dias
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
    
    // OTIMIZAÇÃO 2: Loading progressivo - mostrar placeholders imediatamente
    setLoading(true);
    setError(null);
    setLoadingDesconto(true);
    setErroDesconto(null);
    setFontesDados({ supabase: false, firebird: false });
    
    console.log('[useVendasDashboard] Buscando dados:', { empresa, dataInicio, dataFim, diasNoPeriodo });
    
    // ESTRATÉGIA OTIMIZADA:
    // 1. Usar cache do backend (não enviar cache=0)
    // 2. Retry automático em caso de timeout
    // 3. Fallback para cache Supabase local
    
    try {
      // Passo 1: Tentar Firebird COM CACHE DO BACKEND (otimização #1)
      console.log('[useVendasDashboard] Tentando Firebird com cache do backend...');
      const startTime = performance.now();
      
      // OTIMIZAÇÃO 1: Não enviar bypassCache (usar cache do backend)
      // OTIMIZAÇÃO 5: Usar fetchComRetry para retry automático
      const dadosFirebird = await fetchComRetry(() => 
        getResumoFormasPagamento({
          empresa,
          dataInicio,
          dataFim,
          bypassCache: false, // OTIMIZAÇÃO 1: Usar cache do backend!
          excluirCreditos: true,
          incluirDevolucoes: false,
        })
      );
      
      const tempoMs = Math.round(performance.now() - startTime);
      console.log(`[useVendasDashboard] Firebird OK: ${dadosFirebird.length} registros em ${tempoMs}ms`);
      
      setDadosFormasPagamento(dadosFirebird);
      setFontesDados({ supabase: false, firebird: true });
      setDataLoaded(true);
      setLoading(false);
      setLoadingDesconto(false);
      
    } catch (firebirdError) {
      console.warn('[useVendasDashboard] Firebird falhou após retry:', firebirdError);
      
      // Passo 2: Fallback para cache Supabase local
      try {
        console.log('[useVendasDashboard] Tentando cache Supabase local...');
        const startTime = performance.now();
        
        const dadosAgregados = await getVendasAgregado({
          empresa,
          dataInicio,
          dataFim,
        });
        
        const tempoMs = Math.round(performance.now() - startTime);
        console.log(`[useVendasDashboard] Supabase: ${dadosAgregados.length} registros em ${tempoMs}ms`);
        
        if (dadosAgregados.length > 0) {
          // Verificar cobertura do cache
          const diasNoCache = await contarDiasNoCache(dataInicio, dataFim);
          const cobertura = Math.round((diasNoCache / diasNoPeriodo) * 100);
          
          const dadosConvertidos = await converterAgregadoParaResumo(dadosAgregados);
          setDadosFormasPagamento(dadosConvertidos);
          
          if (cobertura < 100) {
            setFontesDados({ 
              supabase: true, 
              firebird: false, 
              parcial: true,
              mensagem: `Cache parcial: ${diasNoCache}/${diasNoPeriodo} dias (${cobertura}%)`
            });
          } else {
            setFontesDados({ supabase: true, firebird: false });
          }
          
          setDataLoaded(true);
          setLoading(false);
          setLoadingDesconto(false);
        } else {
          // Passo 3: Sem dados disponíveis
          console.warn('[useVendasDashboard] Cache vazio');
          setDadosFormasPagamento([]);
          setFontesDados({ supabase: false, firebird: false, parcial: true });
          setError('Servidor indisponível e cache vazio para este período. Tente novamente em alguns minutos.');
          setDataLoaded(true);
          setLoading(false);
          setLoadingDesconto(false);
        }
        
      } catch (cacheError) {
        console.error('[useVendasDashboard] Cache também falhou:', cacheError);
        setDadosFormasPagamento([]);
        setFontesDados({ supabase: false, firebird: false, parcial: true });
        setError('Erro ao carregar dados. Tente novamente.');
        setDataLoaded(true);
        setLoading(false);
        setLoadingDesconto(false);
      }
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

  const reload = useCallback(() => {
    fetchData(filters.empresa, filters.dataInicio, filters.dataFim);
  }, [filters, fetchData]);

  return {
    filters,
    setFilters,
    dadosFormasPagamento,
    dadosComDesconto,
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
    reload,
  };
}
