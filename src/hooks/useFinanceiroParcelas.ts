// src/hooks/useFinanceiroParcelas.ts

import { useState, useEffect, useMemo, useCallback } from "react";
import { getFinanceiroParcelas, FinanceiroParcela } from "../services/financeiroService";

export type TipoFilter = "TODOS" | "PAGAR" | "RECEBER";
export type SituacaoFilter = "TODOS" | "EM ABERTO" | "EM ATRASO" | "PAGA";

export interface FinanceiroFilters {
  empresa: string | number | null;
  dataIni: string;
  dataFim: string;
  tipo: TipoFilter;
  situacao: SituacaoFilter;
}

export interface FinanceiroMetrics {
  totalReceberAberto: number;
  totalReceberAtraso: number;
  totalPagarAberto: number;
  totalPagarAtraso: number;
  qtdParcelas: number;
  qtdParcelasAtraso: number;
  qtdParcelasPagar: number;
  qtdParcelasReceber: number;
}

function getDefaultFilters(): FinanceiroFilters {
  const hoje = new Date();
  const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const ultimoDiaMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

  return {
    empresa: null,
    dataIni: primeiroDiaMes.toISOString().split("T")[0],
    dataFim: ultimoDiaMes.toISOString().split("T")[0],
    tipo: "TODOS",
    situacao: "TODOS",
  };
}

function calculateMetrics(parcelas: FinanceiroParcela[]): FinanceiroMetrics {
  let totalReceberAberto = 0;
  let totalReceberAtraso = 0;
  let totalPagarAberto = 0;
  let totalPagarAtraso = 0;
  let qtdParcelasAtraso = 0;
  let qtdParcelasPagar = 0;
  let qtdParcelasReceber = 0;

  for (const p of parcelas) {
    if (p.tipoLancamento === "RECEBER") {
      qtdParcelasReceber++;
      if (p.situacao === "EM ABERTO") {
        totalReceberAberto += p.valor;
      } else if (p.situacao === "EM ATRASO") {
        totalReceberAtraso += p.valor;
        qtdParcelasAtraso++;
      }
    } else {
      qtdParcelasPagar++;
      if (p.situacao === "EM ABERTO") {
        totalPagarAberto += p.valor;
      } else if (p.situacao === "EM ATRASO") {
        totalPagarAtraso += p.valor;
        qtdParcelasAtraso++;
      }
    }
  }

  return {
    totalReceberAberto,
    totalReceberAtraso,
    totalPagarAberto,
    totalPagarAtraso,
    qtdParcelas: parcelas.length,
    qtdParcelasAtraso,
    qtdParcelasPagar,
    qtdParcelasReceber,
  };
}

export function useFinanceiroParcelas(initialFilters?: Partial<FinanceiroFilters>) {
  const [filters, setFilters] = useState<FinanceiroFilters>({
    ...getDefaultFilters(),
    ...initialFilters,
  });

  const [data, setData] = useState<FinanceiroParcela[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const parcelas = await getFinanceiroParcelas({
        dataIni: filters.dataIni,
        dataFim: filters.dataFim,
        empresa: filters.empresa || undefined,
      });
      setData(parcelas);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao buscar parcelas");
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [filters.dataIni, filters.dataFim, filters.empresa]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredData = useMemo(() => {
    return data.filter((p) => {
      if (filters.tipo !== "TODOS" && p.tipoLancamento !== filters.tipo) {
        return false;
      }
      if (filters.situacao !== "TODOS" && p.situacao !== filters.situacao) {
        return false;
      }
      return true;
    });
  }, [data, filters.tipo, filters.situacao]);

  const metrics = useMemo(() => calculateMetrics(data), [data]);
  const filteredMetrics = useMemo(() => calculateMetrics(filteredData), [filteredData]);

  const reload = useCallback(() => {
    fetchData();
  }, [fetchData]);

  return {
    filters,
    setFilters,
    data,
    filteredData,
    metrics,
    filteredMetrics,
    loading,
    error,
    reload,
  };
}
