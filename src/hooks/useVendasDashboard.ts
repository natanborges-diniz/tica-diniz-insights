// src/hooks/useVendasDashboard.ts

import { useState, useEffect, useMemo, useCallback } from "react";
import { format, startOfMonth } from "date-fns";
import {
  fetchResumoEmpresaVendedor,
  fetchResumoFormasPagamento,
  ResumoEmpresaVendedor,
  ResumoFormaPagamento,
} from "@/services/firebirdBridge";

export type ViewMode = "loja" | "vendedor";

export interface VendasFiltersState {
  dataInicio: string;
  dataFim: string;
  viewMode: ViewMode;
}

export interface ResumoLoja {
  EMPRESA: string;
  TOTALORIGINAL: number;
  TOTALVENDIDO: number;
  TICKETMEDIO: number;
  TOTALDEVOLUCAO: number;
  QTDTRANSACAO: number;
  QTDDEVOLUCAO: number;
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
    const existing = mapa.get(d.EMPRESA);
    if (existing) {
      existing.TOTALORIGINAL += d.TOTALORIGINAL || 0;
      existing.TOTALVENDIDO += d.TOTALVENDIDO || 0;
      existing.TOTALDEVOLUCAO += d.TOTALDEVOLUCAO || 0;
      existing.QTDTRANSACAO += d.QTDTRANSACAO || 0;
      existing.QTDDEVOLUCAO += d.QTDDEVOLUCAO || 0;
    } else {
      mapa.set(d.EMPRESA, {
        EMPRESA: d.EMPRESA,
        TOTALORIGINAL: d.TOTALORIGINAL || 0,
        TOTALVENDIDO: d.TOTALVENDIDO || 0,
        TICKETMEDIO: 0,
        TOTALDEVOLUCAO: d.TOTALDEVOLUCAO || 0,
        QTDTRANSACAO: d.QTDTRANSACAO || 0,
        QTDDEVOLUCAO: d.QTDDEVOLUCAO || 0,
      });
    }
  });

  return Array.from(mapa.values()).map((loja) => ({
    ...loja,
    TICKETMEDIO: loja.QTDTRANSACAO > 0 ? loja.TOTALVENDIDO / loja.QTDTRANSACAO : 0,
  }));
}

export function useVendasDashboard() {
  const hoje = new Date();
  const primeiroDiaMes = startOfMonth(hoje);

  const [filters, setFilters] = useState<VendasFiltersState>({
    dataInicio: format(primeiroDiaMes, "yyyy-MM-dd"),
    dataFim: format(hoje, "yyyy-MM-dd"),
    viewMode: "loja",
  });

  const [dados, setDados] = useState<ResumoEmpresaVendedor[]>([]);
  const [dadosFormasPagamento, setDadosFormasPagamento] = useState<ResumoFormaPagamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingFormas, setLoadingFormas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorFormas, setErrorFormas] = useState<string | null>(null);

  const fetchData = useCallback(async (dataInicio: string, dataFim: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchResumoEmpresaVendedor(dataInicio, dataFim);
      setDados(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao buscar resumo de vendas";
      setError(message);
      setDados([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchFormas = useCallback(async (dataInicio: string, dataFim: string) => {
    setLoadingFormas(true);
    setErrorFormas(null);
    try {
      const result = await fetchResumoFormasPagamento(dataInicio, dataFim);
      setDadosFormasPagamento(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao buscar formas de pagamento";
      setErrorFormas(message);
      setDadosFormasPagamento([]);
    } finally {
      setLoadingFormas(false);
    }
  }, []);

  useEffect(() => {
    fetchData(filters.dataInicio, filters.dataFim);
    fetchFormas(filters.dataInicio, filters.dataFim);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dadosPorLoja = useMemo(() => agruparPorLoja(dados), [dados]);

  const metrics = useMemo<VendasMetrics>(() => {
    const totalVendido = dados.reduce((acc, d) => acc + (d.TOTALVENDIDO || 0), 0);
    const qtdTransacoes = dados.reduce((acc, d) => acc + (d.QTDTRANSACAO || 0), 0);
    const totalDevolucao = dados.reduce((acc, d) => acc + (d.TOTALDEVOLUCAO || 0), 0);
    const ticketMedio = qtdTransacoes > 0 ? totalVendido / qtdTransacoes : 0;

    return { totalVendido, ticketMedio, qtdTransacoes, totalDevolucao };
  }, [dados]);

  const reload = useCallback(() => {
    fetchData(filters.dataInicio, filters.dataFim);
    fetchFormas(filters.dataInicio, filters.dataFim);
  }, [filters.dataInicio, filters.dataFim, fetchData, fetchFormas]);

  return {
    // Dados
    dados,
    dadosPorLoja,
    dadosFormasPagamento,
    // Loading/Error
    loading,
    loadingFormas,
    error,
    errorFormas,
    // Filtros
    filters,
    setFilters,
    // Métricas
    metrics,
    // Ações
    reload,
  };
}
