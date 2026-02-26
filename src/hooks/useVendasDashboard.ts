// src/hooks/useVendasDashboard.ts
// Hook para dashboard de vendas - VERSÃO HÍBRIDA (CACHE + FIREBIRD)
// Estratégia: 
//   - Períodos FECHADOS (meses anteriores): usar cache Supabase
//   - Período ABERTO (mês atual): buscar do Firebird Bridge
//   - Concatenar os dois resultados

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  getResumoFormasPagamento,
  ResumoFormaPagamento,
  ResumoEmpresaVendedor as ResumoEmpresaVendedorAPI,
} from "@/services/vendasService";
import { EmpresaParam } from "@/services/firebirdBridge";
import { getPeriodoComercial, formatLocalDate, diffInDays } from "@/utils/dateValidation";
import { supabase } from "@/integrations/supabase/client";
import { separarPeriodo } from "@/services/agregadosService";
import { useDefaultEmpresa } from "./useDefaultEmpresa";

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
  // Importar empresa padrão do profile — nunca ALL por default
  const { defaultEmpresa } = useDefaultEmpresa();
  
  const [filters, setFilters] = useState<VendasFiltersState>({
    dataInicio: formatLocalDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
    dataFim: formatLocalDate(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)),
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
  useEffect(() => {
    if (periodoCarregado.current) return;
    periodoCarregado.current = true;
    getPeriodoComercial().then(p => {
      setFilters(prev => ({ ...prev, dataInicio: p.dataIni, dataFim: p.dataFim }));
    });
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

  // Ref para controlar requisições em andamento
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Ref para debounce
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    
    const startTime = performance.now();
    
    try {
      // ========================================
      // ESTRATÉGIA HÍBRIDA: CACHE + FIREBIRD
      // ========================================
      
      const periodoInfo = separarPeriodo(dataInicio, dataFim);
      
      console.log('[useVendasDashboard] 🔄 Análise do período:', {
        mesesFechados: periodoInfo.mesesFechados,
        mesAberto: periodoInfo.mesAberto,
        todosFechados: periodoInfo.todosFechados,
      });
      
      let dadosCache: ResumoFormaPagamento[] = [];
      let dadosFirebird: ResumoFormaPagamento[] = [];
      let usouCache = false;
      let usouFirebird = false;
      
      // ========================================
      // PASSO 1: Buscar meses fechados do CACHE
      // Usa .gte()/.lte() com range de datas dos meses fechados
      // ========================================
      if (periodoInfo.mesesFechados.length > 0) {
        console.log('[useVendasDashboard] 📦 Buscando meses fechados do cache...');
        
        try {
          // Calcular range completo dos meses fechados
          const ultimoMesFechado = periodoInfo.mesesFechados[0]; // mais recente
          const primeiroMesFechado = periodoInfo.mesesFechados[periodoInfo.mesesFechados.length - 1]; // mais antigo
          
          // Primeiro dia do mês mais antigo
          const primeiroDia = primeiroMesFechado.substring(0, 7) + '-01';
          
          let queryCache = supabase
            .from('vendas_agregado_diario')
            .select('*')
            .gte('data', primeiroDia)
            .lte('data', ultimoMesFechado);
          
          if (empresa !== 'ALL') {
            const codEmpresa = typeof empresa === 'string' 
              ? parseInt(empresa, 10) 
              : empresa;
            queryCache = queryCache.eq('cod_empresa', codEmpresa);
          }
          
          const { data: cacheData, error: cacheError } = await queryCache;
          
          if (!cacheError && cacheData && cacheData.length > 0) {
            // Buscar nomes das empresas
            const empresasMap = await getEmpresasMap();
            
            // Converter dados do cache para ResumoFormaPagamento
            dadosCache = cacheData.map(d => ({
              codEmpresa: d.cod_empresa,
              empresa: empresasMap.get(d.cod_empresa) || `Loja ${d.cod_empresa}`,
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
            
            usouCache = true;
            console.log(`[useVendasDashboard] ✓ Cache: ${dadosCache.length} registros de meses fechados (${primeiroDia} a ${ultimoMesFechado})`);
          } else {
            console.log('[useVendasDashboard] ⚠ Cache vazio para meses fechados, buscando do Firebird...');
            
            // Se não tem cache, buscar meses fechados do Firebird
            dadosCache = await fetchComRetry(() => getResumoFormasPagamento({
              empresa,
              dataInicio: primeiroDia,
              dataFim: ultimoMesFechado,
              bypassCache: true,
              incluirDevolucoes: true,
            }));
            
            usouFirebird = true;
            console.log(`[useVendasDashboard] ✓ Firebird (meses fechados): ${dadosCache.length} registros`);
          }
        } catch (cacheErr) {
          console.warn('[useVendasDashboard] Erro ao buscar cache, usando Firebird:', cacheErr);
        }
      }
      
      // ========================================
      // PASSO 2: Buscar mês ABERTO do FIREBIRD
      // ========================================
      if (periodoInfo.mesAberto) {
        console.log('[useVendasDashboard] 🔥 Buscando período aberto do Firebird...');
        
        dadosFirebird = await fetchComRetry(() => getResumoFormasPagamento({
          empresa,
          dataInicio: periodoInfo.mesAberto!.inicio,
          dataFim: periodoInfo.mesAberto!.fim,
          bypassCache: true,
          incluirDevolucoes: true,
        }));
        
        usouFirebird = true;
        console.log(`[useVendasDashboard] ✓ Firebird (período aberto): ${dadosFirebird.length} registros`);
      }
      
      // ========================================
      // PASSO 3: Se período TODO fechado e cache vazio, buscar tudo do Firebird
      // ========================================
      if (periodoInfo.todosFechados && dadosCache.length === 0) {
        console.log('[useVendasDashboard] 📡 Período fechado sem cache, buscando tudo do Firebird...');
        
        dadosCache = await fetchComRetry(() => getResumoFormasPagamento({
          empresa,
          dataInicio,
          dataFim,
          bypassCache: true,
          incluirDevolucoes: true,
        }));
        
        usouFirebird = true;
      }
      
      // ========================================
      // PASSO 4: Concatenar e agregar resultados
      // ========================================
      const todosOsDados = [...dadosCache, ...dadosFirebird];
      
      // Agregar por chave única (empresa + vendedor + forma_pagamento)
      const mapaAgregado = new Map<string, ResumoFormaPagamento>();
      
      todosOsDados.forEach(d => {
        const key = `${d.codEmpresa}|${d.vendedor}|${d.formaPagamento}`;
        const existing = mapaAgregado.get(key);
        
        if (existing) {
          existing.totalGeral += d.totalGeral;
          existing.qtdVendas += d.qtdVendas;
          existing.totalBruto += d.totalBruto;
          existing.totalDesconto += d.totalDesconto;
        } else {
          mapaAgregado.set(key, { ...d });
        }
      });
      
      // Recalcular percentual de desconto
      const dadosFinais = Array.from(mapaAgregado.values()).map(d => ({
        ...d,
        percentualDesconto: d.totalBruto > 0 ? (d.totalDesconto / d.totalBruto) * 100 : 0,
      }));
      
      const tempoMs = Math.round(performance.now() - startTime);
      
      console.log(`[useVendasDashboard] ✓ Total: ${dadosFinais.length} registros agregados em ${tempoMs}ms`);
      
      // Definir fonte dos dados
      let mensagemFonte = '';
      if (usouCache && usouFirebird) {
        mensagemFonte = `Híbrido: cache + Firebird (${tempoMs}ms)`;
      } else if (usouCache) {
        mensagemFonte = `Cache Supabase (${tempoMs}ms)`;
      } else {
        mensagemFonte = `Firebird ao vivo (${tempoMs}ms)`;
      }
      
      if (dadosFinais.length > 0) {
        setDadosFormasPagamento(dadosFinais);
        setFontesDados({ 
          supabase: usouCache, 
          firebird: usouFirebird,
          mensagem: mensagemFonte,
        });
        setDataLoaded(true);
      } else {
        setDadosFormasPagamento([]);
        setFontesDados({ 
          supabase: false, 
          firebird: true,
          mensagem: 'Nenhuma venda no período',
        });
        setDataLoaded(true);
      }
      
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      
      // Ignorar erros de abort (requisição cancelada pelo debounce)
      if (message.includes('aborted') || message.includes('abort')) {
        console.log('[useVendasDashboard] Requisição cancelada (debounce/navegação)');
        return;
      }
      
      console.error('[useVendasDashboard] ❌ Erro ao buscar dados:', message);
      
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
  }, [fetchComRetry]);

  // ========================================
  // DEBOUNCED EFFECT: Carregar dados com delay
  // Evita disparos múltiplos ao digitar datas
  // ========================================
  useEffect(() => {
    const { empresa, dataInicio, dataFim } = filters;
    
    // Guard rápido: sem empresa ou datas inválidas, não agendar fetch
    if (!empresa || empresa === '') return;
    if (!isDateRangeValid(dataInicio, dataFim)) return;
    
    // Cancelar debounce anterior
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    // Agendar novo fetch com debounce
    debounceTimerRef.current = setTimeout(() => {
      fetchData(empresa, dataInicio, dataFim);
    }, CONFIG.DEBOUNCE_MS);
    
    // Cleanup: cancelar debounce e requisição ao desmontar
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
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
    // Estados removidos (mantidos para compatibilidade)
    syncStatus: null,
    isSyncing: false,
  };
}
