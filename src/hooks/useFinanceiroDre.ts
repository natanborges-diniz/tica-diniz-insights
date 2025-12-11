// src/hooks/useFinanceiroDre.ts

import { useState, useEffect, useMemo, useCallback } from "react";
import { getFinanceiroDre, DreLinha, calcularResumoDre, DreResumo } from "../services/financeiroDreService";

export interface DreFilters {
  empresa: string | number | null;
  dataIni: string;
  dataFim: string;
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDefaultFilters(): DreFilters {
  const hoje = new Date();
  const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const ultimoDiaMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

  return {
    empresa: null,
    dataIni: formatLocalDate(primeiroDiaMes),
    dataFim: formatLocalDate(ultimoDiaMes),
  };
}

export interface DreCompetenciaData {
  competencia: string;
  receitaLiquida: number;
  lucroBruto: number;
  resultadoLiquido: number;
}

export function useFinanceiroDre(initialFilters?: Partial<DreFilters>) {
  const [filters, setFilters] = useState<DreFilters>({
    ...getDefaultFilters(),
    ...initialFilters,
  });

  const [data, setData] = useState<DreLinha[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Chama o service com os parâmetros corretos (empresa pode ser null)
      const linhas = await getFinanceiroDre({
        dataIni: filters.dataIni,
        dataFim: filters.dataFim,
        empresa: filters.empresa,
      });
      setData(linhas);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao buscar DRE");
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [filters.dataIni, filters.dataFim, filters.empresa]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Resumo calculado usando o valor (ou valorTotal) de cada linha
  const resumo = useMemo<DreResumo>(() => calcularResumoDre(data), [data]);

  // Dados agrupados por competência para o gráfico
  const dadosPorCompetencia = useMemo<DreCompetenciaData[]>(() => {
    const competenciaMap = new Map<string, DreLinha[]>();

    for (const linha of data) {
      const comp = linha.competencia || "SEM_COMPETENCIA";
      const existing = competenciaMap.get(comp) || [];
      existing.push(linha);
      competenciaMap.set(comp, existing);
    }

    const result: DreCompetenciaData[] = [];
    for (const [competencia, linhas] of competenciaMap.entries()) {
      const resumoComp = calcularResumoDre(linhas);
      result.push({
        competencia,
        receitaLiquida: resumoComp.receitaLiquida,
        lucroBruto: resumoComp.lucroBruto,
        resultadoLiquido: resumoComp.resultadoLiquido,
      });
    }

    return result.sort((a, b) => a.competencia.localeCompare(b.competencia));
  }, [data]);

  const reload = useCallback(() => {
    fetchData();
  }, [fetchData]);

  return {
    filters,
    setFilters,
    data,
    resumo,
    dadosPorCompetencia,
    loading,
    error,
    reload,
  };
}
