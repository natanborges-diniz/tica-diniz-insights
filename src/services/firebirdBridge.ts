// src/services/firebirdBridge.ts
// Cliente HTTP centralizado para Firebird Bridge API
// Contrato v2: envelope { ok, data, error, meta? }

const FIREBIRD_BRIDGE_BASE_URL =
  import.meta.env.VITE_FIREBIRD_BRIDGE_BASE_URL ||
  'https://firebird-bridge-production.up.railway.app';

// ============================================
// CONTRATO V2 — ENVELOPE ÚNICO
// ============================================
// Sucesso: { ok: true,  data: T[],  meta?: { count, elapsed_ms, ... } }
// Erro:    { ok: false, error: { code: string, message: string }, details?: unknown }

export interface ApiErrorObj {
  code: string;
  message: string;
  details?: unknown;
}

export type ApiError = ApiErrorObj | null;

export interface ApiEnvelope<T> {
  ok: boolean;
  data: T[] | null;
  error: ApiError;
  meta?: Record<string, unknown>;
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
  /** AbortSignal para cancelar a requisição */
  signal?: AbortSignal;
  /** Timeout customizado em ms (padrão: 15000) */
  timeoutMs?: number;
}

// ============================================
// TRACKING DE ENDPOINTS LEGADOS (deprecação)
// ============================================

const _legacyEndpointsLogged = new Set<string>();

function logLegacyFormat(path: string, format: string) {
  if (!_legacyEndpointsLogged.has(path)) {
    _legacyEndpointsLogged.add(path);
    console.warn(
      `[FirebirdBridge] ⚠️ DEPRECATED: Endpoint "${path}" retornou formato legado "${format}". ` +
      `Migre para envelope v2 { ok, data, error }. Este suporte será removido.`
    );
  }
}

// ============================================
// FUNÇÃO GENÉRICA DE REQUISIÇÃO
// ============================================

export async function apiGet<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>,
  options?: ApiGetOptions
): Promise<T[]> {
  // Circuit breaker check
  const { isBridgeCircuitOpen, recordBridgeFailure, recordBridgeSuccess } = await import('@/hooks/useBridgeStatus');
  if (isBridgeCircuitOpen()) {
    throw new Error('Conexão com o servidor de dados temporariamente suspensa. O sistema detectou falhas consecutivas. Aguarde alguns segundos e tente novamente.');
  }

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

  const externalSignal = options?.signal;
  const timeoutMs = options?.timeoutMs ?? 15000;
  
  const internalController = new AbortController();
  const timeoutId = setTimeout(() => internalController.abort(), timeoutMs);
  
  const abortHandler = () => internalController.abort();
  externalSignal?.addEventListener('abort', abortHandler);

  try {
    console.log(`[FirebirdBridge] GET ${path}`);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: internalController.signal,
    });

    clearTimeout(timeoutId);

    // Tratar erros HTTP antes de parsear body
    if (!response.ok) {
      // Tentar extrair erro estruturado do body
      try {
        const errorBody = await response.json();
        if (errorBody.ok === false && errorBody.error) {
          const err = new Error(errorBody.error.message || `HTTP ${response.status}`) as Error & { code?: string; details?: unknown };
          err.code = errorBody.error.code;
          err.details = errorBody.error.details;
          throw err;
        }
      } catch (parseErr) {
        if (parseErr instanceof Error && 'code' in parseErr) throw parseErr; // re-throw structured error
      }
      throw new Error(`Erro na API: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    // ========================================
    // ENVELOPE V2 (formato padrão)
    // ========================================
    if (result.ok !== undefined) {
      if (result.ok === false || result.error) {
        const errorObj = result.error;
        const errorMessage = errorObj?.message || 'Erro desconhecido na API';
        const err = new Error(errorMessage) as Error & { code?: string; details?: unknown };
        if (errorObj?.code) err.code = errorObj.code;
        if (errorObj?.details) err.details = errorObj.details;
        throw err;
      }
      const data = result.data ?? [];
      console.log(`[FirebirdBridge] ✓ ${path} → ${data.length} records`);
      recordBridgeSuccess();
      return data;
    }

    // ========================================
    // FORMATOS LEGADOS (suporte temporário com logging)
    // ========================================

    // Legacy: { data: [...] }
    if (result.data !== undefined && Array.isArray(result.data)) {
      logLegacyFormat(path, '{ data: [...] }');
      recordBridgeSuccess();
      return result.data;
    }

    // Legacy: { rows: [...] }
    if (result.rows !== undefined && Array.isArray(result.rows)) {
      logLegacyFormat(path, '{ rows: [...] }');
      recordBridgeSuccess();
      return result.rows;
    }

    // Legacy: array direto [...]
    if (Array.isArray(result)) {
      logLegacyFormat(path, '[...] (array direto)');
      recordBridgeSuccess();
      return result;
    }

    // Formato não reconhecido — falha explícita
    console.error(`[FirebirdBridge] ❌ Formato inválido em "${path}":`, typeof result, Object.keys(result));
    throw new Error(
      `Resposta inválida do servidor para ${path}. ` +
      `Formato esperado: { ok: true, data: [...] }. Contate o administrador.`
    );
  } catch (error) {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', abortHandler);

    recordBridgeFailure();

    if (error instanceof Error) {
      if (error.message.includes('temporariamente suspensa')) {
        throw error;
      }
      if (error.name === 'AbortError') {
        if (externalSignal?.aborted) {
          console.log(`[FirebirdBridge] Request cancelled: ${path}`);
          throw new Error('Requisição cancelada');
        }
        console.error(`[FirebirdBridge] Timeout: ${path}`);
        throw new Error('O servidor não respondeu a tempo. Verifique o status em Admin > Bridge Health.');
      }
      // Re-throw errors with code (structured API errors)
      if ('code' in error) throw error;
      console.error(`[FirebirdBridge] Error: ${path}`, error.message);
      throw new Error(`Erro de conexão: ${error.message}. Verifique o status do Bridge.`);
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
