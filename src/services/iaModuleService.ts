// src/services/iaModuleService.ts
// Adapter/Client para Edge Function ai-module-insights

import { supabase } from "@/integrations/supabase/client";
import type { IAContext, InsightItem } from "@/types/iaInsights";

const VALID_ACTION_IDS: Record<string, string[]> = {
  vendas: [
    "APPLY_FILTERS", "OPEN_SALES_ROW_DETAIL_SHEET", "OPEN_RANKING_STORES",
    "OPEN_RANKING_SELLERS", "NAVIGATE_INTELIGENCIA_VENDAS", "EXPORT_FILTERED_DATASET",
  ],
  estoque: [
    "APPLY_FILTERS", "OPEN_SKU_DETAIL_SHEET", "NAVIGATE_OTB",
    "NAVIGATE_ACOES_ESTOQUE", "EXPORT_FILTERED_DATASET",
  ],
  financeiro: [
    "APPLY_FILTERS", "OPEN_FINANCE_ROW_DETAIL_SHEET", "NAVIGATE_DRE",
    "NAVIGATE_FLUXO_CAIXA", "EXPORT_FILTERED_DATASET",
  ],
  os: [
    "APPLY_FILTERS", "OPEN_OS_DETAIL_SHEET", "NAVIGATE_PEDIDO_HOYA",
    "EXPORT_FILTERED_DATASET",
  ],
  admin: [
    "NAVIGATE_ADMIN_USUARIOS", "NAVIGATE_SYNC", "NAVIGATE_HEALTH", "NAVIGATE_METAS",
  ],
  config: [
    "NAVIGATE_ADMIN_USUARIOS", "NAVIGATE_SYNC", "NAVIGATE_HEALTH", "NAVIGATE_METAS",
  ],
};

// In-memory cache: key → { data, ts }
const cache = new Map<string, { data: InsightItem[]; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

function cacheKey(ctx: IAContext): string {
  return JSON.stringify({
    m: ctx.module,
    e: ctx.empresaIdsPermitidas.sort(),
    p: ctx.period,
    f: ctx.filters,
    s: ctx.selection,
  });
}

function sanitizeActions(module: string, insights: InsightItem[]): InsightItem[] {
  const allowed = VALID_ACTION_IDS[module] || [];
  return insights.map(insight => ({
    ...insight,
    actions: insight.actions.filter(a => {
      if (!allowed.includes(a.actionId)) {
        console.warn(`[iaModuleService] Ação bloqueada: ${a.actionId} no módulo ${module}`);
        return false;
      }
      return true;
    }),
  }));
}

function validateInsight(raw: unknown): raw is InsightItem {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as Record<string, unknown>;
  return typeof r.id === "string" && typeof r.title === "string" && typeof r.summary === "string" && Array.isArray(r.actions);
}

export async function fetchModuleInsights(ctx: IAContext): Promise<InsightItem[]> {
  const key = cacheKey(ctx);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }

  // Ensure we send the user's session token, not the anon key
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  
  if (!accessToken) {
    throw new Error("Sessão não encontrada — faça login novamente");
  }

  const { data, error } = await supabase.functions.invoke("ai-module-insights", {
    body: ctx,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) {
    console.error("[iaModuleService] Error:", error);
    throw new Error(error.message || "Erro ao buscar insights");
  }

  let insights: InsightItem[] = [];
  const rawInsights = data?.insights;

  if (Array.isArray(rawInsights)) {
    insights = rawInsights.filter(validateInsight);
  }

  insights = sanitizeActions(ctx.module, insights);

  cache.set(key, { data: insights, ts: Date.now() });
  return insights;
}

export function clearInsightsCache() {
  cache.clear();
}
