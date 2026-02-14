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
// TELEMETRIA DE MIGRAÇÃO v2
// ============================================

/** Rastreia quais endpoints já responderam em v2 e quais ainda são legados */
const _v2MigrationStatus: Record<string, 'v2' | 'legacy'> = {};

/** Endpoints que já foram logados como legados (evita spam) */
const _legacyEndpointsLogged = new Set<string>();

function trackEndpointFormat(path: string, format: 'v2' | 'legacy') {
  _v2MigrationStatus[path] = format;
}

function logLegacyFormat(path: string, format: string) {
  trackEndpointFormat(path, 'legacy');
  if (!_legacyEndpointsLogged.has(path)) {
    _legacyEndpointsLogged.add(path);
    console.warn(
      `[FirebirdBridge] ⚠️ DEPRECATED: Endpoint "${path}" retornou formato legado "${format}". ` +
      `Migre para envelope v2 { ok, data, error }. Este suporte será removido.`
    );
  }
}

/**
 * Retorna o status de migração v2 de todos os endpoints conhecidos.
 * Útil para acompanhar o progresso da migração.
 */
export function getV2MigrationStatus(): Record<string, 'v2' | 'legacy'> {
  return { ..._v2MigrationStatus };
}

/**
 * Retorna um resumo do progresso da migração v2.
 */
export function getV2MigrationSummary(): { total: number; v2: number; legacy: number; endpoints: Record<string, string> } {
  const entries = Object.entries(_v2MigrationStatus);
  const v2Count = entries.filter(([, s]) => s === 'v2').length;
  const legacyCount = entries.filter(([, s]) => s === 'legacy').length;
  return {
    total: entries.length,
    v2: v2Count,
    legacy: legacyCount,
    endpoints: { ..._v2MigrationStatus }
  };
}

// ============================================
// CÓDIGOS DE ERRO PADRONIZADOS
// ============================================

export type BridgeErrorCode =
  | 'VALIDATION_ERROR'
  | 'FIREBIRD_TIMEOUT'
  | 'FIREBIRD_DISCONNECTED'
  | 'QUERY_ERROR'
  | 'INTERNAL_ERROR'
  | 'NOT_FOUND'
  | 'CIRCUIT_OPEN'
  | 'REQUEST_CANCELLED'
  | 'CLIENT_TIMEOUT';

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
    throw Object.assign(
      new Error('Conexão com o servidor de dados temporariamente suspensa. O sistema detectou falhas consecutivas. Aguarde alguns segundos e tente novamente.'),
      { code: 'CIRCUIT_OPEN' as BridgeErrorCode }
    );
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
      // Tentar extrair erro estruturado do body (v2)
      try {
        const errorBody = await response.json();
        if (errorBody.ok === false && errorBody.error) {
          trackEndpointFormat(path, 'v2'); // Erro v2 é ainda v2
          const err = new Error(errorBody.error.message || `HTTP ${response.status}`) as Error & { code?: string; details?: unknown };
          err.code = errorBody.error.code;
          err.details = errorBody.error.details || errorBody.details;
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
        trackEndpointFormat(path, 'v2');
        const errorObj = result.error;
        const errorMessage = errorObj?.message || 'Erro desconhecido na API';
        const err = new Error(errorMessage) as Error & { code?: string; details?: unknown };
        if (errorObj?.code) err.code = errorObj.code;
        if (errorObj?.details) err.details = errorObj.details;
        throw err;
      }
      const data = result.data ?? [];
      trackEndpointFormat(path, 'v2');
      const meta = result.meta;
      if (meta?.elapsed_ms) {
        console.log(`[FirebirdBridge] ✓ ${path} → ${data.length} records (${meta.elapsed_ms}ms)`);
      } else {
        console.log(`[FirebirdBridge] ✓ ${path} → ${data.length} records`);
      }
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
      // Preservar erros com código estruturado (circuit breaker, API errors)
      if ('code' in error) {
        throw error;
      }
      if (error.name === 'AbortError') {
        if (externalSignal?.aborted) {
          console.log(`[FirebirdBridge] Request cancelled: ${path}`);
          throw Object.assign(new Error('Requisição cancelada'), { code: 'REQUEST_CANCELLED' as BridgeErrorCode });
        }
        console.error(`[FirebirdBridge] Timeout: ${path}`);
        throw Object.assign(
          new Error('O servidor não respondeu a tempo. Verifique o status em Admin > Bridge Health.'),
          { code: 'CLIENT_TIMEOUT' as BridgeErrorCode }
        );
      }
      console.error(`[FirebirdBridge] Error: ${path}`, error.message);
      throw Object.assign(
        new Error(`Erro de conexão: ${error.message}. Verifique o status do Bridge.`),
        { code: 'INTERNAL_ERROR' as BridgeErrorCode }
      );
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
