// supabase/functions/haytek-proxy/index.ts
// Proxy seguro para API Haytek (Dmax)
// Auth: Bearer Token via fornecedor_configuracao

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authGuard, corsHeaders } from "../_shared/authGuard.ts";

const HAYTEK_ERROR_CODES = {
  TIMEOUT: "HAYTEK_TIMEOUT",
  UNAVAILABLE: "HAYTEK_UNAVAILABLE",
  API_ERROR: "HAYTEK_API_ERROR",
  CONFIG_ERROR: "HAYTEK_CONFIG_ERROR",
} as const;

function generateCorrelationId(): string {
  return crypto.randomUUID().slice(0, 8);
}

interface HaytekRuntimeConfig {
  baseUrl: string;
  ambiente: string;
  apiKey: string | null;
  apiUser: string | null;
}

async function loadHaytekConfig(sb: ReturnType<typeof createClient>): Promise<HaytekRuntimeConfig> {
  try {
    const { data } = await sb
      .from("fornecedor_configuracao")
      .select("ambiente, base_url_staging, base_url_production, api_key_staging, api_key_production, api_user_staging, api_user_production")
      .eq("fornecedor", "HAYTEK")
      .eq("ativo", true)
      .maybeSingle();

    if (data) {
      const isProduction = data.ambiente === "production";
      const baseUrl = isProduction
        ? (data.base_url_production || "https://api.haytek.com.br")
        : (data.base_url_staging || "https://dev.haytek.com.br");
      const rawKey = isProduction ? (data.api_key_production || null) : (data.api_key_staging || null);
      // Sanitize: remove whitespace/newlines that may have been saved accidentally
      const apiKey = rawKey ? rawKey.replace(/\s+/g, "") : null;
      const apiUser = isProduction ? (data.api_user_production || null) : (data.api_user_staging || null);
      return { baseUrl, ambiente: data.ambiente, apiKey, apiUser };
    }
  } catch (e) {
    console.warn("[haytek-proxy] Could not load DB config:", e);
  }
  return {
    baseUrl: "https://dev.haytek.com.br",
    ambiente: "staging",
    apiKey: null,
    apiUser: null,
  };
}

interface HaytekStoreConfig {
  storeId: string;
  addressId: string | null;
}

async function loadStoreConfig(sb: ReturnType<typeof createClient>, codEmpresa: number): Promise<HaytekStoreConfig | null> {
  const { data } = await sb
    .from("haytek_empresa_config")
    .select("store_id, address_id")
    .eq("cod_empresa", codEmpresa)
    .eq("ativo", true)
    .maybeSingle();

  if (data?.store_id) {
    return { storeId: data.store_id, addressId: data.address_id || null };
  }
  return null;
}

async function fetchHaytek(url: string, options: RequestInit, correlationId: string, action: string, apiKey?: string | null, apiUser?: string | null): Promise<Response> {
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
  if (apiUser) {
    headers["X-User"] = apiUser;
    console.log(`[haytek-proxy] [${correlationId}] X-User: ${apiUser}`);
  }

  try {
    const resp = await fetch(url, { ...options, headers, signal: controller.signal });
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
    const haytekConfig = await loadHaytekConfig(sbService);
    const BASE_URL = haytekConfig.baseUrl;

    console.log(`[haytek-proxy] [${correlationId}] Action: ${action} | Env: ${haytekConfig.ambiente} | User: ${user.userId}`);

    switch (action) {
      // ── Criar Pedido ──
      case "criar-pedido": {
        const codEmpresa = Number(params.codEmpresa);
        const codOs = Number(params.codOs);
        const store = await loadStoreConfig(sbService, codEmpresa);
        if (!store) {
          return new Response(JSON.stringify({ error: "Loja não configurada para Haytek", code: HAYTEK_ERROR_CODES.CONFIG_ERROR, correlationId }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const pedidoPayload = params.pedido || {};
        // Inject storeId
        pedidoPayload.storeId = store.storeId;
        if (store.addressId) {
          pedidoPayload.addressId = store.addressId;
        }

        // Idempotency
        const payloadStr = JSON.stringify(pedidoPayload);
        const payloadHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payloadStr));
        const hashHex = Array.from(new Uint8Array(payloadHash)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
        const idempotencyKey = `HAYTEK_${codEmpresa}_${codOs}_${haytekConfig.ambiente}_${hashHex}`;

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

        const url = `${BASE_URL}/orders/lab`;
        console.log(`[haytek-proxy] [${correlationId}] criar-pedido URL: ${url}`);
        console.log(`[haytek-proxy] [${correlationId}] criar-pedido BODY: ${payloadStr.substring(0, 2000)}`);

        const resp = await fetchHaytek(url, {
          method: "POST",
          body: payloadStr,
        }, correlationId, "criar-pedido", haytekConfig.apiKey, haytekConfig.apiUser);

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
            hoya_environment: haytekConfig.ambiente,
            idempotency_key: idempotencyKey,
          });

          return new Response(JSON.stringify({
            error: respData.message || respData.rawResponse || `HTTP ${resp.status}`,
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
          hoya_environment: haytekConfig.ambiente,
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

        const url = `${BASE_URL}/orders/${orderId}`;
        const resp = await fetchHaytek(url, { method: "GET" }, correlationId, "consultar-pedido", haytekConfig.apiKey);
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
