// src/hooks/useOsMonitor.ts

import { useEffect, useState, useMemo, useCallback } from "react";
import { getOsMonitor, OsRecord, GetOsMonitorParams } from "../services/osService";
import { calculateOsMetrics, OsMetrics, mapStatus, isAtrasada } from "../utils/osMetrics";
import { EmpresaParam } from "@/services/firebirdBridge";

export type OsStatusFilter = "TODOS" | "EM_ANDAMENTO" | "ATRASADAS" | "ENTREGUES" | "CANCELADAS";
export type OsEmpresaFilter = string | null;

export interface OsApiFilters {
  empresa: EmpresaParam;
  dataInicio: string;
  dataFim: string;
}

export interface OsFilterState {
  status: OsStatusFilter;
  empresaVisual: OsEmpresaFilter; // Para filtro visual na tabela
  somenteReparo: boolean;
  somenteEcommerce: boolean;
  somenteSemPrevisao: boolean;
}

export function useOsMonitor(initialFilters: OsApiFilters) {
  const [apiFilters, setApiFilters] = useState<OsApiFilters>(initialFilters);
  const [data, setData] = useState<OsRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<OsFilterState>({
    status: "TODOS",
    empresaVisual: null,
    somenteReparo: false,
    somenteEcommerce: false,
    somenteSemPrevisao: false,
  });

  const filteredData = useMemo(() => {
    return data.filter((os) => {
      const status = mapStatus(os);
      const atrasada = isAtrasada(os, status);

      if (filters.status === "EM_ANDAMENTO" && status !== "EM_ANDAMENTO") return false;
      if (filters.status === "ATRASADAS" && !atrasada) return false;
      if (filters.status === "ENTREGUES" && status !== "ENTREGUE") return false;
      if (filters.status === "CANCELADAS" && status !== "CANCELADA") return false;

      if (filters.empresaVisual !== null && filters.empresaVisual !== "TODAS" && os.empresa !== filters.empresaVisual) return false;

      if (filters.somenteReparo && !os.isReparo) return false;
      if (filters.somenteEcommerce && !os.isEcommerce) return false;
      if (filters.somenteSemPrevisao && os.dataPrevisao) return false;

      return true;
    });
  }, [data, filters]);

  const metrics: OsMetrics = useMemo(() => calculateOsMetrics(data), [data]);
  const filteredMetrics: OsMetrics = useMemo(() => calculateOsMetrics(filteredData), [filteredData]);

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
      console.error(err);
      setError(err instanceof Error ? err.message : "Erro ao carregar monitor de OS");
    } finally {
      setLoading(false);
    }
  }, []);

  // Busca automaticamente se empresa estiver definida (incluindo 'ALL')
  useEffect(() => {
    if (apiFilters.empresa !== null) {
      fetchData(apiFilters);
    }
  }, [apiFilters, fetchData]);

  const reload = useCallback((newApiFilters?: Partial<OsApiFilters>) => {
    const merged = { ...apiFilters, ...newApiFilters };
    setApiFilters(merged);
    fetchData(merged);
  }, [apiFilters, fetchData]);

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
    reload,
  };
}

// Re-export types
export type { OsRecord } from '../services/osService';
