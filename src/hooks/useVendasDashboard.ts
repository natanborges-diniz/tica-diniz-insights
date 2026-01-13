// src/hooks/useVendasDashboard.ts
// Hook para dashboard de vendas
// IMPORTANTE: Dados de desconto vêm APENAS do endpoint resumo-empresa-vendedor (lento)
// Dados de formas de pagamento vêm do endpoint resumo-formas-pagamento (rápido)

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  getResumoFormasPagamento,
  getResumoEmpresaVendedor,
  ResumoFormaPagamento,
  ResumoEmpresaVendedor as ResumoEmpresaVendedorAPI,
} from "@/services/vendasService";
import { EmpresaParam } from "@/services/firebirdBridge";
import { getPeriodoComercial, formatLocalDate, diffInDays } from "@/utils/dateValidation";

export type ViewMode = "loja" | "vendedor";

export interface VendasFiltersState {
  dataInicio: string;
  dataFim: string;
  viewMode: ViewMode;
  empresa: EmpresaParam;
}

// Interface para métricas globais
export interface VendasMetrics {
  // Vendas (do endpoint rápido)
  totalVendido: number;
  totalCreditos: number;
  totalDevolucoes: number;
  totalVendidoSemCreditos: number;
  qtdTransacoes: number;
  ticketMedio: number;
  // Desconto (do endpoint lento - pode estar indisponível)
  totalBruto: number;
  totalDesconto: number;
  percentualDesconto: number;
  descontoDisponivel: boolean;
}

// Interface para projeção de fechamento
export interface ProjecaoFechamento {
  temProjecao: boolean; // true se há datas futuras no período
  diasTotais: number;
  diasDecorridos: number;
  diasRestantes: number;
  mediaDiaria: number;
  projecaoFechamento: number;
  percentualPeriodo: number;
}

// Interface agregada por loja
export interface ResumoLoja {
  empresa: string;
  totalVendido: number;
  totalCreditos: number;
  totalDevolucoes: number;
  totalVendidoSemCreditos: number;
  qtdTransacao: number;
  ticketMedio: number;
  // Desconto (opcional, pode não estar disponível)
  totalBruto: number;
  totalDesconto: number;
  percentualDesconto: number;
}

// Re-export da interface do service para usar nos componentes
export type { ResumoEmpresaVendedorAPI as ResumoEmpresaVendedor };
export type { ResumoFormaPagamento };

// Função para calcular métricas de formas de pagamento (rápido, sem desconto)
function calcularMetricasFormasPagamento(dados: ResumoFormaPagamento[]) {
  let totalVendido = 0;
  let totalCreditos = 0;
  let totalDevolucoes = 0;
  let qtdTransacoes = 0;

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
    }
  });

  const totalVendidoSemCreditos = totalVendido - totalCreditos;
  const ticketMedio = qtdTransacoes > 0 ? totalVendidoSemCreditos / qtdTransacoes : 0;

  return {
    totalVendido,
    totalCreditos,
    totalDevolucoes,
    totalVendidoSemCreditos,
    qtdTransacoes,
    ticketMedio,
  };
}

// Função para calcular métricas de desconto (do endpoint lento)
function calcularMetricasDesconto(dados: ResumoEmpresaVendedorAPI[]) {
  let totalBruto = 0;
  let totalDesconto = 0;

  dados.forEach((d) => {
    totalBruto += d.totalBruto || 0;
    totalDesconto += d.totalDesconto || 0;
  });

  const percentualDesconto = totalBruto > 0 ? (totalDesconto / totalBruto) * 100 : 0;

  return {
    totalBruto,
    totalDesconto,
    percentualDesconto,
  };
}

// Função para agregar dados de formas de pagamento por loja
function agruparPorLoja(dados: ResumoFormaPagamento[], dadosDesconto: ResumoEmpresaVendedorAPI[]): ResumoLoja[] {
  // Primeiro, agregar formas de pagamento por empresa
  const mapaFormas = new Map<number, {
    empresa: string;
    codEmpresa: number;
    totalVendido: number;
    totalCreditos: number;
    totalDevolucoes: number;
    qtdTransacao: number;
  }>();

  dados.forEach((d) => {
    const existing = mapaFormas.get(d.codEmpresa);
    
    const formaPagamentoUpper = (d.formaPagamento || '').toUpperCase().trim();
    const isDevolucao = formaPagamentoUpper === 'DEVOLUCAO';
    const isCredito = formaPagamentoUpper === 'CREDITOS' || formaPagamentoUpper === 'CREDITO';
    
    const valorVenda = (isDevolucao || isCredito) ? 0 : d.totalGeral;
    const valorCredito = isCredito ? d.totalGeral : 0;
    const valorDevolucao = isDevolucao ? Math.abs(d.totalGeral) : 0;
    const qtdVendas = isDevolucao ? 0 : d.qtdVendas;
    
    if (existing) {
      existing.totalVendido += valorVenda + valorCredito;
      existing.totalCreditos += valorCredito;
      existing.totalDevolucoes += valorDevolucao;
      existing.qtdTransacao += qtdVendas;
    } else {
      mapaFormas.set(d.codEmpresa, {
        empresa: d.empresa,
        codEmpresa: d.codEmpresa,
        totalVendido: valorVenda + valorCredito,
        totalCreditos: valorCredito,
        totalDevolucoes: valorDevolucao,
        qtdTransacao: qtdVendas,
      });
    }
  });

  // Depois, agregar desconto por empresa (se disponível)
  const mapaDesconto = new Map<number, { totalBruto: number; totalDesconto: number }>();
  dadosDesconto.forEach((d) => {
    const existing = mapaDesconto.get(d.empresaCodLogico);
    if (existing) {
      existing.totalBruto += d.totalBruto || 0;
      existing.totalDesconto += d.totalDesconto || 0;
    } else {
      mapaDesconto.set(d.empresaCodLogico, {
        totalBruto: d.totalBruto || 0,
        totalDesconto: d.totalDesconto || 0,
      });
    }
  });

  // Combinar dados
  return Array.from(mapaFormas.values()).map((item) => {
    const totalVendidoSemCreditos = item.totalVendido - item.totalCreditos;
    const ticketMedio = item.qtdTransacao > 0 ? totalVendidoSemCreditos / item.qtdTransacao : 0;
    const desconto = mapaDesconto.get(item.codEmpresa);
    const totalBruto = desconto?.totalBruto || 0;
    const totalDesconto = desconto?.totalDesconto || 0;
    const percentualDesconto = totalBruto > 0 ? (totalDesconto / totalBruto) * 100 : 0;
    
    return {
      empresa: item.empresa,
      totalVendido: item.totalVendido,
      totalCreditos: item.totalCreditos,
      totalDevolucoes: item.totalDevolucoes,
      totalVendidoSemCreditos,
      qtdTransacao: item.qtdTransacao,
      ticketMedio,
      totalBruto,
      totalDesconto,
      percentualDesconto,
    };
  });
}

export function useVendasDashboard() {
  // Período comercial: dia 21 do mês anterior ao dia 20 do mês atual
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

  const fetchData = useCallback(async (
    empresa: EmpresaParam, 
    dataInicio: string, 
    dataFim: string,
    options?: { bypassCache?: boolean }
  ) => {
    const bypassCache = options?.bypassCache ?? false;
    
    setLoading(true);
    setError(null);
    setLoadingDesconto(true);
    setErroDesconto(null);
    
    // Buscar formas de pagamento primeiro (endpoint rápido)
    try {
      const resultFormas = await getResumoFormasPagamento({ 
        empresa, 
        dataInicio, 
        dataFim,
        bypassCache,
      });
      console.log('[useVendasDashboard] Formas de pagamento:', resultFormas.length, 'registros', bypassCache ? '(sem cache)' : '(cache)');
      setDadosFormasPagamento(resultFormas);
      setDataLoaded(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao buscar dados de vendas";
      console.error('[useVendasDashboard] Erro formas pagamento:', message);
      setError(message);
      setDadosFormasPagamento([]);
    } finally {
      setLoading(false);
    }

    // Buscar dados de desconto separadamente (endpoint lento, pode dar timeout)
    try {
      console.log('[useVendasDashboard] Buscando dados de desconto...', bypassCache ? '(sem cache)' : '(cache)');
      const resultDesconto = await getResumoEmpresaVendedor({ 
        empresa, 
        dataInicio, 
        dataFim,
        bypassCache,
      });
      console.log('[useVendasDashboard] Desconto recebido:', resultDesconto.length, 'registros');
      
      if (resultDesconto.length > 0) {
        const amostra = resultDesconto[0];
        console.log('[useVendasDashboard] Amostra:', {
          vendedor: amostra.vendedor,
          totalBruto: amostra.totalBruto,
          totalDesconto: amostra.totalDesconto,
          percentualDesconto: amostra.percentualDesconto,
        });
      }
      
      setDadosComDesconto(resultDesconto);
      setErroDesconto(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao buscar dados de desconto";
      console.warn('[useVendasDashboard] Erro desconto:', message);
      setErroDesconto('Dados de desconto indisponíveis. Tente filtrar por loja.');
      setDadosComDesconto([]);
    } finally {
      setLoadingDesconto(false);
    }
  }, []);

  // Métricas calculadas
  const metrics = useMemo<VendasMetrics>(() => {
    const metricasFormas = calcularMetricasFormasPagamento(dadosFormasPagamento);
    const metricasDesconto = calcularMetricasDesconto(dadosComDesconto);
    const descontoDisponivel = dadosComDesconto.length > 0;

    console.log('[Métricas] Formas de pagamento:', metricasFormas);
    console.log('[Métricas] Desconto:', metricasDesconto, 'disponível:', descontoDisponivel);

    return {
      ...metricasFormas,
      ...metricasDesconto,
      descontoDisponivel,
    };
  }, [dadosFormasPagamento, dadosComDesconto]);

  // Projeção de fechamento do período
  const projecao = useMemo<ProjecaoFechamento>(() => {
    const hoje = new Date();
    const hojeStr = formatLocalDate(hoje);
    const dataInicio = new Date(filters.dataInicio + 'T00:00:00');
    const dataFim = new Date(filters.dataFim + 'T00:00:00');
    
    // Calcular dias totais do período
    const diasTotais = diffInDays(filters.dataInicio, filters.dataFim) + 1;
    
    // Verificar se há datas futuras no período
    const temProjecao = hojeStr < filters.dataFim;
    
    if (!temProjecao) {
      // Período já encerrado - sem projeção
      return {
        temProjecao: false,
        diasTotais,
        diasDecorridos: diasTotais,
        diasRestantes: 0,
        mediaDiaria: 0,
        projecaoFechamento: 0,
        percentualPeriodo: 100,
      };
    }
    
    // Calcular dias decorridos (desde início até hoje ou início do período)
    let diasDecorridos = 0;
    if (hojeStr >= filters.dataInicio) {
      diasDecorridos = diffInDays(filters.dataInicio, hojeStr) + 1;
    }
    
    const diasRestantes = diasTotais - diasDecorridos;
    const percentualPeriodo = diasTotais > 0 ? (diasDecorridos / diasTotais) * 100 : 0;
    
    // Média diária baseada no faturamento atual
    const totalAtual = metrics.totalVendidoSemCreditos;
    const mediaDiaria = diasDecorridos > 0 ? totalAtual / diasDecorridos : 0;
    
    // Projeção para o fechamento do período
    const projecaoFechamento = mediaDiaria * diasTotais;
    
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

  // Dados agregados por loja
  const dadosPorLoja = useMemo(
    () => agruparPorLoja(dadosFormasPagamento, dadosComDesconto),
    [dadosFormasPagamento, dadosComDesconto]
  );

  // Reload normal (usa cache do backend)
  const reload = useCallback(() => {
    fetchData(filters.empresa, filters.dataInicio, filters.dataFim);
  }, [filters.empresa, filters.dataInicio, filters.dataFim, fetchData]);

  // Reload "ao vivo" - ignora cache e busca dados frescos
  const reloadLive = useCallback(() => {
    fetchData(filters.empresa, filters.dataInicio, filters.dataFim, { bypassCache: true });
  }, [filters.empresa, filters.dataInicio, filters.dataFim, fetchData]);

  // Auto-load on mount
  useEffect(() => {
    reload();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    // Dados brutos
    dadosFormasPagamento,
    dadosComDesconto, // Dados com desconto do endpoint lento
    dadosPorLoja,
    dataLoaded,
    // Loading/Error
    loading,
    loadingFormas: loading,
    loadingDesconto,
    error,
    errorFormas: error,
    erroDesconto,
    // Filtros e ações
    filters,
    setFilters,
    metrics,
    projecao,
    reload,       // Usa cache (padrão)
    reloadLive,   // Força dados frescos (cache=0)
  };
}
