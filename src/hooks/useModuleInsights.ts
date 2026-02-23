// src/hooks/useModuleInsights.ts
// Hook para buscar insights IA de um módulo

import { useState, useEffect, useCallback, useRef } from "react";
import type { IAContext, IAModule, InsightItem } from "@/types/iaInsights";
import { fetchModuleInsights } from "@/services/iaModuleService";
import { useAuth } from "@/contexts/AuthContext";
import { useUserEmpresas } from "@/hooks/useUserEmpresas";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import { useLocation } from "react-router-dom";

interface UseModuleInsightsOptions {
  module: IAModule;
  period?: { from: string; to: string };
  filters?: Record<string, unknown>;
  selection?: Record<string, unknown>;
  /** Auto-fetch on mount (default true) */
  enabled?: boolean;
  topN?: number;
}

export function useModuleInsights({
  module,
  period,
  filters,
  selection,
  enabled = true,
  topN = 6,
}: UseModuleInsightsOptions) {
  const { user, isAdmin } = useAuth();
  const { empresas } = useUserEmpresas();
  const { allowedModules } = useModulePermissions();
  const location = useLocation();

  const [insights, setInsights] = useState<InsightItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  const empresaIds = empresas.map(e => e.codEmpresa);

  const fetchInsights = useCallback(async () => {
    if (!user?.id || empresaIds.length === 0) return;

    const ctx: IAContext = {
      module,
      route: location.pathname,
      empresaIdsPermitidas: empresaIds,
      period,
      filters,
      selection,
      user: { id: user.id, role: isAdmin ? "admin" : "authenticated" },
      permissionsSnapshot: {
        modules: allowedModules || [],
        stores: empresaIds,
      },
      topN,
    };

    setLoading(true);
    setError(null);

    try {
      const result = await fetchModuleInsights(ctx);
      setInsights(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao buscar insights";
      setError(msg);
      console.error("[useModuleInsights]", msg);
    } finally {
      setLoading(false);
    }
  }, [module, user?.id, empresaIds.join(","), JSON.stringify(period), JSON.stringify(filters), topN]);

  useEffect(() => {
    if (enabled && !fetchedRef.current && user?.id && empresaIds.length > 0) {
      fetchedRef.current = true;
      fetchInsights();
    }
  }, [enabled, fetchInsights, user?.id, empresaIds.length]);

  return {
    insights,
    loading,
    error,
    refetch: fetchInsights,
  };
}
