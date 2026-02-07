// src/hooks/useOsMonitor.ts

import { useEffect, useState, useMemo, useCallback } from "react";
import { getOsMonitor, OsRecord, GetOsMonitorParams, StatusAtraso } from "../services/osService";
import { calculateOsMetrics, OsMetrics, sortOsByPriority } from "../utils/osMetrics";
import { EmpresaParam } from "@/services/firebirdBridge";

export type OsStatusFilter = "TODOS" | StatusAtraso | "ATRASADAS";

export interface OsApiFilters {
  empresa: EmpresaParam;
  dataInicio: string;
  dataFim: string;
}

export interface OsFilterState {
  status: OsStatusFilter;
  empresaVisual: string | null;
  etapa: string | null;
  busca: string;
}

export function useOsMonitor(initialFilters: OsApiFilters) {
  const [apiFilters, setApiFilters] = useState<OsApiFilters>(initialFilters);
  const [data, setData] = useState<OsRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<OsFilterState>({
    status: "TODOS",
    empresaVisual: null,
    etapa: "TRANSLADO LOJA-ESTOQUE",
    busca: "",
  });

  // Filtrar dados client-side
  const filteredData = useMemo(() => {
    let result = data;

    // Filtro por status
    if (filters.status === "ATRASADAS") {
      result = result.filter(os => os.statusAtraso === 'ATRASO' || os.statusAtraso === 'ATRASO_LEVE');
    } else if (filters.status !== "TODOS") {
      result = result.filter(os => os.statusAtraso === filters.status);
    }

    // Filtro visual por empresa
    if (filters.empresaVisual && filters.empresaVisual !== "TODAS") {
      result = result.filter(os => os.empresa === filters.empresaVisual);
    }

    // Filtro por etapa
    if (filters.etapa && filters.etapa !== "TODAS") {
      result = result.filter(os => os.etapa === filters.etapa);
    }

    // Busca por OS ou Cliente
    if (filters.busca.trim()) {
      const termo = filters.busca.toLowerCase().trim();
      result = result.filter(os => 
        os.os.toLowerCase().includes(termo) ||
        os.cliente.toLowerCase().includes(termo)
      );
    }

    // Ordenar por prioridade
    return sortOsByPriority(result);
  }, [data, filters]);

  const metrics: OsMetrics = useMemo(() => calculateOsMetrics(data), [data]);
  const filteredMetrics: OsMetrics = useMemo(() => calculateOsMetrics(filteredData), [filteredData]);

  // Listas únicas para filtros
  const empresasUnicas = useMemo(() => 
    Array.from(new Set(data.map(os => os.empresa).filter(Boolean))).sort()
  , [data]);

  const etapasUnicas = useMemo(() => 
    Array.from(new Set(data.map(os => os.etapa).filter(Boolean))).sort()
  , [data]);

  const fetchData = useCallback(async (f: OsApiFilters) => {
    try {
      setLoading(true);
      setError(null);
      const result = await getOsMonitor({
        empresa: f.empresa,
        dataInicio: f.dataInicio,
        dataFim: f.dataFim,
      });
      setData(result);
    } catch (err: unknown) {
      console.error('[useOsMonitor] Error:', err);
      setError(err instanceof Error ? err.message : "Erro ao carregar monitor de OS");
    } finally {
      setLoading(false);
    }
  }, []);

  // Busca automaticamente quando apiFilters muda
  useEffect(() => {
    fetchData(apiFilters);
  }, [apiFilters, fetchData]);

  const reload = useCallback((newApiFilters?: Partial<OsApiFilters>) => {
    const merged = { ...apiFilters, ...newApiFilters };
    setApiFilters(merged);
  }, [apiFilters]);

  return {
    data,
    filteredData,
    loading,
    error,
    apiFilters,
    setApiFilters,
    filters,
    setFilters,
    metrics,
    filteredMetrics,
    empresasUnicas,
    etapasUnicas,
    reload,
  };
}

export type { OsRecord } from '../services/osService';
