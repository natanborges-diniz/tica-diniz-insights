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
import { getVendasAgregado, AgregadoFormaPagamento, contarDiasNoCache, isPeriodoFechado, separarPeriodo } from "@/services/agregadosService";
import { getAuditoriaLightCompleta, auditoriaLightToResumo } from "@/services/auditoriaService";
import { EmpresaParam } from "@/services/firebirdBridge";
import { getPeriodoComercial, formatLocalDate, diffInDays } from "@/utils/dateValidation";
import { supabase } from "@/integrations/supabase/client";

export type ViewMode = "loja" | "vendedor";

// CONFIGURAÇÕES DE OTIMIZAÇÃO
const CONFIG = {
  /** Timeout para primeira tentativa (aumentado para auditoria paginada) */
  TIMEOUT_PRIMEIRA_TENTATIVA: 45000, // 45s
  /** Timeout para retry (um pouco maior) */
  TIMEOUT_RETRY: 60000, // 60s
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

  // Flag para forçar busca no Firebird (bypass cache)
  const [forceFirebird, setForceFirebird] = useState(false);

  const fetchData = useCallback(async (
    empresa: EmpresaParam, 
    dataInicio: string, 
    dataFim: string,
    forcarFirebird = false
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
    
    // Loading progressivo
    setLoading(true);
    setError(null);
    setLoadingDesconto(true);
    setErroDesconto(null);
    setFontesDados({ supabase: false, firebird: false });
    
    console.log('[useVendasDashboard] Buscando dados:', { empresa, dataInicio, dataFim, diasNoPeriodo, forcarFirebird });
    
    // ========================================
    // ESTRATÉGIA CACHE-FIRST COM DADOS FECHADOS
    // ========================================
    // 1. Verificar se período é FECHADO (meses anteriores ao atual)
    //    - Se fechado → usar APENAS cache (não chamar Firebird)
    // 2. Se período ABERTO (inclui mês atual) → tentar cache, depois Firebird
    // 3. Mostrar indicador visual da fonte (cache hit/miss)
    
    const startTime = performance.now();
    
    // Verificar política de dados fechados
    const periodoFechado = isPeriodoFechado(dataInicio, dataFim);
    const periodoInfo = separarPeriodo(dataInicio, dataFim);
    
    console.log('[useVendasDashboard] Análise do período:', {
      periodoFechado,
      mesesFechados: periodoInfo.mesesFechados.length,
      temMesAberto: !!periodoInfo.mesAberto,
    });
    
    // PASSO 1: Verificar cache Supabase PRIMEIRO (< 100ms)
    if (!forcarFirebird) {
      try {
        console.log('[useVendasDashboard] CACHE-FIRST: Verificando cache Supabase...');
        
        const dadosAgregados = await getVendasAgregado({
          empresa,
          dataInicio,
          dataFim,
        });
        
        const tempoMs = Math.round(performance.now() - startTime);
        console.log(`[useVendasDashboard] Cache: ${dadosAgregados.length} registros em ${tempoMs}ms`);
        
        if (dadosAgregados.length > 0) {
          // Cache encontrado! Usar imediatamente
          const diasNoCache = await contarDiasNoCache(dataInicio, dataFim);
          const cobertura = Math.round((diasNoCache / diasNoPeriodo) * 100);
          
          const dadosConvertidos = await converterAgregadoParaResumo(dadosAgregados);
          setDadosFormasPagamento(dadosConvertidos);
          
          // Logs de diagnóstico cache hit/miss
          const cacheInfo = periodoFechado 
            ? `✓ CACHE HIT (período fechado): ${dadosAgregados.length} registros`
            : `✓ CACHE HIT (parcial): ${cobertura}% cobertura`;
          console.log(`[useVendasDashboard] ${cacheInfo}`);
          
          if (cobertura < 100) {
            setFontesDados({ 
              supabase: true, 
              firebird: false, 
              parcial: true,
              mensagem: periodoFechado 
                ? `Dados históricos (cache): ${diasNoCache} dias`
                : `Cache parcial: ${diasNoCache}/${diasNoPeriodo} dias (${cobertura}%)`
            });
          } else {
            setFontesDados({ 
              supabase: true, 
              firebird: false,
              mensagem: periodoFechado ? 'Período fechado (cache)' : 'Cache completo'
            });
          }
          
          setDataLoaded(true);
          setLoading(false);
          setLoadingDesconto(false);
          
          // Se período é fechado, NÃO tenta Firebird
          if (periodoFechado) {
            console.log('[useVendasDashboard] Período fechado - usando apenas cache');
            return;
          }
          
          console.log(`[useVendasDashboard] ✓ Dados do cache carregados em ${tempoMs}ms (${cobertura}% cobertura)`);
          return; // SUCESSO - não precisa ir ao Firebird!
        }
        
        // Cache vazio
        console.log('[useVendasDashboard] ✗ CACHE MISS: Nenhum dado encontrado');
        
        // Se período é fechado mas cache vazio, avisar usuário
        if (periodoFechado) {
          console.log('[useVendasDashboard] Período fechado sem cache - sincronização necessária');
          setDadosFormasPagamento([]);
          setFontesDados({ 
            supabase: false, 
            firebird: false, 
            parcial: true,
            mensagem: 'Período histórico sem dados. Sincronização necessária.'
          });
          setError('Dados históricos não disponíveis no cache. Execute a sincronização.');
          setDataLoaded(true);
          setLoading(false);
          setLoadingDesconto(false);
          return;
        }
        
        console.log('[useVendasDashboard] Cache vazio para período aberto, tentando Firebird...');
        
      } catch (cacheError) {
        console.warn('[useVendasDashboard] Erro ao verificar cache:', cacheError);
        // Continua para o Firebird
      }
    } else {
      console.log('[useVendasDashboard] Forçando busca no Firebird (bypass cache)...');
    }
    
    // PASSO 2: Tentar endpoint light paginado (mais leve, evita timeout)
    try {
      console.log('[useVendasDashboard] Tentando auditoria-formas-pagamento-light paginado...');
      const firebirdStartTime = performance.now();
      
      // Usar endpoint light com paginação para período aberto
      const dadosAuditoria = await getAuditoriaLightCompleta({
        empresa,
        dataInicio,
        dataFim,
        excluirCreditos: true,
      });
      
      const tempoMs = Math.round(performance.now() - firebirdStartTime);
      console.log(`[useVendasDashboard] Auditoria Light OK: ${dadosAuditoria.length} registros em ${tempoMs}ms`);
      
      // Converter para formato ResumoFormaPagamento
      const dadosConvertidos = auditoriaLightToResumo(dadosAuditoria);
      
      setDadosFormasPagamento(dadosConvertidos);
      setFontesDados({ 
        supabase: false, 
        firebird: true,
        mensagem: `Auditoria light paginada: ${dadosAuditoria.length} registros`
      });
      setDataLoaded(true);
      setLoading(false);
      setLoadingDesconto(false);
      
    } catch (auditoriaError) {
      console.warn('[useVendasDashboard] Auditoria light falhou, tentando resumo...', auditoriaError);
      
      // PASSO 2B: Fallback para endpoint resumo tradicional
      try {
        console.log('[useVendasDashboard] Fallback: Tentando resumo-formas-pagamento...');
        const firebirdStartTime = performance.now();
        
        const dadosFirebird = await fetchComRetry(() => 
          getResumoFormasPagamento({
            empresa,
            dataInicio,
            dataFim,
            bypassCache: false,
            excluirCreditos: true,
            incluirDevolucoes: false,
          })
        );
        
        const tempoMs = Math.round(performance.now() - firebirdStartTime);
        console.log(`[useVendasDashboard] Resumo OK: ${dadosFirebird.length} registros em ${tempoMs}ms`);
        
        setDadosFormasPagamento(dadosFirebird);
        setFontesDados({ supabase: false, firebird: true });
        setDataLoaded(true);
        setLoading(false);
        setLoadingDesconto(false);
        
      } catch (firebirdError) {
        console.error('[useVendasDashboard] Firebird falhou:', firebirdError);
        
        // PASSO 3: Firebird falhou - última tentativa no cache
        try {
          const dadosAgregados = await getVendasAgregado({
            empresa,
            dataInicio,
            dataFim,
          });
          
          if (dadosAgregados.length > 0) {
            const diasNoCache = await contarDiasNoCache(dataInicio, dataFim);
            const cobertura = Math.round((diasNoCache / diasNoPeriodo) * 100);
            
            const dadosConvertidos = await converterAgregadoParaResumo(dadosAgregados);
            setDadosFormasPagamento(dadosConvertidos);
            setFontesDados({ 
              supabase: true, 
              firebird: false, 
              parcial: cobertura < 100,
              mensagem: cobertura < 100 
                ? `Servidor offline. Cache parcial: ${diasNoCache}/${diasNoPeriodo} dias (${cobertura}%)`
                : 'Servidor offline. Usando cache local.'
            });
            setDataLoaded(true);
          } else {
            setDadosFormasPagamento([]);
            setFontesDados({ supabase: false, firebird: false, parcial: true });
            setError('Servidor indisponível e sem cache para este período.');
          }
          
        } catch (finalError) {
          console.error('[useVendasDashboard] Todas as fontes falharam:', finalError);
          setDadosFormasPagamento([]);
          setFontesDados({ supabase: false, firebird: false, parcial: true });
          setError('Erro ao carregar dados. Tente novamente.');
        }
        
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

  // Reload normal (usa cache-first)
  const reload = useCallback(() => {
    setForceFirebird(false);
    fetchData(filters.empresa, filters.dataInicio, filters.dataFim, false);
  }, [filters, fetchData]);

  // Reload forçando Firebird (bypass cache)
  const forceRefresh = useCallback(() => {
    setForceFirebird(true);
    fetchData(filters.empresa, filters.dataInicio, filters.dataFim, true);
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
    forceRefresh,
  };
}
