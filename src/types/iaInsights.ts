// src/types/iaInsights.ts
// Contratos canônicos para IA embarcada em todos os módulos

export type IAModule = "vendas" | "estoque" | "financeiro" | "os" | "admin" | "config";

export type InsightSeverity = "opportunity" | "info" | "warning" | "danger";

export interface InsightAction {
  actionId: string;
  label: string;
  payload?: Record<string, unknown>;
}

export interface InsightItem {
  id: string;
  severity: InsightSeverity;
  title: string;
  summary: string;
  why?: string;
  confidence?: number;
  actions: InsightAction[];
}

export interface IAContext {
  module: IAModule;
  route: string;
  empresaIdsPermitidas: number[];
  period?: { from: string; to: string };
  filters?: Record<string, unknown>;
  selection?: Record<string, unknown>;
  user: { id: string; role: string };
  permissionsSnapshot: { modules: string[]; stores: number[] };
  topN?: number;
}
