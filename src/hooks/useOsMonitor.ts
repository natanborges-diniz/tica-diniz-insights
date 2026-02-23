// src/hooks/useOsMonitor.ts

import { useState, useMemo, useCallback, useEffect } from "react";
import { getOsMonitor, OsRecord, StatusAtraso, CampoDataOs } from "../services/osService";
import { calculateOsMetrics, OsMetrics, sortOsByPriority } from "../utils/osMetrics";
import { EmpresaParam } from "@/services/firebirdBridge";

export type OsStatusFilter = "TODOS" | StatusAtraso | "ATRASADAS";
export type OsPedidoFilter = "TODOS" | "COM_PEDIDO" | "SEM_PEDIDO";
export type OsAtrasoSort = "default" | "asc" | "desc";

export interface OsApiFilters {
  empresa: EmpresaParam;
  dataInicio: string;
  dataFim: string;
  campoData: CampoDataOs;
}

export interface OsFilterState {
  status: OsStatusFilter;
  empresaVisual: string | null;
  etapa: string | null;
  busca: string;
  pedido: OsPedidoFilter;
  atrasoSort: OsAtrasoSort;
}

// ============================================
// Module-level cache — survives navigation
// ============================================
let cachedData: OsRecord[] = [];
let cachedApiFilters: OsApiFilters | null = null;
let cachedLoaded = false;
let cachedFilters: OsFilterState = {
  status: "TODOS",
  empresaVisual: null,
  etapa: null,
  busca: "",
  pedido: "TODOS",
  atrasoSort: "default",
};

export function useOsMonitor() {
  const [data, setData] = useState<OsRecord[]>(cachedData);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(cachedLoaded);
  const [lastApiFilters, setLastApiFilters] = useState<OsApiFilters | null>(cachedApiFilters);

  const [filters, setFilters] = useState<OsFilterState>(cachedFilters);

  // Sync to module cache when state changes
  useEffect(() => { cachedData = data; cachedLoaded = loaded; }, [data, loaded]);
  useEffect(() => { cachedApiFilters = lastApiFilters; }, [lastApiFilters]);
  useEffect(() => { cachedFilters = filters; }, [filters]);

  // Filtrar dados client-side
  const filteredData = useMemo(() => {
    let result = data;

    if (filters.status === "ATRASADAS") {
      result = result.filter(os => os.statusAtraso === 'ATRASO' || os.statusAtraso === 'ATRASO_LEVE');
    } else if (filters.status !== "TODOS") {
      result = result.filter(os => os.statusAtraso === filters.status);
    }

    if (filters.empresaVisual && filters.empresaVisual !== "TODAS") {
      result = result.filter(os => os.empresa === filters.empresaVisual);
    }

    if (filters.etapa && filters.etapa !== "TODAS") {
      result = result.filter(os => os.etapa === filters.etapa);
    }

    if (filters.busca.trim()) {
      const termo = filters.busca.toLowerCase().trim();
      result = result.filter(os =>
        os.os.toLowerCase().includes(termo) ||
        os.cliente.toLowerCase().includes(termo)
      );
    }

    // Note: pedido filter is applied in the layout component since it needs pedidosMap

    // Apply atraso sort
    if (filters.atrasoSort === "default") {
      return sortOsByPriority(result);
    }
    
    const sorted = [...result].sort((a, b) => {
      if (filters.atrasoSort === "asc") return a.atrasoDias - b.atrasoDias;
      return b.atrasoDias - a.atrasoDias;
    });
    return sorted;
  }, [data, filters]);

  const metrics: OsMetrics = useMemo(() => calculateOsMetrics(data), [data]);
  const filteredMetrics: OsMetrics = useMemo(() => calculateOsMetrics(filteredData), [filteredData]);

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
      setLastApiFilters(f);
      const result = await getOsMonitor({
        empresa: f.empresa,
        dataInicio: f.dataInicio,
        dataFim: f.dataFim,
        campoData: f.campoData,
      });
      setData(result);
      setLoaded(true);
    } catch (err: unknown) {
      console.error('[useOsMonitor] Error:', err);
      setError(err instanceof Error ? err.message : "Erro ao carregar monitor de OS");
    } finally {
      setLoading(false);
    }
  }, []);


  const reload = useCallback((apiFilters: OsApiFilters) => {
    fetchData(apiFilters);
  }, [fetchData]);

  return {
    data,
    filteredData,
    loading,
    error,
    loaded,
    lastApiFilters,
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
export type { CampoDataOs } from '../services/osService';
