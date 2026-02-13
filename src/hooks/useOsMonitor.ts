// src/hooks/useOsMonitor.ts

import { useState, useMemo, useCallback, useRef } from "react";
import { getOsMonitor, OsRecord, StatusAtraso, CampoDataOs } from "../services/osService";
import { calculateOsMetrics, OsMetrics, sortOsByPriority } from "../utils/osMetrics";
import { EmpresaParam } from "@/services/firebirdBridge";
import { fetchReceitaFotoFlags } from "@/services/osHubService";

export type OsStatusFilter = "TODOS" | StatusAtraso | "ATRASADAS";

export interface OsApiFilters {
  empresa: EmpresaParam;
  dataInicio: string;
  dataFim: string;
  campoData: CampoDataOs;
}

export type OsReceitaFotoFilter = "TODOS" | "COM" | "SEM";

export interface OsFilterState {
  status: OsStatusFilter;
  empresaVisual: string | null;
  etapa: string | null;
  busca: string;
  receita: OsReceitaFotoFilter;
  foto: OsReceitaFotoFilter;
}

export function useOsMonitor() {
  const [data, setData] = useState<OsRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [lastApiFilters, setLastApiFilters] = useState<OsApiFilters | null>(null);

  const [filters, setFilters] = useState<OsFilterState>({
    status: "TODOS",
    empresaVisual: null,
    etapa: null,
    busca: "",
    receita: "COM",
    foto: "TODOS",
  });

  // Map of codOs -> { temReceita, temFoto } from cache
  const [receitaFotoMap, setReceitaFotoMap] = useState<Record<number, { temReceita: boolean; temFoto: boolean }>>({})

  const [defaultEtapaApplied, setDefaultEtapaApplied] = useState(false);

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

    // Filtro receita
    if (filters.receita !== "TODOS") {
      const has = filters.receita === "COM";
      result = result.filter(os => {
        const info = receitaFotoMap[os.codOs];
        return has ? info?.temReceita === true : !info?.temReceita;
      });
    }

    // Filtro foto
    if (filters.foto !== "TODOS") {
      const has = filters.foto === "COM";
      result = result.filter(os => {
        const info = receitaFotoMap[os.codOs];
        return has ? info?.temFoto === true : !info?.temFoto;
      });
    }

    return sortOsByPriority(result);
  }, [data, filters, receitaFotoMap]);

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

      // Enrich with receita/foto flags from Firebird (same date range)
      _loadReceitaFotoFlags(f);

      // Apply default etapa filter on first load
      if (!defaultEtapaApplied) {
        setDefaultEtapaApplied(true);
        const etapas = Array.from(new Set(result.map(os => os.etapa).filter(Boolean)));
        const target = etapas.find(e => e.toUpperCase() === 'TRANSLADO LOJA-ESTOQUE')
          || etapas.find(e => e.toUpperCase().includes('TRANSLADO'));
        if (target) {
          setFilters(prev => ({ ...prev, etapa: target }));
        }
      }
    } catch (err: unknown) {
      console.error('[useOsMonitor] Error:', err);
      setError(err instanceof Error ? err.message : "Erro ao carregar monitor de OS");
    } finally {
      setLoading(false);
    }
  }, [defaultEtapaApplied]);

  const _loadReceitaFotoFlags = useCallback(async (apiFilters: OsApiFilters) => {
    try {
      console.log('[useOsMonitor] Loading receita/foto flags from Firebird...');
      const map = await fetchReceitaFotoFlags({
        empresa: apiFilters.empresa,
        dataInicio: apiFilters.dataInicio,
        dataFim: apiFilters.dataFim,
      });
      console.log('[useOsMonitor] Receita/foto flags loaded:', Object.keys(map).length, 'entries');
      setReceitaFotoMap(map);
    } catch (err) {
      console.warn('[useOsMonitor] Failed to load receita/foto flags:', err);
    }
  }, []);

  const reload = useCallback((apiFilters: OsApiFilters) => {
    fetchData(apiFilters);
  }, [fetchData]);

  // NO auto-load on mount — user must select empresa and click "Carregar"

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
    receitaFotoMap,
    reload,
  };
}

export type { OsRecord } from '../services/osService';
export type { CampoDataOs } from '../services/osService';
