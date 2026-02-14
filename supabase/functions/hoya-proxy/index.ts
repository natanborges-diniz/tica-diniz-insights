// supabase/functions/hoya-proxy/index.ts
// Proxy seguro para API Hoya Lab
// E0.3: JWT obrigatório + role mínima: gestor
// E4.1: Auditoria completa + validação de ambiente + requested_by
// F4.1: fetchWithRetry (15s timeout, 3 retries, exponential backoff) + standardized error codes

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authGuard, corsHeaders } from "../_shared/authGuard.ts";

const HOYA_BASE_URL = Deno.env.get("HOYA_BASE_URL") || "https://hoyalab.com.br/api/customer";

// F4.1: Standardized error codes
const HOYA_ERROR_CODES = {
  TIMEOUT: "HOYA_TIMEOUT",
  RATE_LIMITED: "HOYA_RATE_LIMITED",
  UNAVAILABLE: "HOYA_UNAVAILABLE",
  API_ERROR: "HOYA_API_ERROR",
  CONFIG_ERROR: "HOYA_CONFIG_ERROR",
} as const;

// Detect environment from base URL
function detectHoyaEnvironment(): string {
  const url = HOYA_BASE_URL.toLowerCase();
  if (url.includes("staging") || url.includes("homolog") || url.includes("sandbox") || url.includes("test")) {
    return "staging";
  }
  return "production";
}

// F4.1: Generate correlation ID for request tracing
function generateCorrelationId(): string {
  return crypto.randomUUID().slice(0, 8);
}

// F4.1: fetchWithRetry — 15s timeout, 3 retries with exponential backoff
interface FetchRetryOptions {
  timeout?: number;
  maxRetries?: number;
  backoffMs?: number;
  action?: string;
  correlationId?: string;
}

async function fetchWithRetry(
  url: string,
  fetchOptions: RequestInit,
  retryOpts: FetchRetryOptions = {}
): Promise<Response> {
  const {
    timeout = 15000,
    maxRetries = 3,
    backoffMs = 1000,
    action = "unknown",
    correlationId = "n/a",
  } = retryOpts;

  let lastError: Error | null = null;
  let lastStatus: number | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = backoffMs * Math.pow(2, attempt - 1); // 1s, 2s, 4s
      console.log(`[hoya-proxy] [${correlationId}] Retry ${attempt}/${maxRetries} for ${action} after ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const start = Date.now();

    try {
      const resp = await fetch(url, { ...fetchOptions, signal: controller.signal });
      clearTimeout(timer);
      const elapsed = Date.now() - start;

      console.log(`[hoya-proxy] [${correlationId}] ${action} -> ${resp.status} (${elapsed}ms)`);

      // Retry on 429 or 503
      if ((resp.status === 429 || resp.status === 503) && attempt < maxRetries) {
        lastStatus = resp.status;
        lastError = new Error(`HTTP ${resp.status}`);
        continue;
      }

      return resp;
    } catch (err) {
      clearTimeout(timer);
      const elapsed = Date.now() - start;
      const isTimeout = err instanceof DOMException && err.name === "AbortError";

      console.error(`[hoya-proxy] [${correlationId}] ${action} FAILED (${elapsed}ms): ${isTimeout ? "TIMEOUT" : err}`);

      lastError = err instanceof Error ? err : new Error(String(err));
      lastStatus = isTimeout ? 408 : null;

      if (attempt >= maxRetries) break;
      // Retry on timeout or network error
    }
  }

  // All retries exhausted — throw standardized error
  const code =
    lastStatus === 429
      ? HOYA_ERROR_CODES.RATE_LIMITED
      : lastStatus === 503
      ? HOYA_ERROR_CODES.UNAVAILABLE
      : lastStatus === 408 || (lastError instanceof DOMException && lastError.name === "AbortError")
      ? HOYA_ERROR_CODES.TIMEOUT
      : HOYA_ERROR_CODES.API_ERROR;

  const message =
    code === HOYA_ERROR_CODES.TIMEOUT
      ? "API Hoya não respondeu dentro do tempo limite (15s)"
      : code === HOYA_ERROR_CODES.RATE_LIMITED
      ? "API Hoya retornou limite de requisições (429) após retentativas"
      : code === HOYA_ERROR_CODES.UNAVAILABLE
      ? "API Hoya indisponível (503) após retentativas"
      : `Erro de comunicação com API Hoya: ${lastError?.message || "desconhecido"}`;

  throw { code, message, correlationId };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const correlationId = generateCorrelationId();

  try {
    // E0.3: Auth guard — gestor ou admin
    const user = await authGuard(req, { requiredRole: "gestor" });

    const HOYA_API_KEY = Deno.env.get("HOYA_API_KEY");
    if (!HOYA_API_KEY) {
      return new Response(
        JSON.stringify({ error: "HOYA_API_KEY não configurada.", code: HOYA_ERROR_CODES.CONFIG_ERROR, correlationId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { action, ...params } = body;

    const hoyaEnv = detectHoyaEnvironment();
    console.log(`[hoya-proxy] [${correlationId}] Action: ${action} | Env: ${hoyaEnv} | User: ${user?.userId}`);

    let url: string;
    let method = "GET";
    let fetchBody: string | undefined;

    switch (action) {
      case "listar-produtos": {
        // F4.3: Cache with 24h TTL
        const cacheEnv = detectHoyaEnvironment();
        const forceRefresh = params.forceRefresh === true;
        const sbCache = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

        if (!forceRefresh) {
          const { data: cached } = await sbCache
            .from("hoya_catalogo_cache")
            .select("data, fetched_at, produto_count")
            .eq("hoya_environment", cacheEnv)
            .gt("expires_at", new Date().toISOString())
            .maybeSingle();

          if (cached) {
            console.log(`[hoya-proxy] [${correlationId}] Catalog cache HIT (${cached.produto_count} products, env: ${cacheEnv})`);
            return new Response(JSON.stringify(cached.data), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json", "X-Hoya-Cache": "HIT", "X-Correlation-Id": correlationId },
            });
          }
        }

        // Cache MISS or forced refresh — fetch from Hoya API
        url = `${HOYA_BASE_URL}/produto`;
        const catalogResp = await fetchWithRetry(
          url,
          { method: "GET", headers: { "x-api-key": HOYA_API_KEY, "Content-Type": "application/json" } },
          { action: "listar-produtos", correlationId }
        );
        const catalogText = await catalogResp.text();
        let catalogData: unknown;
        try { catalogData = JSON.parse(catalogText); } catch { catalogData = { rawResponse: catalogText }; }

        // Save to cache (upsert by environment)
        if (catalogResp.ok && Array.isArray(catalogData)) {
          await sbCache.from("hoya_catalogo_cache").upsert(
            {
              hoya_environment: cacheEnv,
              data: catalogData,
              fetched_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
              produto_count: catalogData.length,
            },
            { onConflict: "hoya_environment" }
          );
          console.log(`[hoya-proxy] [${correlationId}] Catalog cache MISS — saved ${catalogData.length} products (env: ${cacheEnv})`);
        }

        return new Response(JSON.stringify(catalogData), {
          status: catalogResp.status,
          headers: { ...corsHeaders, "Content-Type": "application/json", "X-Hoya-Cache": "MISS", "X-Correlation-Id": correlationId },
        });
      }
      case "invalidar-cache": {
        // F4.3: Force cache invalidation (admin only)
        const sbInv = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const invEnv = detectHoyaEnvironment();
        await sbInv.from("hoya_catalogo_cache").delete().eq("hoya_environment", invEnv);
        console.log(`[hoya-proxy] [${correlationId}] Cache invalidated for env: ${invEnv}`);
        return new Response(JSON.stringify({ success: true, environment: invEnv }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId },
        });
      }
      case "consultar-produto": url = `${HOYA_BASE_URL}/produto/${params.codigoProduto}`; break;
      case "consultar-produto-sku": url = `${HOYA_BASE_URL}/produto/sku/${params.sku}`; break;
      case "criar-pedido": {
        url = `${HOYA_BASE_URL}/pedido`; method = "POST";
        fetchBody = JSON.stringify(params.pedido);

        // F4.2: Idempotency check
        const hoyaEnvForKey = detectHoyaEnvironment();
        const payloadHash = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(fetchBody)
        );
        const hashHex = Array.from(new Uint8Array(payloadHash))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
          .slice(0, 16);
        const idempotencyKey = `HOYA_${params.codEmpresa || 0}_${params.codOs || 0}_${hoyaEnvForKey}_${hashHex}`;

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const sbIdem = createClient(supabaseUrl, supabaseKey);

        const { data: existing } = await sbIdem
          .from("pedidos_fornecedor")
          .select("*")
          .eq("idempotency_key", idempotencyKey)
          .neq("status", "ERRO")
          .maybeSingle();

        if (existing) {
          console.log(`[hoya-proxy] [${correlationId}] Idempotency HIT: ${idempotencyKey}`);
          return new Response(
            JSON.stringify({
              numeroPedido: existing.numero_pedido,
              status: existing.status,
              idempotencyHit: true,
              message: "Pedido já enviado para esta OS/empresa/ambiente.",
            }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId, "X-Idempotency-Key": idempotencyKey },
            }
          );
        }

        // Store key for later audit insert
        (params as Record<string, unknown>).__idempotencyKey = idempotencyKey;
        break;
      }
      case "consultar-pedido": url = `${HOYA_BASE_URL}/pedido/tracking/${params.numeroPedido}`; break;
      case "consultar-pedidos":
        url = `${HOYA_BASE_URL}/pedido/consultar`; method = "POST";
        fetchBody = JSON.stringify(params.filtros || {}); break;
      case "tipos-armacao": url = `${HOYA_BASE_URL}/tipoarmacao`; break;
      case "desenhos": url = `${HOYA_BASE_URL}/desenho`; break;
      case "materiais": url = `${HOYA_BASE_URL}/material`; break;
      case "tratamentos": url = `${HOYA_BASE_URL}/tratamento`; break;
      case "alturas": url = `${HOYA_BASE_URL}/altura`; break;
      case "fotossensiveis": url = `${HOYA_BASE_URL}/fotossensivel`; break;
      case "coloracoes":
        url = `${HOYA_BASE_URL}/coloracao`; method = "POST";
        fetchBody = JSON.stringify(params.filtros || {}); break;
      // E4.1: Audit history
      case "historico-pedidos": {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const sb = createClient(supabaseUrl, supabaseKey);
        
        let query = sb.from("pedidos_fornecedor")
          .select("*")
          .eq("fornecedor", "HOYA")
          .order("created_at", { ascending: false })
          .limit(params.limit || 50);
        
        if (params.codEmpresa && params.codEmpresa !== "ALL") {
          query = query.eq("cod_empresa", Number(params.codEmpresa));
        }
        
        const { data: pedidos, error: dbErr } = await query;
        if (dbErr) throw new Error(dbErr.message);
        
        return new Response(JSON.stringify(pedidos || []), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      default:
        return new Response(
          JSON.stringify({ error: `Ação desconhecida: ${action}`, code: HOYA_ERROR_CODES.API_ERROR, correlationId }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // F4.1: Use fetchWithRetry instead of direct fetch
    const hoyaResp = await fetchWithRetry(
      url,
      {
        method,
        headers: { "x-api-key": HOYA_API_KEY, "Content-Type": "application/json" },
        body: method !== "GET" ? fetchBody : undefined,
      },
      { action, correlationId }
    );

    const respText = await hoyaResp.text();
    let respData: unknown;
    try { respData = JSON.parse(respText); } catch { respData = { rawResponse: respText }; }

    // E4.1: Enhanced audit for order creation
    if (action === "criar-pedido") {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        const respObj = respData as Record<string, unknown>;
        const numeroPedido = hoyaResp.ok && respObj?.numeroPedido ? String(respObj.numeroPedido) : null;
        
        await supabase.from("pedidos_fornecedor").insert({
          cod_os: params.codOs || 0,
          cod_empresa: params.codEmpresa || 0,
          fornecedor: "HOYA",
          numero_pedido: numeroPedido,
          status: hoyaResp.ok 
            ? ((respObj?.status as string) || "Enviado") 
            : "ERRO",
          payload: params.pedido,
          response: respData,
          requested_by: user?.userId || null,
          requested_at: new Date().toISOString(),
          hoya_environment: hoyaEnv,
          idempotency_key: (params as Record<string, unknown>).__idempotencyKey || null,
        });
        console.log(`[hoya-proxy] [${correlationId}] Order audit saved. User: ${user?.userId} Env: ${hoyaEnv} Success: ${hoyaResp.ok}`);
      } catch (dbErr) {
        console.error(`[hoya-proxy] [${correlationId}] Failed to save order audit:`, dbErr);
      }
    }

    return new Response(JSON.stringify(respData), {
      status: hoyaResp.status,
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId },
    });
  } catch (err) {
    if (err instanceof Response) return err;

    // F4.1: Handle standardized error objects from fetchWithRetry
    if (typeof err === "object" && err !== null && "code" in err && "message" in err) {
      const hoyaErr = err as { code: string; message: string; correlationId?: string };
      const status =
        hoyaErr.code === HOYA_ERROR_CODES.TIMEOUT ? 504
        : hoyaErr.code === HOYA_ERROR_CODES.RATE_LIMITED ? 429
        : hoyaErr.code === HOYA_ERROR_CODES.UNAVAILABLE ? 503
        : 502;
      return new Response(
        JSON.stringify({ error: hoyaErr.message, code: hoyaErr.code, correlationId: hoyaErr.correlationId || correlationId }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId } }
      );
    }

    console.error(`[hoya-proxy] [${correlationId}] Error:`, err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido", code: HOYA_ERROR_CODES.API_ERROR, correlationId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId } }
    );
  }
});
