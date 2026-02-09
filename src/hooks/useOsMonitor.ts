// src/hooks/useOsMonitor.ts

import { useState, useMemo, useCallback } from "react";
import { getOsMonitor, OsRecord, StatusAtraso, CampoDataOs } from "../services/osService";
import { calculateOsMetrics, OsMetrics, sortOsByPriority } from "../utils/osMetrics";
import { EmpresaParam } from "@/services/firebirdBridge";
import { supabase } from "@/integrations/supabase/client";

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
    receita: "TODOS",
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

      // Enrich with receita/foto info from cache
      _loadReceitaFotoMap(result.map(os => os.codOs));

      // Apply default etapa filter on first load
      if (!defaultEtapaApplied) {
        setDefaultEtapaApplied(true);
        const etapas = Array.from(new Set(result.map(os => os.etapa).filter(Boolean)));
        const target = etapas.find(e => e.toUpperCase().includes('TRANSLADO'));
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

  const _loadReceitaFotoMap = useCallback(async (codOsList: number[]) => {
    if (codOsList.length === 0) return;
    const map: Record<number, { temReceita: boolean; temFoto: boolean }> = {};
    const diopterFields = [
      'od_longe_esf', 'od_longe_cil', 'oe_longe_esf', 'oe_longe_cil',
      'od_adicao', 'oe_adicao', 'od_perto_esf', 'oe_perto_esf',
    ] as const;
    const imageFields = ['imagem_receita', 'imagem_armacao', 'imagem_tracer', 'url_imagem_receita', 'url_imagem_armacao'] as const;

    for (let i = 0; i < codOsList.length; i += 100) {
      const batch = codOsList.slice(i, i + 100);
      const { data: rows } = await supabase
        .from("os_hub_receitas")
        .select("cod_os, od_longe_esf, od_longe_cil, oe_longe_esf, oe_longe_cil, od_adicao, oe_adicao, od_perto_esf, oe_perto_esf, imagem_receita, imagem_armacao, imagem_tracer, url_imagem_receita, url_imagem_armacao")
        .in("cod_os", batch);
      if (rows) {
        for (const r of rows) {
          const temReceita = diopterFields.some(f => r[f] != null && r[f] !== 0);
          const temFoto = imageFields.some(f => {
            const v = r[f];
            return typeof v === 'string' && v.trim().length > 0;
          });
          map[r.cod_os] = { temReceita, temFoto };
        }
      }
    }
    setReceitaFotoMap(map);
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
    receitaFotoMap,
    reload,
  };
}

export type { OsRecord } from '../services/osService';
export type { CampoDataOs } from '../services/osService';
