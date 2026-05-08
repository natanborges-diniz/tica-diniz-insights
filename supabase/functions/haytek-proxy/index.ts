// supabase/functions/haytek-proxy/index.ts
// Proxy seguro para API Haytek (Dmax)
// Auth: Bearer Token via fornecedor_configuracao

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authGuard, corsHeaders } from "../_shared/authGuard.ts";

// API path varies by environment:
// - staging: /external/api/v1/haytek-public/orders/...
// - production (dev.haytek.com.br): /orders/... (basePath = "/")

const HAYTEK_ERROR_CODES = {
  TIMEOUT: "HAYTEK_TIMEOUT",
  UNAVAILABLE: "HAYTEK_UNAVAILABLE",
  API_ERROR: "HAYTEK_API_ERROR",
  CONFIG_ERROR: "HAYTEK_CONFIG_ERROR",
} as const;

function generateCorrelationId(): string {
  return crypto.randomUUID().slice(0, 8);
}

interface HaytekGlobalConfig {
  baseUrl: string;
  ambiente: string;
  apiKey: string | null;
  apiPath: string;
}

async function loadHaytekGlobalConfig(sb: ReturnType<typeof createClient>): Promise<HaytekGlobalConfig> {
  try {
    const { data } = await sb
      .from("fornecedor_configuracao")
      .select("ambiente, base_url_staging, base_url_production, api_key_staging, api_key_production")
      .eq("fornecedor", "HAYTEK")
      .eq("ativo", true)
      .maybeSingle();

    if (data) {
      const ambiente = data.ambiente || "staging";
      const isProd = ambiente === "production";
      const baseUrl = isProd
        ? (data.base_url_production || "https://dev.haytek.com.br")
        : (data.base_url_staging || "https://stg-api.haytek.com.br");
      const rawKey = isProd ? data.api_key_production : data.api_key_staging;
      const apiKey = rawKey ? String(rawKey).replace(/\s+/g, "") : null;
      const apiPath = isProd ? "" : "/external/api/v1/haytek-public";
      return { baseUrl, ambiente, apiKey, apiPath };
    }
  } catch (e) {
    console.warn("[haytek-proxy] Could not load global DB config:", e);
  }
  return {
    baseUrl: "https://stg-api.haytek.com.br",
    ambiente: "staging",
    apiKey: null,
    apiPath: "/external/api/v1/haytek-public",
  };
}

interface HaytekStoreConfig {
  storeId: string;
  addressId: string | null;
  alias: string | null;
}

async function loadStoreConfig(sb: ReturnType<typeof createClient>, codEmpresa: number): Promise<HaytekStoreConfig | null> {
  const { data } = await sb
    .from("haytek_empresa_config")
    .select("store_id, address_id, alias")
    .eq("cod_empresa", codEmpresa)
    .eq("ativo", true)
    .maybeSingle();

  if (data?.store_id) {
    return {
      storeId: data.store_id,
      addressId: data.address_id || null,
      alias: data.alias || null,
    };
  }
  return null;
}

async function fetchHaytek(url: string, options: RequestInit, correlationId: string, action: string, apiKey?: string | null): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  const start = Date.now();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
    const masked = apiKey.length > 15 ? `${apiKey.slice(0, 10)}...${apiKey.slice(-5)}` : "***";
    console.log(`[haytek-proxy] [${correlationId}] Token (masked): ${masked}`);
  }

  try {
    const resp = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timer);
    console.log(`[haytek-proxy] [${correlationId}] ${action} -> ${resp.status} (${Date.now() - start}ms)`);
    return resp;
  } catch (err) {
    clearTimeout(timer);
    const isTimeout = err instanceof DOMException && err.name === "AbortError";
    throw {
      code: isTimeout ? HAYTEK_ERROR_CODES.TIMEOUT : HAYTEK_ERROR_CODES.UNAVAILABLE,
      message: isTimeout ? "API Haytek não respondeu em 20s" : `Erro de rede: ${err}`,
      correlationId,
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const correlationId = generateCorrelationId();

  try {
    const body = await req.json();
    const { action, ...params } = body;

    const user = await authGuard(req, { requiredRole: "authenticated" });
    const sbService = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const globalConfig = await loadHaytekGlobalConfig(sbService);
    const BASE_URL = globalConfig.baseUrl;
    const activeApiKey: string | null = globalConfig.apiKey;
    const activeAmbiente: string = globalConfig.ambiente;
    const apiPath: string = globalConfig.apiPath;

    const tokenPrefix = activeApiKey ? `${activeApiKey.slice(0, 10)}…` : "(vazio)";
    const tokenLen = activeApiKey ? activeApiKey.length : 0;
    console.log(`[haytek-proxy] [${correlationId}] Action: ${action} | Env: ${activeAmbiente} | Base: ${BASE_URL}${apiPath} | TokenSource: fornecedor_configuracao.api_key_${activeAmbiente} | TokenPrefix: ${tokenPrefix} | Len: ${tokenLen} | User: ${user.userId}`);

    if (!activeApiKey) {
      return new Response(JSON.stringify({
        error: `Token Haytek (${activeAmbiente}) não configurado. Configure em Admin > Fornecedores.`,
        code: HAYTEK_ERROR_CODES.CONFIG_ERROR,
        correlationId,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    switch (action) {
      // ── Ping Auth (valida token sem criar pedido) ──
      case "ping-auth": {
        const url = `${BASE_URL}${apiPath}/orders/PING-${correlationId}`;
        console.log(`[haytek-proxy] [${correlationId}] ping-auth URL: ${url}`);
        const resp = await fetchHaytek(url, { method: "GET" }, correlationId, "ping-auth", activeApiKey);
        const respText = await resp.text();
        const ok = resp.status === 200 || resp.status === 404; // 404 = token aceito mas pedido inexistente
        return new Response(JSON.stringify({
          ok,
          status: resp.status,
          ambiente: activeAmbiente,
          baseUrl: BASE_URL,
          apiPath,
          tokenPrefix,
          tokenLen,
          message: ok
            ? "Token Haytek aceito pela API."
            : resp.status === 401
              ? "Token Haytek de produção não reconhecido pela API. Atualize a chave em Admin > Fornecedores > Haytek."
              : resp.status === 403
                ? "Token aceito, mas sem permissão para este recurso (verifique provisão da loja na HiTech)."
                : `Resposta inesperada da Haytek: ${respText.substring(0, 300)}`,
          raw: respText.substring(0, 500),
        }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId },
        });
      }


      case "criar-pedido": {
        const codEmpresa = Number(params.codEmpresa);
        const codOs = Number(params.codOs);
        const store = await loadStoreConfig(sbService, codEmpresa);
        if (!store) {
          return new Response(JSON.stringify({ error: "Loja não configurada para Haytek", code: HAYTEK_ERROR_CODES.CONFIG_ERROR, correlationId }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        console.log(`[haytek-proxy] [${correlationId}] Loja ${codEmpresa} (${store.storeId})`);
        const pedidoPayload = params.pedido || {};
        pedidoPayload.storeId = store.storeId;
        if (store.alias) {
          pedidoPayload.storeName = store.alias;
        }
        if (store.addressId) {
          pedidoPayload.addressId = store.addressId;
        }

        // Idempotency
        const payloadStr = JSON.stringify(pedidoPayload);
        const payloadHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payloadStr));
        const hashHex = Array.from(new Uint8Array(payloadHash)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
        const idempotencyKey = `HAYTEK_${codEmpresa}_${codOs}_${activeAmbiente}_${hashHex}`;

        const { data: existing } = await sbService
          .from("pedidos_fornecedor")
          .select("*")
          .eq("idempotency_key", idempotencyKey)
          .neq("status", "ERRO")
          .maybeSingle();

        if (existing) {
          return new Response(JSON.stringify({
            orderId: existing.numero_pedido,
            status: existing.status,
            idempotencyHit: true,
            message: "Pedido já enviado para esta OS/empresa/ambiente.",
          }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const url = `${BASE_URL}${apiPath}/orders/lab`;
        console.log(`[haytek-proxy] [${correlationId}] criar-pedido URL: ${url}`);
        console.log(`[haytek-proxy] [${correlationId}] criar-pedido BODY: ${payloadStr.substring(0, 2000)}`);

        const resp = await fetchHaytek(url, {
          method: "POST",
          body: payloadStr,
        }, correlationId, "criar-pedido", activeApiKey);

        const respText = await resp.text();
        let respData: Record<string, unknown>;
        try { respData = JSON.parse(respText); } catch { respData = { rawResponse: respText }; }

        if (resp.status >= 400) {
          console.error(`[haytek-proxy] [${correlationId}] criar-pedido RESPONSE (${resp.status}): ${respText.substring(0, 1000)}`);
          
          await sbService.from("pedidos_fornecedor").insert({
            cod_os: codOs,
            cod_empresa: codEmpresa,
            fornecedor: "HAYTEK",
            status: "ERRO",
            payload: pedidoPayload,
            response: respData,
            requested_by: user.userId,
            hoya_environment: activeAmbiente,
            idempotency_key: idempotencyKey,
          });

          return new Response(JSON.stringify({
            error: resp.status === 401
              ? "Token Haytek de produção não reconhecido pela API. Atualize a chave em Admin > Fornecedores > Haytek."
              : (respData.message || respData.rawResponse || `HTTP ${resp.status}`),
            code: HAYTEK_ERROR_CODES.API_ERROR,
            correlationId,
            raw: respData,
          }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const orderId = (respData as any)?.orderId || (respData as any)?.id || null;

        await sbService.from("pedidos_fornecedor").insert({
          cod_os: codOs,
          cod_empresa: codEmpresa,
          fornecedor: "HAYTEK",
          numero_pedido: orderId ? String(orderId) : null,
          status: orderId ? "CONFIRMADO" : "PENDENTE",
          payload: pedidoPayload,
          response: respData,
          requested_by: user.userId,
          hoya_environment: activeAmbiente,
          idempotency_key: idempotencyKey,
        });

        return new Response(JSON.stringify({
          orderId: orderId ? String(orderId) : null,
          status: orderId ? "CONFIRMADO" : "PENDENTE",
          raw: respData,
        }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId },
        });
      }

      // ── Consultar Pedido ──
      case "consultar-pedido": {
        const orderId = params.orderId;
        if (!orderId) {
          return new Response(JSON.stringify({ error: "orderId obrigatório" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const url = `${BASE_URL}${apiPath}/orders/${orderId}`;
        const resp = await fetchHaytek(url, { method: "GET" }, correlationId, "consultar-pedido", activeApiKey);
        const data = await resp.json();

        if (resp.status >= 400) {
          return new Response(JSON.stringify({ error: data.message || `HTTP ${resp.status}`, code: HAYTEK_ERROR_CODES.API_ERROR, correlationId }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify(data), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId },
        });
      }

      // ── Atualizar Tracking ──
      case "atualizar-tracking": {
        const orderId = params.orderId;
        const pedidoFornecedorId = params.pedidoFornecedorId;
        const codEmpresa = Number(params.codEmpresa);

        if (!orderId) {
          return new Response(JSON.stringify({ error: "orderId obrigatório" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const url = `${BASE_URL}${apiPath}/orders/${orderId}`;
        const resp = await fetchHaytek(url, { method: "GET" }, correlationId, "atualizar-tracking", activeApiKey);
        const data = await resp.json();

        if (resp.status >= 400) {
          return new Response(JSON.stringify({ error: data.message || `HTTP ${resp.status}`, code: HAYTEK_ERROR_CODES.API_ERROR, correlationId }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const newStatus = data.status || data.orderStatus || "Desconhecido";

        // Find pedido_fornecedor
        let pfId = pedidoFornecedorId;
        if (!pfId) {
          const { data: pfRec } = await sbService
            .from("pedidos_fornecedor")
            .select("id")
            .eq("numero_pedido", String(orderId))
            .eq("fornecedor", "HAYTEK")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          pfId = pfRec?.id;
        }

        if (!pfId) {
          return new Response(JSON.stringify({ tracking: data, saved: false, reason: "pedido_fornecedor não encontrado" }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Check for status change
        const { data: lastEntry } = await sbService
          .from("pedido_status_history")
          .select("status")
          .eq("pedido_fornecedor_id", pfId)
          .order("checked_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const statusChanged = !lastEntry || lastEntry.status !== newStatus;

        if (statusChanged) {
          await sbService.from("pedido_status_history").insert({
            pedido_fornecedor_id: pfId,
            status: newStatus,
          });
          await sbService.from("pedidos_fornecedor").update({ status: newStatus }).eq("id", pfId);

          // Alert on negative statuses
          const negativePatterns = ["cancel", "erro", "recusad", "reject"];
          const isNeg = negativePatterns.some(p => newStatus.toLowerCase().includes(p));
          if (isNeg && codEmpresa) {
            await sbService.from("pedido_alertas").upsert({
              pedido_fornecedor_id: pfId,
              cod_empresa: codEmpresa,
              status_detectado: newStatus,
              acknowledged: false,
            }, { onConflict: "pedido_fornecedor_id" });
          }
        }

        const { data: timeline } = await sbService
          .from("pedido_status_history")
          .select("*")
          .eq("pedido_fornecedor_id", pfId)
          .order("checked_at", { ascending: true });

        return new Response(JSON.stringify({ tracking: data, timeline: timeline || [], statusChanged, saved: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Correlation-Id": correlationId },
        });
      }

      // ── Histórico de Pedidos ──
      case "historico-pedidos": {
        let query = sbService.from("pedidos_fornecedor")
          .select("*")
          .eq("fornecedor", "HAYTEK")
          .order("created_at", { ascending: false })
          .limit(params.limit || 50);

        if (params.codEmpresa && params.codEmpresa !== "ALL") {
          query = query.eq("cod_empresa", Number(params.codEmpresa));
        }

        const { data: pedidos, error: dbErr } = await query;
        if (dbErr) throw new Error(dbErr.message);

        return new Response(JSON.stringify(pedidos || []), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Timeline ──
      case "timeline-pedido": {
        const { data: tlData } = await sbService
          .from("pedido_status_history")
          .select("*")
          .eq("pedido_fornecedor_id", params.pedidoFornecedorId)
          .order("checked_at", { ascending: true });

        return new Response(JSON.stringify(tlData || []), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: `Ação desconhecida: ${action}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (err) {
    const isStructured = typeof err === "object" && err !== null && "code" in err;
    if (isStructured) {
      return new Response(JSON.stringify(err), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (err instanceof Response) return err;

    console.error(`[haytek-proxy] [${correlationId}] Unhandled error:`, err);
    return new Response(JSON.stringify({
      error: String(err),
      code: HAYTEK_ERROR_CODES.UNAVAILABLE,
      correlationId,
    }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
