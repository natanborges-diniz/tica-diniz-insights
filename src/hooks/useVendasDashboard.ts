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
  totalOriginal: number;
  totalVendido: number;
  ticketMedio: number;
  totalDevolucao: number;
  qtdTransacao: number;
  qtdDevolucao: number;
}

export interface VendasMetrics {
  totalVendido: number;
  ticketMedio: number;
  qtdTransacoes: number;
  totalDevolucao: number;
}

function agruparPorLoja(dados: ResumoEmpresaVendedor[]): ResumoLoja[] {
  const mapa = new Map<string, ResumoLoja>();

  dados.forEach((d) => {
    const existing = mapa.get(d.empresa);
    if (existing) {
      existing.totalOriginal += d.totalOriginal || 0;
      existing.totalVendido += d.totalVendido || 0;
      existing.totalDevolucao += d.totalDevolucao || 0;
      existing.qtdTransacao += d.qtdTransacao || 0;
      existing.qtdDevolucao += d.qtdDevolucao || 0;
    } else {
      mapa.set(d.empresa, {
        empresa: d.empresa,
        totalOriginal: d.totalOriginal || 0,
        totalVendido: d.totalVendido || 0,
        ticketMedio: 0,
        totalDevolucao: d.totalDevolucao || 0,
        qtdTransacao: d.qtdTransacao || 0,
        qtdDevolucao: d.qtdDevolucao || 0,
      });
    }
  });

  return Array.from(mapa.values()).map((loja) => ({
    ...loja,
    ticketMedio: loja.qtdTransacao > 0 ? loja.totalVendido / loja.qtdTransacao : 0,
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
    try {
      const result = await getResumoEmpresaVendedor({ empresa, dataInicio, dataFim });
      setDados(result);
      setDataLoaded(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao buscar resumo de vendas";
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
    const totalVendido = dados.reduce((acc, d) => acc + (d.totalVendido || 0), 0);
    const qtdTransacoes = dados.reduce((acc, d) => acc + (d.qtdTransacao || 0), 0);
    const totalDevolucao = dados.reduce((acc, d) => acc + (d.totalDevolucao || 0), 0);
    const ticketMedio = qtdTransacoes > 0 ? totalVendido / qtdTransacoes : 0;

    return { totalVendido, ticketMedio, qtdTransacoes, totalDevolucao };
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
