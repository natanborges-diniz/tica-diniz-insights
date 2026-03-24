import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REDE_SANDBOX_URL = "https://sandbox-erede.useredecloud.com.br";
const REDE_PRODUCTION_URL = "https://api.userede.com.br/erede";

interface AdquirenteConfig {
  id: string;
  cod_empresa: number;
  adquirente: string;
  ambiente: string;
  merchant_id: string | null;
  integration_key_encrypted: string | null;
  ativo: boolean;
}

async function getRedeCredentials(supabaseAdmin: ReturnType<typeof createClient>, codEmpresa: number): Promise<{ pv: string; key: string; baseUrl: string }> {
  const { data, error } = await supabaseAdmin
    .from("adquirentes_config")
    .select("*")
    .eq("cod_empresa", codEmpresa)
    .eq("adquirente", "REDE")
    .eq("ativo", true)
    .single();

  if (error || !data) throw new Error(`Nenhuma configuração Rede ativa para empresa ${codEmpresa}`);

  const config = data as AdquirenteConfig;
  if (!config.merchant_id) throw new Error("PV (Merchant ID) não configurado para Rede");
  if (!config.integration_key_encrypted) throw new Error("Chave de integração não configurada para Rede");

  const baseUrl = config.ambiente === "production" ? REDE_PRODUCTION_URL : REDE_SANDBOX_URL;
  return { pv: config.merchant_id, key: config.integration_key_encrypted, baseUrl };
}

function basicAuth(pv: string, key: string): string {
  return "Basic " + btoa(`${pv}:${key}`);
}

async function redeRequest(baseUrl: string, path: string, pv: string, key: string, method = "GET", body?: unknown) {
  const url = `${baseUrl}${path}`;
  console.log(`[rede-proxy] ${method} ${url}`);

  const headers: Record<string, string> = {
    Authorization: basicAuth(pv, key),
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const opts: RequestInit = { method, headers };
  if (body && method !== "GET") {
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(url, opts);
  const text = await res.text();

  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }

  if (!res.ok) {
    console.error(`[rede-proxy] ${res.status} response:`, text.slice(0, 500));
    throw new Error(`e.Rede API ${res.status}: ${text.slice(0, 300)}`);
  }

  return parsed;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, cod_empresa, ...params } = body;

    if (!action) throw new Error("action é obrigatório");
    if (!cod_empresa) throw new Error("cod_empresa é obrigatório");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { pv, key, baseUrl } = await getRedeCredentials(supabaseAdmin, cod_empresa);

    let result: unknown;

    switch (action) {
      case "consultar_transacoes": {
        // GET /v1/transactions?status=...&startDate=...&endDate=...
        const qs = new URLSearchParams();
        if (params.status) qs.set("status", params.status);
        if (params.start_date) qs.set("startDate", params.start_date);
        if (params.end_date) qs.set("endDate", params.end_date);
        if (params.page) qs.set("page", String(params.page));
        if (params.rows) qs.set("rows", String(params.rows));
        const qsStr = qs.toString();
        result = await redeRequest(baseUrl, `/v1/transactions${qsStr ? "?" + qsStr : ""}`, pv, key);
        break;
      }

      case "consultar_transacao": {
        // GET /v1/transactions/{tid}
        if (!params.tid) throw new Error("tid é obrigatório");
        result = await redeRequest(baseUrl, `/v1/transactions/${params.tid}`, pv, key);
        break;
      }

      case "criar_transacao": {
        // POST /v1/transactions
        if (!params.amount) throw new Error("amount é obrigatório");
        if (!params.reference) throw new Error("reference é obrigatório");

        const txBody: Record<string, unknown> = {
          kind: params.kind || "credit",
          reference: params.reference,
          amount: Math.round(params.amount * 100), // e.Rede usa centavos
          installments: params.installments || 1,
          capture: params.capture !== false, // default true
        };

        // For payment links / e-commerce
        if (params.softDescriptor) txBody.softDescriptor = params.softDescriptor;
        if (params.subscription !== undefined) txBody.subscription = params.subscription;

        // URLs for 3DS / redirect
        if (params.urls) txBody.urls = params.urls;

        // Antifraud
        if (params.antifraud) txBody.antifraud = params.antifraud;

        // Card data (for direct transactions, not links)
        if (params.cardNumber) {
          txBody.cardholderName = params.cardholderName;
          txBody.cardNumber = params.cardNumber;
          txBody.expirationMonth = params.expirationMonth;
          txBody.expirationYear = params.expirationYear;
          txBody.securityCode = params.securityCode;
        }

        result = await redeRequest(baseUrl, "/v1/transactions", pv, key, "POST", txBody);
        break;
      }

      case "cancelar_transacao": {
        // PUT /v1/transactions/{tid}/refunds/amount
        if (!params.tid) throw new Error("tid é obrigatório");
        if (!params.amount) throw new Error("amount é obrigatório");
        const cancelBody = { amount: Math.round(params.amount * 100) };
        result = await redeRequest(baseUrl, `/v1/transactions/${params.tid}/refunds/amount`, pv, key, "PUT", cancelBody);
        break;
      }

      case "health": {
        // Simple health check — try to query transactions
        try {
          await redeRequest(baseUrl, "/v1/transactions?rows=1", pv, key);
          result = { ok: true, ambiente: baseUrl.includes("sandbox") ? "sandbox" : "production" };
        } catch (e) {
          result = { ok: false, error: (e as Error).message };
        }
        break;
      }

      default:
        throw new Error(`Action '${action}' não suportada. Use: consultar_transacoes, consultar_transacao, criar_transacao, cancelar_transacao, health`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[rede-proxy] Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
