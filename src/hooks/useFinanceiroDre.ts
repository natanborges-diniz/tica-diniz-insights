// src/hooks/useFinanceiroDre.ts

import { useState, useEffect, useMemo, useCallback } from "react";
import { getFinanceiroDre, DreLinha, calcularResumoDre, DreResumo } from "../services/financeiroDreService";
import { EmpresaParam } from "@/services/firebirdBridge";
import { useDefaultEmpresa } from "./useDefaultEmpresa";

export interface DreFilters {
  empresa: EmpresaParam;
  dataIni: string;
  dataFim: string;
  modo: "realizado" | "projetado";
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDefaultFilters(defaultEmpresa: EmpresaParam): DreFilters {
  const hoje = new Date();
  const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const ultimoDiaMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

  return {
    empresa: defaultEmpresa || '',
    dataIni: formatLocalDate(primeiroDiaMes),
    dataFim: formatLocalDate(ultimoDiaMes),
    modo: 'realizado',
  };
}

export interface DreCompetenciaData {
  competencia: string;
  receitaLiquida: number;
  lucroBruto: number;
  resultadoLiquido: number;
}

export function useFinanceiroDre(initialFilters?: Partial<DreFilters>) {
  const { defaultEmpresa } = useDefaultEmpresa();
  const [filters, setFilters] = useState<DreFilters>({
    ...getDefaultFilters(defaultEmpresa),
    ...initialFilters,
  });
  
  useEffect(() => {
    if (defaultEmpresa && filters.empresa === '') {
      setFilters(prev => ({ ...prev, empresa: defaultEmpresa }));
    }
  }, [defaultEmpresa]);

  const [data, setData] = useState<DreLinha[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const linhas = await getFinanceiroDre({
        empresa: filters.empresa,
        dataInicio: filters.dataIni,
        dataFim: filters.dataFim,
        modo: filters.modo,
      });
      setData(linhas);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao buscar DRE");
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [filters.dataIni, filters.dataFim, filters.empresa, filters.modo]);

  useEffect(() => {
    if (filters.empresa !== null) {
      fetchData();
    }
  }, [fetchData, filters.empresa]);

  const resumo = useMemo<DreResumo>(() => calcularResumoDre(data), [data]);

  const resumoRealizado = useMemo<DreResumo>(() => {
    if (filters.modo === 'realizado') return resumo;
    return calcularResumoDre(data.filter(l => l.realizado));
  }, [data, filters.modo, resumo]);

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
    resumoRealizado,
    dadosPorCompetencia,
    loading,
    error,
    reload,
  };
}

// Re-export types
export type { DreLinha, DreResumo } from '../services/financeiroDreService';
