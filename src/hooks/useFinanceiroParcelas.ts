// src/hooks/useFinanceiroParcelas.ts

import { useState, useEffect, useMemo, useCallback } from "react";
import { getFinanceiroParcelas, FinanceiroParcela } from "../services/financeiroService";

export type TipoFilter = "TODOS" | "PAGAR" | "RECEBER";
export type SituacaoFilter = "TODOS" | "EM ABERTO" | "EM ATRASO" | "PAGA";
export type CampoDataFilter = "EMISSAO" | "VENCIMENTO" | "PAGAMENTO";

export interface FinanceiroFilters {
  empresa: string | number | null;
  dataIni: string;
  dataFim: string;
  tipo: TipoFilter;
  situacao: SituacaoFilter;
  campoData: CampoDataFilter;
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
    // API requer empresa obrigatória
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
    fetchData();
  }, [fetchData]);

  // Métricas calculadas a partir dos dados retornados (já filtrados pelo backend)
  const metrics = useMemo(() => calculateMetrics(data), [data]);

  const reload = useCallback(() => {
    fetchData();
  }, [fetchData]);

  return {
    filters,
    setFilters,
    data,
    metrics,
    loading,
    error,
    reload,
  };
}
