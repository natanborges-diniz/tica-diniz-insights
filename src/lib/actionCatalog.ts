// src/lib/actionCatalog.ts
// Catálogo e executor de ações IA por módulo

import type { InsightAction } from "@/types/iaInsights";

type ActionHandler = (payload?: Record<string, unknown>) => void;

// Global registry — populated by each module page on mount
const handlers = new Map<string, ActionHandler>();

export function registerAction(actionId: string, handler: ActionHandler) {
  handlers.set(actionId, handler);
}

export function unregisterAction(actionId: string) {
  handlers.delete(actionId);
}

export function executeAction(action: InsightAction): boolean {
  const handler = handlers.get(action.actionId);
  if (!handler) {
    console.warn(`[actionCatalog] Ação desconhecida ignorada: ${action.actionId}`);
    return false;
  }
  try {
    handler(action.payload);
    return true;
  } catch (err) {
    console.error(`[actionCatalog] Erro ao executar ${action.actionId}:`, err);
    return false;
  }
}

// Navigation helpers (used across modules)
export function createNavigationHandler(navigate: (path: string) => void, path: string): ActionHandler {
  return () => navigate(path);
}
