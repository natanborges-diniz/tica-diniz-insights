// src/hooks/useFinanceiroParcelas.ts

import { useState, useEffect, useMemo, useCallback } from "react";
import { getFinanceiroParcelas, FinanceiroParcela } from "../services/financeiroService";

export type TipoFilter = "TODOS" | "PAGAR" | "RECEBER";
export type SituacaoFilter = "TODOS" | "EM ABERTO" | "EM ATRASO" | "PAGA";
export type CampoDataFilter = "EMISSAO" | "VENCIMENTO" | "PAGAMENTO";
export type KPIFilterType = "TODOS" | "RECEBER_ABERTO" | "RECEBER_ATRASO" | "PAGAR_ABERTO" | "PAGAR_ATRASO";

export interface FinanceiroFilters {
  empresa: string | number | null;
  dataIni: string;
  dataFim: string;
  tipo: TipoFilter;
  situacao: SituacaoFilter;
  campoData: CampoDataFilter;
  kpiFilter: KPIFilterType;
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
  qtdReceberAtraso: number;
  qtdPagarAtraso: number;
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDefaultFilters(): FinanceiroFilters {
  const hoje = new Date();
  const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const ultimoDiaMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

  return {
    empresa: null,
    dataIni: formatLocalDate(primeiroDiaMes),
    dataFim: formatLocalDate(ultimoDiaMes),
    tipo: "TODOS",
    situacao: "TODOS",
    campoData: "VENCIMENTO",
    kpiFilter: "TODOS",
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
  let qtdReceberAtraso = 0;
  let qtdPagarAtraso = 0;

  for (const p of parcelas) {
    if (p.tipoLancamento === "RECEBER") {
      qtdParcelasReceber++;
      if (p.situacao === "EM ABERTO") {
        totalReceberAberto += p.valor;
      } else if (p.situacao === "EM ATRASO") {
        totalReceberAtraso += p.valor;
        qtdParcelasAtraso++;
        qtdReceberAtraso++;
      }
    } else {
      qtdParcelasPagar++;
      if (p.situacao === "EM ABERTO") {
        totalPagarAberto += p.valor;
      } else if (p.situacao === "EM ATRASO") {
        totalPagarAtraso += p.valor;
        qtdParcelasAtraso++;
        qtdPagarAtraso++;
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
    qtdReceberAtraso,
    qtdPagarAtraso,
  };
}

// Filtra parcelas baseado no KPI filter selecionado
function filterByKPI(parcelas: FinanceiroParcela[], kpiFilter: KPIFilterType): FinanceiroParcela[] {
  if (kpiFilter === "TODOS") return parcelas;
  
  return parcelas.filter(p => {
    switch (kpiFilter) {
      case "RECEBER_ABERTO":
        return p.tipoLancamento === "RECEBER" && p.situacao === "EM ABERTO";
      case "RECEBER_ATRASO":
        return p.tipoLancamento === "RECEBER" && p.situacao === "EM ATRASO";
      case "PAGAR_ABERTO":
        return p.tipoLancamento === "PAGAR" && p.situacao === "EM ABERTO";
      case "PAGAR_ATRASO":
        return p.tipoLancamento === "PAGAR" && p.situacao === "EM ATRASO";
      default:
        return true;
    }
  });
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
        empresa: filters.empresa, // Passa null se "Todas" for selecionada
        tipo: filters.tipo,
        situacao: filters.situacao,
        campoData: filters.campoData,
      });
      setData(parcelas);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao buscar parcelas");
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [filters.dataIni, filters.dataFim, filters.empresa, filters.tipo, filters.situacao, filters.campoData]);

  useEffect(() => {
    // Só busca dados se uma empresa específica estiver selecionada
    if (filters.empresa !== null) {
      fetchData();
    } else {
      setData([]);
    }
  }, [fetchData, filters.empresa]);

  // Métricas calculadas a partir dos dados retornados (já filtrados pelo backend)
  const metrics = useMemo(() => calculateMetrics(data), [data]);
  
  // Dados filtrados pelo KPI card selecionado
  const filteredData = useMemo(() => filterByKPI(data, filters.kpiFilter), [data, filters.kpiFilter]);

  const reload = useCallback(() => {
    fetchData();
  }, [fetchData]);

  return {
    filters,
    setFilters,
    data,
    filteredData,
    metrics,
    loading,
    error,
    reload,
  };
}
