// supabase/functions/hoya-proxy/index.ts
// Proxy seguro para API Hoya Lab
// E0.3: JWT obrigatório + role mínima: gestor
// E4.1: Auditoria completa + validação de ambiente + requested_by
// F4.1: fetchWithRetry (15s timeout, 3 retries, exponential backoff) + standardized error codes

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authGuard, corsHeaders } from "../_shared/authGuard.ts";

// Config will be loaded from DB (fornecedor_configuracao) at runtime, with env secret as fallback
const HOYA_BASE_URL_FALLBACK = Deno.env.get("HOYA_BASE_URL") || "https://hoyalab.com.br/api/customer";
const HOYA_API_KEY_FALLBACK = Deno.env.get("HOYA_API_KEY");

// F4.1: Standardized error codes
const HOYA_ERROR_CODES = {
  TIMEOUT: "HOYA_TIMEOUT",
  RATE_LIMITED: "HOYA_RATE_LIMITED",
  UNAVAILABLE: "HOYA_UNAVAILABLE",
  API_ERROR: "HOYA_API_ERROR",
  CONFIG_ERROR: "HOYA_CONFIG_ERROR",
} as const;

// Load config from DB (fornecedor_configuracao), fallback to env secrets
interface HoyaRuntimeConfig {
  baseUrl: string;
  apiKey: string;
  ambiente: string;
}

async function loadHoyaConfig(sb: ReturnType<typeof createClient>): Promise<HoyaRuntimeConfig> {
  try {
    const { data } = await sb
      .from("fornecedor_configuracao")
      .select("ambiente, base_url_staging, base_url_production, api_key, api_key_staging, api_key_production")
      .eq("fornecedor", "HOYA")
      .eq("ativo", true)
      .maybeSingle();

    if (data) {
      const isProduction = data.ambiente === "production";
      const baseUrl = (isProduction ? data.base_url_production : data.base_url_staging)
        || HOYA_BASE_URL_FALLBACK;
      // Usa a chave específica do ambiente; fallback para api_key legada, depois para env secret
      const apiKey = isProduction
        ? (data.api_key_production || data.api_key || HOYA_API_KEY_FALLBACK || "")
        : (data.api_key_staging || data.api_key || HOYA_API_KEY_FALLBACK || "");
      return { baseUrl, apiKey, ambiente: data.ambiente };
    }
  } catch (e) {
    console.warn("[hoya-proxy] Could not load DB config, using fallback secrets:", e);
  }
  // Fallback to env secrets
  return {
    baseUrl: HOYA_BASE_URL_FALLBACK,
    apiKey: HOYA_API_KEY_FALLBACK || "",
    ambiente: HOYA_BASE_URL_FALLBACK.toLowerCase().includes("staging") ? "staging" : "production",
  };
}

// Detect environment from base URL (kept for backward compat)
function detectHoyaEnvironment(baseUrl?: string): string {
  const url = (baseUrl || HOYA_BASE_URL_FALLBACK).toLowerCase();
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

// Helper: detect negative/problematic statuses that should trigger alerts
function isNegativeStatus(status: string): boolean {
  const s = status.toLowerCase();
  return (
    s.includes("cancel") ||
    s.includes("rejeit") ||
    s.includes("recusad") ||
    s.includes("devolv") ||
    s.includes("negad") ||
    s.includes("falha") ||
    s.includes("erro")
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const correlationId = generateCorrelationId();

  try {
    const body = await req.json();
    const { action, ...params } = body;

    let user: { userId: string; email?: string } | null = null;

    // F4.5: Batch tracking called by cron (anon key) — bypass user auth
    if (action === "atualizar-tracking-batch") {
      const authHeader = req.headers.get("Authorization") || "";
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
      const token = authHeader.replace("Bearer ", "");
      if (token !== anonKey && token !== serviceKey) {
        throw new Response(
          JSON.stringify({ error: "Unauthorized — batch tracking requer chave válida" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      user = { userId: "cron" };
    } else {
      // Auth guard — qualquer usuário autenticado (controle por módulo)
      user = await authGuard(req, { requiredRole: "authenticated" });
    }

    // Load config from DB (fornecedor_configuracao) — fallback to secrets
    const sbConfig = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const hoyaConfig = await loadHoyaConfig(sbConfig);
    const HOYA_BASE_URL = hoyaConfig.baseUrl;
    const HOYA_API_KEY = hoyaConfig.apiKey;

    if (!HOYA_API_KEY) {
      return new Response(
        JSON.stringify({ error: "HOYA_API_KEY não configurada.", code: HOYA_ERROR_CODES.CONFIG_ERROR, correlationId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const hoyaEnv = hoyaConfig.ambiente;
    console.log(`[hoya-proxy] [${correlationId}] Action: ${action} | Env: ${hoyaEnv} | URL: ${HOYA_BASE_URL} | User: ${user?.userId}`);

    let url: string;
    let method = "GET";
    let fetchBody: string | undefined;

    switch (action) {
      case "listar-produtos": {
        // F4.3: Cache with 24h TTL
        const cacheEnv = hoyaEnv;
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
        const invEnv = hoyaEnv;
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
        method = "POST";
        const pedidoPayload = params.pedido || {};
        
        // 1) Legacy param required by HOYA SQL Server backend (@ValorMontagemSemTriangulacao)
        //    Not documented in API contract, but backend stored procedure requires it.
        const valorMontagem = Number(
          pedidoPayload.valorMontagemSemTriangulacao ??
          pedidoPayload.ValorMontagemSemTriangulacao ??
          pedidoPayload.ValorMontagem ??
          0
        ) || 0;
        delete pedidoPayload.valorMontagemSemTriangulacao;
        delete pedidoPayload.ValorMontagemSemTriangulacao;
        delete pedidoPayload.ValorMontagem;
        // Send both variants to cover legacy binder (@key) and DTO binder (PascalCase)
        pedidoPayload["@ValorMontagemSemTriangulacao"] = valorMontagem;
        pedidoPayload.ValorMontagemSemTriangulacao = valorMontagem;
        
        // 2) When codigoProduto is present, remove alternative characteristic fields
        //    (API mode A = codigoProduto only; mode B = characteristics without codigoProduto)
        if (pedidoPayload?.especificacoes?.codigoProduto) {
          delete pedidoPayload.especificacoes.codigoDesenho;
          delete pedidoPayload.especificacoes.codigoAltura;
          delete pedidoPayload.especificacoes.codigoMaterial;
          delete pedidoPayload.especificacoes.codigoTratamento;
          delete pedidoPayload.especificacoes.codigoFotossensivel;
        }
        
        const baseUrl = HOYA_BASE_URL.replace(/\/+$/, '');
        url = `${baseUrl}/pedido`;
        
        // 3) Auto-inject codigoCliente from hoya_empresa_config if not provided
        if (!pedidoPayload.codigoCliente && params.codEmpresa) {
          const sbConfig = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
          const { data: empConfig } = await sbConfig
            .from("hoya_empresa_config")
            .select("cod_cliente_hoya")
            .eq("cod_empresa", params.codEmpresa)
            .eq("ativo", true)
            .maybeSingle();
          if (empConfig?.cod_cliente_hoya) {
            pedidoPayload.codigoCliente = Number(empConfig.cod_cliente_hoya) || empConfig.cod_cliente_hoya;
            console.log(`[hoya-proxy] [${correlationId}] Auto-injected codigoCliente=${pedidoPayload.codigoCliente} for empresa=${params.codEmpresa}`);
          } else {
            console.warn(`[hoya-proxy] [${correlationId}] No cod_cliente_hoya found for empresa=${params.codEmpresa}`);
          }
        }

        // Ensure all expected nullable fields are present (Hoya .NET deserializer requires explicit nulls)
        pedidoPayload.observacao = pedidoPayload.observacao ?? null;
        pedidoPayload.codigoCliente = pedidoPayload.codigoCliente ?? null;
        pedidoPayload.voucher = pedidoPayload.voucher ?? null;
        if (pedidoPayload.armacao) {
          pedidoPayload.armacao.marca = pedidoPayload.armacao.marca ?? null;
          pedidoPayload.armacao.modelo = pedidoPayload.armacao.modelo ?? null;
          pedidoPayload.armacao.cor = pedidoPayload.armacao.cor ?? null;
        }
        if (pedidoPayload.garantia) {
          pedidoPayload.garantia.nomeMedico = pedidoPayload.garantia.nomeMedico ?? null;
          pedidoPayload.garantia.crmMedico = pedidoPayload.garantia.crmMedico ?? null;
        }

        // Normalize condicaoPagamento → codigoCondicaoPagamento (new API field)
        // If not provided, omit so Hoya uses the client's default payment condition
        const condPag = pedidoPayload.condicaoPagamento || pedidoPayload.CondicaoPagamento || pedidoPayload.codigoCondicaoPagamento;
        delete pedidoPayload.condicaoPagamento;
        delete pedidoPayload.CondicaoPagamento;
        if (condPag) {
          pedidoPayload.codigoCondicaoPagamento = Number(condPag) || condPag;
        }
        
        fetchBody = JSON.stringify(pedidoPayload);
        console.log(`[hoya-proxy] [${correlationId}] criar-pedido URL: ${url}`);
        console.log(`[hoya-proxy] [${correlationId}] criar-pedido BODY: ${fetchBody.substring(0, 2000)}`);

        // F4.2: Idempotency check
        const hoyaEnvForKey = hoyaEnv;
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
      case "consultar-pedido": {
        const trackingUrl = `${HOYA_BASE_URL}/pedido/tracking/${params.numeroPedido}`;
        const trackingResp = await fetchWithRetry(
          trackingUrl,
          { method: "GET", headers: { "x-api-key": HOYA_API_KEY, "Content-Type": "application/json" } },
          { action: "consultar-pedido", correlationId }
        );
        const trackingText = await trackingResp.text();
        let trackingData: unknown;
        try { trackingData = JSON.parse(trackingText); } catch { trackingData = { rawResponse: trackingText }; }

        if (!trackingResp.ok) {
          // Sempre retorna 200 com campo error para evitar FunctionsHttpError no frontend
          return new Response(
            JSON.stringify({
              error: "Pedido não encontrado na Hoya",
              details: trackingData,
              code: trackingResp.status === 404 ? "HOYA_NOT_FOUND" : HOYA_ERROR_CODES.API_ERROR,
              correlationId,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId } }
          );
        }

        return new Response(JSON.stringify(trackingData), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId },
        });
      }

      // Recupera pedido Hoya pelo número da OS (para casos onde o pedido foi criado mas não registrado)
      case "recuperar-pedido-por-os": {
        const sbRec = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const osNumero = String(params.osNumero || params.os || "");
        const codOsRec = Number(params.codOs) || 0;
        const codEmpresaRec = Number(params.codEmpresa) || 0;

        if (!osNumero) {
          return new Response(
            JSON.stringify({ error: "osNumero obrigatório", code: HOYA_ERROR_CODES.API_ERROR, correlationId }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Consulta Hoya pelo número da OS
        const recUrl = `${HOYA_BASE_URL.replace(/\/+$/, "")}/pedido/consultar`;
        console.log(`[hoya-proxy] [${correlationId}] recuperar-pedido-por-os: consultando OS ${osNumero}`);
        const recResp = await fetchWithRetry(
          recUrl,
          {
            method: "POST",
            headers: { "x-api-key": HOYA_API_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({ os: osNumero }),
          },
          { action: "recuperar-pedido-por-os", correlationId }
        );

        const recText = await recResp.text();
        let recData: unknown;
        try { recData = JSON.parse(recText); } catch { recData = { rawResponse: recText }; }

        if (!recResp.ok) {
          return new Response(JSON.stringify({ error: "Hoya não encontrou pedido para esta OS", raw: recData, code: HOYA_ERROR_CODES.API_ERROR, correlationId }), {
            status: recResp.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // recData pode ser array ou objeto único
        const recArr = Array.isArray(recData) ? recData : [recData];
        const pedidoHoya = recArr[0] as Record<string, unknown> | undefined;

        if (!pedidoHoya || !pedidoHoya.numeroPedido) {
          return new Response(JSON.stringify({ error: "Nenhum pedido encontrado na Hoya para esta OS", code: HOYA_ERROR_CODES.API_ERROR, correlationId }), {
            status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const numeroPedidoRec = String(pedidoHoya.numeroPedido);

        // Atualiza o registro mais recente com ERRO (sem numero_pedido) para refletir o sucesso
        const { data: erroRows } = await sbRec
          .from("pedidos_fornecedor")
          .select("id")
          .eq("cod_os", codOsRec)
          .is("numero_pedido", null)
          .eq("hoya_environment", hoyaEnv)
          .order("created_at", { ascending: false })
          .limit(1);

        const erroId = erroRows?.[0]?.id;
        if (erroId) {
          await sbRec.from("pedidos_fornecedor").update({
            numero_pedido: numeroPedidoRec,
            status: "CONFIRMADO",
            response: pedidoHoya,
            updated_at: new Date().toISOString(),
          }).eq("id", erroId);
          console.log(`[hoya-proxy] [${correlationId}] Registro ${erroId} atualizado com numeroPedido=${numeroPedidoRec}`);
        } else {
          // Cria novo registro se não havia nenhum com erro
          await sbRec.from("pedidos_fornecedor").insert({
            cod_os: codOsRec,
            cod_empresa: codEmpresaRec,
            fornecedor: "HOYA",
            numero_pedido: numeroPedidoRec,
            status: "CONFIRMADO",
            response: pedidoHoya,
            requested_by: user?.userId || null,
            hoya_environment: hoyaEnv,
          });
          console.log(`[hoya-proxy] [${correlationId}] Novo registro criado com numeroPedido=${numeroPedidoRec}`);
        }

        return new Response(JSON.stringify({ numeroPedido: numeroPedidoRec, status: "CONFIRMADO", pedido: pedidoHoya, recovered: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId },
        });
      }
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

      // F4.5: Single tracking update
      case "atualizar-tracking": {
        const sbTrack = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const numeroPedido = params.numeroPedido || params.numeroPedidoHoya;
        const pedidoFornecedorId = params.pedidoFornecedorId;

        if (!numeroPedido) {
          return new Response(JSON.stringify({ error: "numeroPedido obrigatório", code: HOYA_ERROR_CODES.API_ERROR, correlationId }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Fetch tracking from Hoya API
        const trackUrl = `${HOYA_BASE_URL}/pedido/tracking/${numeroPedido}`;
        const trackResp = await fetchWithRetry(
          trackUrl,
          { method: "GET", headers: { "x-api-key": HOYA_API_KEY, "Content-Type": "application/json" } },
          { action: "atualizar-tracking", correlationId }
        );
        const trackText = await trackResp.text();
        let trackData: Record<string, unknown>;
        try { trackData = JSON.parse(trackText); } catch { trackData = { rawResponse: trackText }; }

        if (!trackResp.ok) {
          return new Response(JSON.stringify({ error: "Erro ao consultar tracking", details: trackData, code: HOYA_ERROR_CODES.API_ERROR, correlationId }), {
            status: trackResp.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const newStatus = String(trackData.status || "Desconhecido");
        const newStatusProd = trackData.statusProducao ? String(trackData.statusProducao) : null;
        const newRastreio = trackData.rastreio ? String(trackData.rastreio) : null;

        // Find pedido_fornecedor if not provided
        let pfId = pedidoFornecedorId;
        let pfCodEmpresa: number | null = null;
        if (!pfId) {
          const { data: pfRec } = await sbTrack
            .from("pedidos_fornecedor")
            .select("id, cod_empresa")
            .eq("numero_pedido", String(numeroPedido))
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          pfId = pfRec?.id;
          pfCodEmpresa = pfRec?.cod_empresa ?? null;
        } else {
          const { data: pfRec2 } = await sbTrack
            .from("pedidos_fornecedor")
            .select("cod_empresa")
            .eq("id", pfId)
            .maybeSingle();
          pfCodEmpresa = pfRec2?.cod_empresa ?? null;
        }

        if (!pfId) {
          return new Response(JSON.stringify({ tracking: trackData, saved: false, reason: "pedido_fornecedor não encontrado" }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId },
          });
        }

        // Check last status to avoid duplicates
        const { data: lastEntry } = await sbTrack
          .from("pedido_status_history")
          .select("status, status_producao, rastreio")
          .eq("pedido_fornecedor_id", pfId)
          .order("checked_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const statusChanged = !lastEntry || lastEntry.status !== newStatus || lastEntry.status_producao !== newStatusProd || lastEntry.rastreio !== newRastreio;

        if (statusChanged) {
          await sbTrack.from("pedido_status_history").insert({
            pedido_fornecedor_id: pfId,
            status: newStatus,
            status_producao: newStatusProd,
            rastreio: newRastreio,
            observacao: null,
          });

          // Update pedidos_fornecedor.status
          await sbTrack.from("pedidos_fornecedor").update({ status: newStatus }).eq("id", pfId);
          console.log(`[hoya-proxy] [${correlationId}] Tracking updated for pedido ${numeroPedido}: ${newStatus}`);

          // Auto-create alert for negative statuses
          if (pfCodEmpresa && isNegativeStatus(newStatus)) {
            await sbTrack.from("pedido_alertas").upsert({
              pedido_fornecedor_id: pfId,
              cod_empresa: pfCodEmpresa,
              status_detectado: newStatus,
              acknowledged: false,
            }, { onConflict: "pedido_fornecedor_id" });
            console.log(`[hoya-proxy] [${correlationId}] Alert created for pedido ${numeroPedido}: ${newStatus}`);
          }
        } else {
          console.log(`[hoya-proxy] [${correlationId}] Tracking unchanged for pedido ${numeroPedido}`);
        }

        // Return full timeline
        const { data: timeline } = await sbTrack
          .from("pedido_status_history")
          .select("*")
          .eq("pedido_fornecedor_id", pfId)
          .order("checked_at", { ascending: true });

        return new Response(JSON.stringify({ tracking: trackData, timeline: timeline || [], statusChanged, saved: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId },
        });
      }

      // F4.5: Batch tracking update (for cron)
      case "atualizar-tracking-batch": {
        const sbBatch = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const batchLimit = params.limit || 20;

        const { data: pendingPedidos } = await sbBatch
          .from("pedidos_fornecedor")
          .select("id, numero_pedido, cod_empresa")
          .eq("fornecedor", "HOYA")
          .not("numero_pedido", "is", null)
          .not("status", "in", '("Entregue","Cancelado","ERRO")')
          .order("updated_at", { ascending: true })
          .limit(batchLimit);

        if (!pendingPedidos || pendingPedidos.length === 0) {
          return new Response(JSON.stringify({ updated: 0, message: "Nenhum pedido pendente para tracking" }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId },
          });
        }

        let updatedCount = 0;
        const errors: string[] = [];

        for (const ped of pendingPedidos) {
          try {
            const tUrl = `${HOYA_BASE_URL}/pedido/tracking/${ped.numero_pedido}`;
            const tResp = await fetchWithRetry(
              tUrl,
              { method: "GET", headers: { "x-api-key": HOYA_API_KEY, "Content-Type": "application/json" } },
              { action: `batch-tracking-${ped.numero_pedido}`, correlationId, maxRetries: 1 }
            );

            if (!tResp.ok) continue;

            const tData = await tResp.json();
            const tStatus = String(tData.status || "Desconhecido");
            const tStatusProd = tData.statusProducao ? String(tData.statusProducao) : null;
            const tRastreio = tData.rastreio ? String(tData.rastreio) : null;

            const { data: lastE } = await sbBatch
              .from("pedido_status_history")
              .select("status, status_producao, rastreio")
              .eq("pedido_fornecedor_id", ped.id)
              .order("checked_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (!lastE || lastE.status !== tStatus || lastE.status_producao !== tStatusProd || lastE.rastreio !== tRastreio) {
              await sbBatch.from("pedido_status_history").insert({
                pedido_fornecedor_id: ped.id,
                status: tStatus,
                status_producao: tStatusProd,
                rastreio: tRastreio,
              });
              await sbBatch.from("pedidos_fornecedor").update({ status: tStatus }).eq("id", ped.id);
              updatedCount++;

              // Auto-create alert for negative statuses
              if (ped.cod_empresa && isNegativeStatus(tStatus)) {
                await sbBatch.from("pedido_alertas").upsert({
                  pedido_fornecedor_id: ped.id,
                  cod_empresa: ped.cod_empresa,
                  status_detectado: tStatus,
                  acknowledged: false,
                }, { onConflict: "pedido_fornecedor_id" });
                console.log(`[hoya-proxy] [${correlationId}] Batch alert created for pedido ${ped.numero_pedido}: ${tStatus}`);
              }
            }
          } catch (e) {
            errors.push(`${ped.numero_pedido}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }

        console.log(`[hoya-proxy] [${correlationId}] Batch tracking: ${updatedCount}/${pendingPedidos.length} updated, ${errors.length} errors`);
        return new Response(JSON.stringify({ updated: updatedCount, total: pendingPedidos.length, errors }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId },
        });
      }

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

      // F4.5: Timeline for a pedido
      case "timeline-pedido": {
        const sbTl = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const { data: tlData } = await sbTl
          .from("pedido_status_history")
          .select("*")
          .eq("pedido_fornecedor_id", params.pedidoFornecedorId)
          .order("checked_at", { ascending: true });

        return new Response(JSON.stringify(tlData || []), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId },
        });
      }

      // F4.6: Consultar XML da nota fiscal (usa chave DANFE, não número do pedido)
      // Endpoint Hoya: GET /pedido/xml/{chaveDanfe}
      case "consultar-xml": {
        // Aceita chaveDanfe diretamente OU numeroPedido (nesse caso, busca tracking para extrair a chave)
        let chaveDanfe = params.chaveDanfe as string | undefined;

        if (!chaveDanfe && params.numeroPedido) {
          // Busca tracking para extrair chave NF automaticamente
          console.log(`[hoya-proxy] [${correlationId}] consultar-xml: buscando tracking para extrair chave NF do pedido ${params.numeroPedido}`);
          const trackUrlXml = `${HOYA_BASE_URL}/pedido/tracking/${params.numeroPedido}`;
          try {
            const trackRespXml = await fetchWithRetry(
              trackUrlXml,
              { method: "GET", headers: { "x-api-key": HOYA_API_KEY, "Content-Type": "application/json" } },
              { action: "consultar-xml-tracking-lookup", correlationId }
            );
            if (trackRespXml.ok) {
              const trackDataXml = await trackRespXml.json();
              const nfArr = trackDataXml?.nf || trackDataXml?.NF || [];
              if (Array.isArray(nfArr) && nfArr.length > 0) {
                // NF pode ter campo 'danfe', 'chaveDanfe', 'chave', ou 'chaveNfe'
                const nf0 = nfArr[0];
                chaveDanfe = nf0.danfe || nf0.chaveDanfe || nf0.chave || nf0.chaveNfe || nf0.chaveAcesso || null;
                console.log(`[hoya-proxy] [${correlationId}] Chave DANFE extraída do tracking: ${chaveDanfe}`);
              }
            }
          } catch (e) {
            console.warn(`[hoya-proxy] [${correlationId}] Falha ao buscar tracking para chave NF:`, e);
          }
        }

        if (!chaveDanfe) {
          return new Response(JSON.stringify({ 
            error: "Chave DANFE não encontrada. O pedido pode não ter sido faturado ainda.", 
            code: HOYA_ERROR_CODES.API_ERROR, 
            correlationId 
          }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId },
          });
        }

        const xmlUrl = `${HOYA_BASE_URL}/pedido/xml/${chaveDanfe}`;
        const xmlResp = await fetchWithRetry(
          xmlUrl,
          { method: "GET", headers: { "x-api-key": HOYA_API_KEY, "Content-Type": "application/json" } },
          { action: "consultar-xml", correlationId }
        );
        const xmlText = await xmlResp.text();
        if (!xmlResp.ok) {
          return new Response(JSON.stringify({ error: "Erro ao consultar XML", details: xmlText, code: HOYA_ERROR_CODES.API_ERROR, correlationId }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId },
          });
        }
        // Return XML content — could be raw XML or JSON wrapper
        let xmlData: unknown;
        try { xmlData = JSON.parse(xmlText); } catch { xmlData = { xml: xmlText }; }
        return new Response(JSON.stringify(xmlData), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId },
        });
      }

      // F4.6: Consultar DANFE — reutiliza o endpoint XML com a chave DANFE
      // A API Hoya não tem endpoint separado para DANFE; o XML é o documento fiscal
      case "consultar-danfe": {
        let chaveDanfePdf = params.chaveDanfe as string | undefined;

        if (!chaveDanfePdf && params.numeroPedido) {
          console.log(`[hoya-proxy] [${correlationId}] consultar-danfe: buscando tracking para extrair chave NF do pedido ${params.numeroPedido}`);
          const trackUrlDanfe = `${HOYA_BASE_URL}/pedido/tracking/${params.numeroPedido}`;
          try {
            const trackRespDanfe = await fetchWithRetry(
              trackUrlDanfe,
              { method: "GET", headers: { "x-api-key": HOYA_API_KEY, "Content-Type": "application/json" } },
              { action: "consultar-danfe-tracking-lookup", correlationId }
            );
            if (trackRespDanfe.ok) {
              const trackDataDanfe = await trackRespDanfe.json();
              const nfArrD = trackDataDanfe?.nf || trackDataDanfe?.NF || [];
              if (Array.isArray(nfArrD) && nfArrD.length > 0) {
                const nf0d = nfArrD[0];
                chaveDanfePdf = nf0d.danfe || nf0d.chaveDanfe || nf0d.chave || nf0d.chaveNfe || nf0d.chaveAcesso || null;
                console.log(`[hoya-proxy] [${correlationId}] Chave DANFE extraída: ${chaveDanfePdf}`);
              }
            }
          } catch (e) {
            console.warn(`[hoya-proxy] [${correlationId}] Falha ao buscar tracking para chave NF:`, e);
          }
        }

        if (!chaveDanfePdf) {
          return new Response(JSON.stringify({ 
            error: "Chave DANFE não encontrada. O pedido pode não ter sido faturado ainda.", 
            code: HOYA_ERROR_CODES.API_ERROR, 
            correlationId 
          }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId },
          });
        }

        // Usa o mesmo endpoint XML — retorna o XML da NF-e
        const danfeUrl = `${HOYA_BASE_URL}/pedido/xml/${chaveDanfePdf}`;
        const danfeResp = await fetchWithRetry(
          danfeUrl,
          { method: "GET", headers: { "x-api-key": HOYA_API_KEY, "Content-Type": "application/json" } },
          { action: "consultar-danfe", correlationId }
        );
        const danfeText = await danfeResp.text();
        if (!danfeResp.ok) {
          return new Response(JSON.stringify({ error: "Erro ao consultar DANFE", details: danfeText, code: HOYA_ERROR_CODES.API_ERROR, correlationId }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId },
          });
        }
        let danfeData: unknown;
        try { danfeData = JSON.parse(danfeText); } catch { danfeData = { danfe: danfeText }; }
        return new Response(JSON.stringify(danfeData), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId },
        });
      }

      case "consultar-condicoes-pagamento": {
        // The payment conditions endpoint uses /servicos/ path, not /api/customer/
        const baseOrigin = new URL(HOYA_BASE_URL).origin;
        const condUrl = `${baseOrigin}/servicos/pedido/consultar-condicoes-pagamento`;
        const condResp = await fetchWithRetry(
          condUrl,
          { method: "GET", headers: { "x-api-key": HOYA_API_KEY, "Content-Type": "application/json" } },
          { action: "consultar-condicoes-pagamento", correlationId }
        );
        const condText = await condResp.text();
        let condData: unknown;
        try { condData = JSON.parse(condText); } catch { condData = { rawResponse: condText }; }
        return new Response(JSON.stringify(condData), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId },
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
