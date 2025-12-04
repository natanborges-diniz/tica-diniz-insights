// src/hooks/useOsMonitor.ts

import { useEffect, useState, useMemo } from "react";
import {
  getOsMonitor,
  OsMonitorFilters,
  OsRecord,
} from "../services/osMonitor";
import { calculateOsMetrics, OsMetrics } from "../utils/osMetrics";

export function useOsMonitor(initialFilters: OsMonitorFilters) {
  const [filters, setFilters] = useState<OsMonitorFilters>(initialFilters);
  const [data, setData] = useState<OsRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const metrics: OsMetrics = useMemo(() => calculateOsMetrics(data), [data]);

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

  useEffect(() => {
    fetchData(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function reload(newFilters?: Partial<OsMonitorFilters>) {
    const merged = { ...filters, ...newFilters };
    setFilters(merged);
    fetchData(merged);
  }

  return {
    data,
    loading,
    error,
    filters,
    metrics,
    reload,
  };
}
