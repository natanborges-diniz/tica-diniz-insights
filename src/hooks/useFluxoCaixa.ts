// src/hooks/useFluxoCaixa.ts

import { useState, useEffect, useMemo, useCallback } from "react";
import { getFinanceiroParcelas, FinanceiroParcela } from "../services/financeiroService";

export type Granularidade = "DIARIO" | "MENSAL";

export interface FluxoCaixaFilters {
  empresa: string | number | null;
  dataIni: string;
  dataFim: string;
  granularidade: Granularidade;
}

export interface FluxoCaixaItem {
  periodo: string;
  totalReceber: number;
  totalPagar: number;
  saldo: number;
}

export interface FluxoCaixaResumo {
  totalReceber: number;
  totalPagar: number;
  saldoPeriodo: number;
  qtdReceber: number;
  qtdPagar: number;
}

function getDefaultFilters(): FluxoCaixaFilters {
  const hoje = new Date();
  const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const ultimoDiaMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

  return {
    empresa: null,
    dataIni: primeiroDiaMes.toISOString().split("T")[0],
    dataFim: ultimoDiaMes.toISOString().split("T")[0],
    granularidade: "DIARIO",
  };
}

function formatarPeriodo(date: Date, granularidade: Granularidade): string {
  if (granularidade === "MENSAL") {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }
  return date.toISOString().split("T")[0];
}

export function useFluxoCaixa(initialFilters?: Partial<FluxoCaixaFilters>) {
  const [filters, setFilters] = useState<FluxoCaixaFilters>({
    ...getDefaultFilters(),
    ...initialFilters,
  });

  const [data, setData] = useState<FinanceiroParcela[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!filters.empresa) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const parcelas = await getFinanceiroParcelas({
        dataIni: filters.dataIni,
        dataFim: filters.dataFim,
        empresa: filters.empresa,
        campoData: "VENCIMENTO",
        tipo: "TODOS",
        situacao: "TODOS",
      });
      setData(parcelas);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao buscar fluxo de caixa");
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [filters.dataIni, filters.dataFim, filters.empresa]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Agrupar por período (dia ou mês)
  const fluxoAgrupado = useMemo<FluxoCaixaItem[]>(() => {
    const periodoMap = new Map<string, { receber: number; pagar: number }>();

    for (const parcela of data) {
      const periodo = formatarPeriodo(parcela.dataVencimento, filters.granularidade);
      const existing = periodoMap.get(periodo) || { receber: 0, pagar: 0 };

      if (parcela.tipoLancamento === "RECEBER") {
        existing.receber += parcela.valor;
      } else {
        existing.pagar += parcela.valor;
      }

      periodoMap.set(periodo, existing);
    }

    const result: FluxoCaixaItem[] = [];
    for (const [periodo, valores] of periodoMap.entries()) {
      result.push({
        periodo,
        totalReceber: valores.receber,
        totalPagar: valores.pagar,
        saldo: valores.receber - valores.pagar,
      });
    }

    return result.sort((a, b) => a.periodo.localeCompare(b.periodo));
  }, [data, filters.granularidade]);

  // Resumo do período
  const resumo = useMemo<FluxoCaixaResumo>(() => {
    let totalReceber = 0;
    let totalPagar = 0;
    let qtdReceber = 0;
    let qtdPagar = 0;

    for (const parcela of data) {
      if (parcela.tipoLancamento === "RECEBER") {
        totalReceber += parcela.valor;
        qtdReceber++;
      } else {
        totalPagar += parcela.valor;
        qtdPagar++;
      }
    }

    return {
      totalReceber,
      totalPagar,
      saldoPeriodo: totalReceber - totalPagar,
      qtdReceber,
      qtdPagar,
    };
  }, [data]);

  const reload = useCallback(() => {
    fetchData();
  }, [fetchData]);

  return {
    filters,
    setFilters,
    data,
    fluxoAgrupado,
    resumo,
    loading,
    error,
    reload,
  };
}
