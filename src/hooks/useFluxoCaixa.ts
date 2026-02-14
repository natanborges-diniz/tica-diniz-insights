// src/hooks/useFluxoCaixa.ts

import { useState, useEffect, useMemo, useCallback } from "react";
import { getFinanceiroParcelas, FinanceiroParcela } from "../services/financeiroService";
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
    empresa: defaultEmpresa || '', // Default: empresa do profile
    dataIni: formatLocalDate(primeiroDiaMes),
    dataFim: formatLocalDate(ultimoDiaMes),
    granularidade: "DIARIO",
  };
}

function formatarPeriodo(dateStr: string | null, granularidade: Granularidade): string {
  if (!dateStr) return "SEM DATA";

  const date = new Date(dateStr + "T00:00:00");

  if (granularidade === "MENSAL") {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }
  return dateStr;
}

export function useFluxoCaixa(initialFilters?: Partial<FluxoCaixaFilters>) {
  const { defaultEmpresa } = useDefaultEmpresa();
  const [filters, setFilters] = useState<FluxoCaixaFilters>({
    ...getDefaultFilters(defaultEmpresa),
    ...initialFilters,
  });
  
  // Atualizar empresa quando o profile carregar
  useEffect(() => {
    if (defaultEmpresa && filters.empresa === '') {
      setFilters(prev => ({ ...prev, empresa: defaultEmpresa }));
    }
  }, [defaultEmpresa]);

  const [data, setData] = useState<FinanceiroParcela[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const parcelas = await getFinanceiroParcelas({
        empresa: filters.empresa,
        dataInicio: filters.dataIni,
        dataFim: filters.dataFim,
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
    // Busca automaticamente se empresa estiver definida (incluindo 'ALL')
    if (filters.empresa !== null) {
      fetchData();
    }
  }, [fetchData, filters.empresa]);

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
