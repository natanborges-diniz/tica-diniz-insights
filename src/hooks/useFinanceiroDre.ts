// src/hooks/useFinanceiroDre.ts

import { useState, useEffect, useMemo, useCallback } from "react";
import { getFinanceiroDre, DreLinha, calcularResumoDre, DreResumo } from "../services/financeiroDreService";

export interface DreFilters {
  empresa: string | number | null;
  dataIni: string;
  dataFim: string;
}

function getDefaultFilters(): DreFilters {
  const hoje = new Date();
  const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const ultimoDiaMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

  return {
    empresa: null,
    dataIni: primeiroDiaMes.toISOString().split("T")[0],
    dataFim: ultimoDiaMes.toISOString().split("T")[0],
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
    if (!filters.empresa) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
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

  // Resumo calculado
  const resumo = useMemo<DreResumo>(() => calcularResumoDre(data), [data]);

  // Dados agrupados por competência para o gráfico
  const dadosPorCompetencia = useMemo<DreCompetenciaData[]>(() => {
    const competenciaMap = new Map<string, DreLinha[]>();

    for (const linha of data) {
      const existing = competenciaMap.get(linha.competencia) || [];
      existing.push(linha);
      competenciaMap.set(linha.competencia, existing);
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
