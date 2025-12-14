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
// FUNÇÃO GENÉRICA DE REQUISIÇÃO
// ============================================

export async function apiGet<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>
): Promise<T[]> {
  const url = new URL(`${FIREBIRD_BRIDGE_BASE_URL}/api/v1${path}`);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.append(key, String(value));
      }
    });
  }

  // Timeout de 60 segundos para permitir consultas consolidadas
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

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

    const result: ApiEnvelope<T[]> = await response.json();

    // Aplicar regra do envelope { ok, data, error }
    if (result.ok === false || result.error) {
      const errorObj = result.error;
      const errorMessage = errorObj?.message || 'Erro desconhecido na API';
      const error = new Error(errorMessage) as Error & { code?: string; details?: unknown };
      if (errorObj?.code) error.code = errorObj.code;
      if (errorObj?.details) error.details = errorObj.details;
      throw error;
    }

    const data = result.data ?? [];
    console.log(`[FirebirdBridge] Success: ${path}`, data.length, 'records');

    return data;
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
