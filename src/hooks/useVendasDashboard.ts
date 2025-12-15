// src/hooks/useVendasDashboard.ts

import { useState, useMemo, useCallback } from "react";
import {
  getResumoEmpresaVendedor,
  getResumoFormasPagamento,
  ResumoEmpresaVendedor,
  ResumoFormaPagamento,
} from "@/services/vendasService";
import { EmpresaParam } from "@/services/firebirdBridge";
import { getDefaultPeriodoMesAtual } from "@/utils/dateValidation";

export type ViewMode = "loja" | "vendedor";

export interface VendasFiltersState {
  dataInicio: string;
  dataFim: string;
  viewMode: ViewMode;
  empresa: EmpresaParam; // 'ALL' | string | number | null
}

export interface ResumoLoja {
  empresa: string;
  totalBruto: number;
  totalDesconto: number;
  totalVendido: number;
  totalDevolucao: number;
  totalLiquidoSemDevolucoes: number;
  totalLiquidoComDevolucoes: number;
  qtdTransacao: number;
  qtdDevolucao: number;
  percentualDesconto: number;
  ticketMedioLiquido: number;
}

export interface VendasMetrics {
  totalBruto: number;
  totalDesconto: number;
  percentualDesconto: number;
  totalVendido: number;
  totalDevolucao: number;
  totalLiquidoSemDevolucoes: number;
  totalLiquidoComDevolucoes: number;
  qtdTransacoes: number;
  ticketMedioLiquido: number;
  percentualDevolucao: number;
}

function agruparPorLoja(dados: ResumoEmpresaVendedor[]): ResumoLoja[] {
  const mapa = new Map<string, ResumoLoja>();

  dados.forEach((d) => {
    const key = d.empresaNomeLogico || d.empresa;
    const existing = mapa.get(key);
    if (existing) {
      existing.totalBruto += d.totalBruto || 0;
      existing.totalDesconto += d.totalDesconto || 0;
      existing.totalVendido += d.totalVendido || 0;
      existing.totalDevolucao += d.totalDevolucao || 0;
      existing.totalLiquidoSemDevolucoes += d.totalLiquidoSemDevolucoes || 0;
      existing.totalLiquidoComDevolucoes += d.totalLiquidoComDevolucoes || 0;
      existing.qtdTransacao += d.qtdTransacao || 0;
      existing.qtdDevolucao += d.qtdDevolucao || 0;
    } else {
      mapa.set(key, {
        empresa: key,
        totalBruto: d.totalBruto || 0,
        totalDesconto: d.totalDesconto || 0,
        totalVendido: d.totalVendido || 0,
        totalDevolucao: d.totalDevolucao || 0,
        totalLiquidoSemDevolucoes: d.totalLiquidoSemDevolucoes || 0,
        totalLiquidoComDevolucoes: d.totalLiquidoComDevolucoes || 0,
        qtdTransacao: d.qtdTransacao || 0,
        qtdDevolucao: d.qtdDevolucao || 0,
        percentualDesconto: 0,
        ticketMedioLiquido: 0,
      });
    }
  });

  return Array.from(mapa.values()).map((loja) => ({
    ...loja,
    percentualDesconto: loja.totalBruto > 0 ? (loja.totalDesconto / loja.totalBruto) * 100 : 0,
    ticketMedioLiquido: loja.qtdTransacao > 0 ? loja.totalVendido / loja.qtdTransacao : 0,
  }));
}

export function useVendasDashboard() {
  const defaultPeriodo = getDefaultPeriodoMesAtual();

  const [filters, setFilters] = useState<VendasFiltersState>({
    dataInicio: defaultPeriodo.dataIni,
    dataFim: defaultPeriodo.dataFim,
    viewMode: "loja",
    empresa: 'ALL', // Default: todas as empresas
  });

  const [dados, setDados] = useState<ResumoEmpresaVendedor[]>([]);
  const [dadosFormasPagamento, setDadosFormasPagamento] = useState<ResumoFormaPagamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingFormas, setLoadingFormas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorFormas, setErrorFormas] = useState<string | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  const fetchData = useCallback(async (empresa: EmpresaParam, dataInicio: string, dataFim: string) => {
    setLoading(true);
    setError(null);
    console.log('[useVendasDashboard] Fetching data...', { empresa, dataInicio, dataFim });
    try {
      const result = await getResumoEmpresaVendedor({ empresa, dataInicio, dataFim });
      console.log('[useVendasDashboard] Dados recebidos:', result.length, 'registros');
      console.log('[useVendasDashboard] Primeiro registro:', result[0]);
      setDados(result);
      setDataLoaded(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao buscar resumo de vendas";
      console.error('[useVendasDashboard] Erro:', message);
      setError(message);
      setDados([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchFormas = useCallback(async (empresa: EmpresaParam, dataInicio: string, dataFim: string) => {
    setLoadingFormas(true);
    setErrorFormas(null);
    try {
      const result = await getResumoFormasPagamento({ empresa, dataInicio, dataFim });
      setDadosFormasPagamento(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao buscar formas de pagamento";
      setErrorFormas(message);
      setDadosFormasPagamento([]);
    } finally {
      setLoadingFormas(false);
    }
  }, []);

  const dadosPorLoja = useMemo(() => agruparPorLoja(dados), [dados]);

  const metrics = useMemo<VendasMetrics>(() => {
    const totalBruto = dados.reduce((acc, d) => acc + (d.totalBruto || 0), 0);
    const totalDesconto = dados.reduce((acc, d) => acc + (d.totalDesconto || 0), 0);
    const totalVendido = dados.reduce((acc, d) => acc + (d.totalVendido || 0), 0);
    const totalDevolucao = dados.reduce((acc, d) => acc + (d.totalDevolucao || 0), 0);
    const totalLiquidoSemDevolucoes = dados.reduce((acc, d) => acc + (d.totalLiquidoSemDevolucoes || 0), 0);
    const totalLiquidoComDevolucoes = dados.reduce((acc, d) => acc + (d.totalLiquidoComDevolucoes || 0), 0);
    const qtdTransacoes = dados.reduce((acc, d) => acc + (d.qtdTransacao || 0), 0);
    const percentualDesconto = totalBruto > 0 ? (totalDesconto / totalBruto) * 100 : 0;
    const ticketMedioLiquido = qtdTransacoes > 0 ? totalVendido / qtdTransacoes : 0;
    const percentualDevolucao = totalVendido > 0 ? (totalDevolucao / totalVendido) * 100 : 0;

    return { 
      totalBruto, 
      totalDesconto, 
      percentualDesconto, 
      totalVendido, 
      totalDevolucao, 
      totalLiquidoSemDevolucoes,
      totalLiquidoComDevolucoes,
      qtdTransacoes,
      ticketMedioLiquido,
      percentualDevolucao,
    };
  }, [dados]);

  const reload = useCallback(() => {
    fetchData(filters.empresa, filters.dataInicio, filters.dataFim);
    fetchFormas(filters.empresa, filters.dataInicio, filters.dataFim);
  }, [filters.empresa, filters.dataInicio, filters.dataFim, fetchData, fetchFormas]);

  return {
    dados,
    dadosPorLoja,
    dadosFormasPagamento,
    dataLoaded,
    loading,
    loadingFormas,
    error,
    errorFormas,
    filters,
    setFilters,
    metrics,
    reload,
  };
}

// Re-export types
export type { ResumoEmpresaVendedor, ResumoFormaPagamento } from '@/services/vendasService';
