// src/services/firebirdBridge.ts
// Cliente HTTP centralizado para Firebird Bridge API
// Contrato v2 ONLY: envelope { ok, data, error, meta? }
// Fase 2.7: strict mode permanente — fallbacks legados removidos

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
  | 'CLIENT_TIMEOUT'
  | 'BRIDGE_CONTRACT_VIOLATION';

// ============================================
// TELEMETRIA V2 (somente contagem de sucesso)
// ============================================

const _v2Endpoints = new Set<string>();

function recordV2(path: string) {
  _v2Endpoints.add(path);
}

/** Retorna lista de endpoints v2 contactados nesta sessão */
export function getBridgeTelemetry(): {
  v2Endpoints: string[];
  legacyEndpoints: Array<{ path: string; count: number; format: string; lastSeen: number }>;
  strictMode: boolean;
} {
  return {
    v2Endpoints: Array.from(_v2Endpoints).sort(),
    legacyEndpoints: [], // Legado removido na Fase 2.7
    strictMode: true,    // Sempre strict
  };
}

// Compat stubs — mantidos para não quebrar AdminHealthPage imports
/** @deprecated Strict mode é permanente desde a Fase 2.7 */
export function setBridgeStrictContract(_enabled: boolean) {
  // no-op: strict mode is always on
}

/** @deprecated Sempre retorna true desde a Fase 2.7 */
export function isBridgeStrictContract(): boolean {
  return true;
}

// ============================================
// FUNÇÃO GENÉRICA DE REQUISIÇÃO (V2 ONLY)
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
      try {
        const errorBody = await response.json();
        if (errorBody.ok === false && errorBody.error) {
          recordV2(path);
          const err = new Error(errorBody.error.message || `HTTP ${response.status}`) as Error & { code?: string; details?: unknown };
          err.code = errorBody.error.code;
          err.details = errorBody.error.details || errorBody.details;
          throw err;
        }
      } catch (parseErr) {
        if (parseErr instanceof Error && 'code' in parseErr) throw parseErr;
      }
      throw new Error(`Erro na API: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    // ========================================
    // ENVELOPE V2 (único formato aceito)
    // ========================================
    if (result.ok !== undefined) {
      if (result.ok === false || result.error) {
        recordV2(path);
        const errorObj = result.error;
        const errorMessage = errorObj?.message || 'Erro desconhecido na API';
        const err = new Error(errorMessage) as Error & { code?: string; details?: unknown };
        if (errorObj?.code) err.code = errorObj.code;
        if (errorObj?.details) err.details = errorObj.details;
        throw err;
      }
      const data = result.data ?? [];
      recordV2(path);
      const meta = result.meta;
      if (meta?.elapsed_ms) {
        console.log(`[FirebirdBridge] ✓ ${path} → ${data.length} rows (${meta.elapsed_ms}ms)`);
      } else {
        console.log(`[FirebirdBridge] ✓ ${path} → ${data.length} rows`);
      }
      recordBridgeSuccess();
      return data;
    }

    // ========================================
    // QUALQUER OUTRO FORMATO → VIOLAÇÃO
    // ========================================
    throw Object.assign(
      new Error(
        `Endpoint "${path}" retornou formato não-v2. Apenas envelope { ok, data, error } é aceito. ` +
        `Verifique se o backend está atualizado (CONTRACT.md v2.4.0).`
      ),
      { code: 'BRIDGE_CONTRACT_VIOLATION' as BridgeErrorCode }
    );
  } catch (error) {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', abortHandler);

    recordBridgeFailure();

    if (error instanceof Error) {
      if ('code' in error) throw error;
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

export { FIREBIRD_BRIDGE_BASE_URL };
