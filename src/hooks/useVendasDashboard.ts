// src/hooks/useVendasDashboard.ts
// Hook refatorado para usar APENAS o endpoint de formas de pagamento (mais rápido)
// e calcular métricas agregadas no frontend

import { useState, useMemo, useCallback } from "react";
import {
  getResumoFormasPagamento,
  getResumoEmpresaVendedor,
  ResumoFormaPagamento,
  ResumoEmpresaVendedor as ResumoEmpresaVendedorAPI,
} from "@/services/vendasService";
import { EmpresaParam } from "@/services/firebirdBridge";
import { getDefaultPeriodoMesAtual } from "@/utils/dateValidation";

export type ViewMode = "loja" | "vendedor";

export interface VendasFiltersState {
  dataInicio: string;
  dataFim: string;
  viewMode: ViewMode;
  empresa: EmpresaParam;
}

// Interface agregada por empresa/vendedor (calculada a partir das formas de pagamento)
export interface ResumoEmpresaVendedor {
  empresa: string;
  empresaCodLogico: number;
  empresaNomeLogico: string;
  vendedor: string;
  qtdTransacao: number;
  qtdProdutos: number;
  totalBruto: number;
  totalVendido: number;
  totalDesconto: number;
  percentualDesconto: number;
  totalCreditos: number;
  totalDevolucoes: number;
  totalVendidoSemCreditos: number;
  ticketMedio: number;
}

export interface ResumoLoja {
  empresa: string;
  totalBruto: number;
  totalDesconto: number;
  totalVendido: number;
  percentualDesconto: number;
  totalCreditos: number;
  totalDevolucoes: number;
  totalVendidoSemCreditos: number;
  qtdTransacao: number;
  ticketMedio: number;
}

export interface VendasMetrics {
  totalBruto: number;
  totalDesconto: number;
  percentualDesconto: number;
  totalVendido: number;
  totalCreditos: number;
  totalDevolucoes: number;
  totalVendidoSemCreditos: number;
  qtdTransacoes: number;
  ticketMedio: number;
}

// Função para agregar dados de formas de pagamento por empresa/vendedor
function agruparPorEmpresaVendedor(dados: ResumoFormaPagamento[]): ResumoEmpresaVendedor[] {
  const mapa = new Map<string, {
    empresa: string;
    codEmpresa: number;
    vendedor: string;
    totalVendido: number;
    totalCreditos: number;
    totalDevolucoes: number;
    qtdTransacao: number;
  }>();

  dados.forEach((d) => {
    const key = `${d.codEmpresa}-${d.vendedor}`;
    const existing = mapa.get(key);
    
    // Comparação case-insensitive para robustez
    const formaPagamentoUpper = (d.formaPagamento || '').toUpperCase().trim();
    const isDevolucao = formaPagamentoUpper === 'DEVOLUCAO';
    const isCredito = formaPagamentoUpper === 'CREDITOS' || formaPagamentoUpper === 'CREDITO';
    
    // Devoluções: ignorar no total de vendas, guardar separadamente como indicador
    // Créditos: não somar no valorVenda, somar separadamente
    const valorVenda = (isDevolucao || isCredito) ? 0 : d.totalGeral;
    const valorCredito = isCredito ? d.totalGeral : 0;
    const valorDevolucao = isDevolucao ? Math.abs(d.totalGeral) : 0;
    // Não contar devoluções nas transações
    const qtdVendas = isDevolucao ? 0 : d.qtdVendas;
    
    if (existing) {
      existing.totalVendido += valorVenda + valorCredito;
      existing.totalCreditos += valorCredito;
      existing.totalDevolucoes += valorDevolucao;
      existing.qtdTransacao += qtdVendas;
    } else {
      mapa.set(key, {
        empresa: d.empresa,
        codEmpresa: d.codEmpresa,
        vendedor: d.vendedor,
        totalVendido: valorVenda + valorCredito,
        totalCreditos: valorCredito,
        totalDevolucoes: valorDevolucao,
        qtdTransacao: qtdVendas,
      });
    }
  });

  return Array.from(mapa.values()).map((item) => {
    const totalVendidoSemCreditos = item.totalVendido - item.totalCreditos;
    const ticketMedio = item.qtdTransacao > 0 ? totalVendidoSemCreditos / item.qtdTransacao : 0;
    
    return {
      empresa: item.empresa,
      empresaCodLogico: item.codEmpresa,
      empresaNomeLogico: item.empresa,
      vendedor: item.vendedor,
      qtdTransacao: item.qtdTransacao,
      qtdProdutos: 0, // Não disponível neste endpoint
      totalBruto: item.totalVendido, // Aproximação: total vendido
      totalVendido: item.totalVendido,
      totalDesconto: 0, // Não disponível neste endpoint
      percentualDesconto: 0, // Não disponível
      totalCreditos: item.totalCreditos,
      totalDevolucoes: item.totalDevolucoes,
      totalVendidoSemCreditos,
      ticketMedio,
    };
  });
}

// Função para agregar por loja
function agruparPorLoja(dados: ResumoEmpresaVendedor[]): ResumoLoja[] {
  const mapa = new Map<string, ResumoLoja>();

  dados.forEach((d) => {
    const key = d.empresaNomeLogico || d.empresa;
    const existing = mapa.get(key);
    if (existing) {
      existing.totalBruto += d.totalBruto || 0;
      existing.totalDesconto += d.totalDesconto || 0;
      existing.totalVendido += d.totalVendido || 0;
      existing.qtdTransacao += d.qtdTransacao || 0;
      existing.totalCreditos += d.totalCreditos || 0;
      existing.totalDevolucoes += d.totalDevolucoes || 0;
      existing.totalVendidoSemCreditos += d.totalVendidoSemCreditos || 0;
    } else {
      mapa.set(key, {
        empresa: key,
        totalBruto: d.totalBruto || 0,
        totalDesconto: d.totalDesconto || 0,
        totalVendido: d.totalVendido || 0,
        qtdTransacao: d.qtdTransacao || 0,
        percentualDesconto: 0,
        ticketMedio: 0,
        totalCreditos: d.totalCreditos || 0,
        totalDevolucoes: d.totalDevolucoes || 0,
        totalVendidoSemCreditos: d.totalVendidoSemCreditos || 0,
      });
    }
  });

  return Array.from(mapa.values()).map((loja) => ({
    ...loja,
    percentualDesconto: loja.totalBruto > 0 ? (loja.totalDesconto / loja.totalBruto) * 100 : 0,
    ticketMedio: loja.qtdTransacao > 0 ? loja.totalVendidoSemCreditos / loja.qtdTransacao : 0,
  }));
}

// Função para calcular métricas globais a partir das formas de pagamento
function calcularMetricasDeFormasPagamento(dados: ResumoFormaPagamento[]): VendasMetrics {
  let totalVendido = 0;
  let totalCreditos = 0;
  let totalDevolucoes = 0;
  let qtdTransacoes = 0;

  // Debug: Log das formas de pagamento únicas encontradas
  const formasUnicas = [...new Set(dados.map(d => d.formaPagamento))];
  console.log('[Métricas] Formas de pagamento encontradas:', formasUnicas);

  dados.forEach((d) => {
    // Comparação case-insensitive para robustez
    const formaPagamentoUpper = (d.formaPagamento || '').toUpperCase().trim();
    const isDevolucao = formaPagamentoUpper === 'DEVOLUCAO';
    const isCredito = formaPagamentoUpper === 'CREDITOS' || formaPagamentoUpper === 'CREDITO';
    
    // Devoluções: NÃO subtrair do total de vendas, apenas guardar como indicador
    if (isDevolucao) {
      totalDevolucoes += Math.abs(d.totalGeral);
    } else {
      // Vendas normais e créditos
      totalVendido += d.totalGeral;
      
      if (isCredito) {
        totalCreditos += d.totalGeral;
      }
      
      // Contar transações (exceto devoluções)
      qtdTransacoes += d.qtdVendas;
    }
  });

  console.log('[Métricas] Total Vendido (sem devoluções):', totalVendido);
  console.log('[Métricas] Total Créditos:', totalCreditos);
  console.log('[Métricas] Total Devoluções (indicador):', totalDevolucoes);
  console.log('[Métricas] Total Vendido Sem Créditos:', totalVendido - totalCreditos);

  const totalVendidoSemCreditos = totalVendido - totalCreditos;
  const ticketMedio = qtdTransacoes > 0 ? totalVendidoSemCreditos / qtdTransacoes : 0;

  return {
    totalBruto: totalVendido, // Aproximação
    totalDesconto: 0, // Não disponível
    percentualDesconto: 0, // Não disponível
    totalVendido,
    totalCreditos,
    totalDevolucoes,
    totalVendidoSemCreditos,
    qtdTransacoes,
    ticketMedio,
  };
}

export function useVendasDashboard() {
  const defaultPeriodo = getDefaultPeriodoMesAtual();

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

  // Buscar formas de pagamento (rápido) - não bloqueia por desconto
  const fetchData = useCallback(async (empresa: EmpresaParam, dataInicio: string, dataFim: string) => {
    setLoading(true);
    setError(null);
    setLoadingDesconto(true);
    setErroDesconto(null);
    
    // Buscar formas de pagamento primeiro (endpoint rápido)
    try {
      const resultFormas = await getResumoFormasPagamento({ empresa, dataInicio, dataFim });
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
      console.log('[useVendasDashboard] Iniciando busca de desconto...', { empresa, dataInicio, dataFim });
      const resultDesconto = await getResumoEmpresaVendedor({ empresa, dataInicio, dataFim });
      
      // Debug detalhado dos dados de desconto
      console.log('[useVendasDashboard] Desconto recebido:', resultDesconto.length, 'registros');
      if (resultDesconto.length > 0) {
        console.log('[useVendasDashboard] Primeiro registro completo:', JSON.stringify(resultDesconto[0], null, 2));
        console.log('[useVendasDashboard] Campos de desconto do primeiro:', {
          totalDesconto: resultDesconto[0].totalDesconto,
          percentualDesconto: resultDesconto[0].percentualDesconto,
          totalBruto: resultDesconto[0].totalBruto,
          totalVendido: resultDesconto[0].totalVendido,
        });
        
        const temDesconto = resultDesconto.some(d => d.percentualDesconto > 0 || d.totalDesconto > 0);
        console.log('[useVendasDashboard] Algum registro tem desconto > 0?', temDesconto);
        
        if (!temDesconto) {
          console.warn('[useVendasDashboard] ATENÇÃO: Nenhum registro tem desconto > 0!');
          console.log('[useVendasDashboard] Amostra de 3 registros:', resultDesconto.slice(0, 3));
        }
      }
      
      setDadosComDesconto(resultDesconto);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao buscar dados de desconto";
      console.warn('[useVendasDashboard] Erro desconto (não crítico):', message);
      setErroDesconto('Não foi possível carregar dados de desconto. Tente filtrar por loja.');
      setDadosComDesconto([]);
    } finally {
      setLoadingDesconto(false);
    }
  }, []);

  // Dados agregados por empresa/vendedor (calculados a partir das formas de pagamento)
  const dados = useMemo(() => agruparPorEmpresaVendedor(dadosFormasPagamento), [dadosFormasPagamento]);
  
  // Dados agregados por loja
  const dadosPorLoja = useMemo(() => agruparPorLoja(dados), [dados]);

  // Métricas globais calculadas a partir das formas de pagamento
  const metrics = useMemo<VendasMetrics>(() => calcularMetricasDeFormasPagamento(dadosFormasPagamento), [dadosFormasPagamento]);

  const reload = useCallback(() => {
    fetchData(filters.empresa, filters.dataInicio, filters.dataFim);
  }, [filters.empresa, filters.dataInicio, filters.dataFim, fetchData]);

  return {
    dados,
    dadosPorLoja,
    dadosFormasPagamento,
    dadosComDesconto,
    dataLoaded,
    loading,
    loadingFormas: loading, // Mantém compatibilidade
    loadingDesconto,
    error,
    errorFormas: error, // Mantém compatibilidade
    erroDesconto,
    filters,
    setFilters,
    metrics,
    reload,
  };
}

// Re-export types
export type { ResumoFormaPagamento } from '@/services/vendasService';
