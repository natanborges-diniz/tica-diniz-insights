// src/hooks/useOsMonitor.ts

import { useEffect, useState, useMemo } from "react";
import {
  getOsMonitor,
  OsMonitorFilters,
  OsRecord,
} from "../services/osMonitor";
import { calculateOsMetrics, OsMetrics, mapStatus, isAtrasada } from "../utils/osMetrics";

export type OsStatusFilter = "TODOS" | "EM_ANDAMENTO" | "ATRASADAS" | "ENTREGUES" | "CANCELADAS";
export type OsEmpresaFilter = string | null;

export interface OsFilterState {
  status: OsStatusFilter;
  empresa: OsEmpresaFilter;
  somenteReparo: boolean;
  somenteEcommerce: boolean;
  somenteSemPrevisao: boolean;
}

export function useOsMonitor(initialFilters: OsMonitorFilters) {
  const [apiFilters, setApiFilters] = useState<OsMonitorFilters>(initialFilters);
  const [data, setData] = useState<OsRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<OsFilterState>({
    status: "TODOS",
    empresa: null, // Não carrega dados automaticamente - usuário deve selecionar
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

      if (filters.empresa !== null && filters.empresa !== "TODAS" && os.empresa !== filters.empresa) return false;

      if (filters.somenteReparo && !os.isReparo) return false;
      if (filters.somenteEcommerce && !os.isEcommerce) return false;
      if (filters.somenteSemPrevisao && os.dataPrevisao) return false;

      return true;
    });
  }, [data, filters]);

  const metrics: OsMetrics = useMemo(() => calculateOsMetrics(data), [data]);
  const filteredMetrics: OsMetrics = useMemo(() => calculateOsMetrics(filteredData), [filteredData]);

  async function fetchData(f: OsMonitorFilters) {
    try {
      setLoading(true);
      setError(null);
      const result = await getOsMonitor(f);
      setData(result);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Erro ao carregar monitor de OS");
    } finally {
      setLoading(false);
    }
  }

  // NÃO carrega automaticamente - aguarda seleção de empresa pelo usuário
  // useEffect removido para evitar carregamento automático

  function reload(newApiFilters?: Partial<OsMonitorFilters>) {
    const merged = { ...apiFilters, ...newApiFilters };
    setApiFilters(merged);
    fetchData(merged);
  }

  return {
    data,
    filteredData,
    loading,
    error,
    apiFilters,
    filters,
    setFilters,
    metrics,
    filteredMetrics,
    reload,
  };
}
