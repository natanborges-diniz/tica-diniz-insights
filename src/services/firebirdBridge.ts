// src/services/firebirdBridge.ts
// Cliente HTTP centralizado para Firebird Bridge API

const FIREBIRD_BRIDGE_BASE_URL =
  import.meta.env.VITE_FIREBIRD_BRIDGE_BASE_URL ||
  'https://firebird-bridge-production.up.railway.app';

// ============================================
// TIPOS DO ENVELOPE PADRÃO DA API
// ============================================

export type ApiError = {
  code: string;
  message: string;
  details?: unknown;
} | null;

export interface ApiEnvelope<T> {
  ok: boolean;
  data: T | null;
  error: ApiError;
}

// ============================================
// TIPO PARA PARÂMETRO EMPRESA
// ============================================

export type EmpresaParam = 'ALL' | string | number | null;

// ============================================
// HELPER PARA CONVERTER CAMPOS PARA CAMELCASE
// ============================================

function toCamelCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

export function toCamelCaseRow<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    result[toCamelCase(key)] = row[key];
  }
  return result;
}

// ============================================
// OPÇÕES DE CACHE PARA REQUISIÇÕES
// ============================================

export interface ApiGetOptions {
  /** Se false, adiciona cache=0 para buscar dados ao vivo (bypass cache) */
  cache?: boolean;
  /** TTL do cache em milissegundos (ex: 30000 = 30s) */
  cacheTtlMs?: number;
}

// ============================================
// FUNÇÃO GENÉRICA DE REQUISIÇÃO
// ============================================

export async function apiGet<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>,
  options?: ApiGetOptions
): Promise<T[]> {
  const url = new URL(`${FIREBIRD_BRIDGE_BASE_URL}/api/v1${path}`);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.append(key, String(value));
      }
    });
  }

  // Adicionar parâmetros de cache se especificados
  if (options?.cache === false) {
    url.searchParams.append('cache', '0');
  }
  if (options?.cacheTtlMs !== undefined) {
    url.searchParams.append('cacheTtlMs', String(options.cacheTtlMs));
  }

  // Timeout de 90 segundos para permitir consultas consolidadas pesadas
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000);

  try {
    console.log(`[FirebirdBridge] Fetching: ${url.toString()}`);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Erro na API: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    // Formato novo: { ok, data, error }
    if (result.ok !== undefined) {
      if (result.ok === false || result.error) {
        const errorObj = result.error;
        const errorMessage = errorObj?.message || 'Erro desconhecido na API';
        const error = new Error(errorMessage) as Error & { code?: string; details?: unknown };
        if (errorObj?.code) error.code = errorObj.code;
        if (errorObj?.details) error.details = errorObj.details;
        throw error;
      }
      const data = result.data ?? [];
      console.log(`[FirebirdBridge] Success (envelope): ${path}`, data.length, 'records');
      return data;
    }

    // Formato legacy: { data: [...] }
    if (result.data !== undefined && Array.isArray(result.data)) {
      console.log(`[FirebirdBridge] Success (legacy data): ${path}`, result.data.length, 'records');
      return result.data;
    }

    // Formato legacy: { rows: [...] }
    if (result.rows !== undefined && Array.isArray(result.rows)) {
      console.log(`[FirebirdBridge] Success (legacy rows): ${path}`, result.rows.length, 'records');
      return result.rows;
    }

    // Array direto
    if (Array.isArray(result)) {
      console.log(`[FirebirdBridge] Success (array): ${path}`, result.length, 'records');
      return result;
    }

    // Fallback - retorna array vazio se formato não reconhecido
    console.warn(`[FirebirdBridge] Formato não reconhecido: ${path}`, result);
    return [];
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.error(`[FirebirdBridge] Timeout: ${path}`);
        throw new Error('Timeout: O servidor não respondeu em tempo hábil');
      }
      console.error(`[FirebirdBridge] Error: ${path}`, error.message);
      throw error;
    }
    throw new Error('Erro desconhecido na requisição');
  }
}

// ============================================
// HELPER PARA FORMATAR PARÂMETRO EMPRESA
// ============================================

export function formatEmpresaParam(empresa: EmpresaParam): string | undefined {
  if (empresa === null || empresa === undefined) return undefined;
  if (empresa === 'ALL') return 'ALL';
  return String(empresa);
}

// Exporta a URL base para referência
export { FIREBIRD_BRIDGE_BASE_URL };
