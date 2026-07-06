// src/hooks/useFluxoCaixa.ts

import { useState, useEffect, useMemo, useCallback } from "react";
import { getFluxoCaixa, FluxoCaixaLancamento } from "../services/fluxoCaixaService";
import { EmpresaParam } from "@/services/firebirdBridge";
import { useDefaultEmpresa } from "./useDefaultEmpresa";

export type Granularidade = "DIARIO" | "MENSAL";

export interface FluxoCaixaFilters {
  empresa: EmpresaParam;
  dataIni: string;
  dataFim: string;
  granularidade: Granularidade;
}

export interface FluxoCaixaItem {
  periodo: string;
  totalReceber: number;
  totalPagar: number;
  saldo: number;
  saldoAcumulado: number;
}

export interface FluxoCaixaResumo {
  totalReceber: number;
  totalPagar: number;
  saldoPeriodo: number;
  qtdReceber: number;
  qtdPagar: number;
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDefaultFilters(defaultEmpresa: EmpresaParam): FluxoCaixaFilters {
  const hoje = new Date();
  const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const ultimoDiaMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

  return {
    empresa: defaultEmpresa || '',
    dataIni: formatLocalDate(primeiroDiaMes),
    dataFim: formatLocalDate(ultimoDiaMes),
    granularidade: "DIARIO",
  };
}

function formatarPeriodo(dateStr: string | null, granularidade: Granularidade): string {
  if (!dateStr) return "SEM DATA";

  if (granularidade === "MENSAL") {
    return dateStr.substring(0, 7); // YYYY-MM
  }
  return dateStr;
}

export function useFluxoCaixa(initialFilters?: Partial<FluxoCaixaFilters>) {
  const { defaultEmpresa } = useDefaultEmpresa();
  const [filters, setFilters] = useState<FluxoCaixaFilters>({
    ...getDefaultFilters(defaultEmpresa),
    ...initialFilters,
  });
  
  useEffect(() => {
    if (defaultEmpresa && filters.empresa === '') {
      setFilters(prev => ({ ...prev, empresa: defaultEmpresa }));
    }
  }, [defaultEmpresa]);

  const [data, setData] = useState<FluxoCaixaLancamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const lancamentos = await getFluxoCaixa({
        empresa: Array.isArray(filters.empresa) ? (filters.empresa[0] ?? null) : filters.empresa,
        dataInicio: filters.dataIni,
        dataFim: filters.dataFim,
        apenasBaixado: false, // includes projections
      });
      setData(lancamentos);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao buscar fluxo de caixa");
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [filters.dataIni, filters.dataFim, filters.empresa]);

  useEffect(() => {
    if (filters.empresa !== null) {
      fetchData();
    }
  }, [fetchData, filters.empresa]);

  const fluxoAgrupado = useMemo<FluxoCaixaItem[]>(() => {
    const periodoMap = new Map<string, { receber: number; pagar: number }>();

    for (const lanc of data) {
      const periodo = formatarPeriodo(lanc.dataReferencia, filters.granularidade);
      const existing = periodoMap.get(periodo) || { receber: 0, pagar: 0 };

      if (lanc.tipo === "RECEBER") {
        existing.receber += lanc.valor;
      } else {
        existing.pagar += lanc.valor;
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
        saldoAcumulado: 0,
      });
    }

    result.sort((a, b) => a.periodo.localeCompare(b.periodo));
    let acumulado = 0;
    for (const item of result) {
      acumulado += item.saldo;
      item.saldoAcumulado = acumulado;
    }

    return result;
  }, [data, filters.granularidade]);

  const resumo = useMemo<FluxoCaixaResumo>(() => {
    let totalReceber = 0;
    let totalPagar = 0;
    let qtdReceber = 0;
    let qtdPagar = 0;

    for (const lanc of data) {
      if (lanc.tipo === "RECEBER") {
        totalReceber += lanc.valor;
        qtdReceber++;
      } else {
        totalPagar += lanc.valor;
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
