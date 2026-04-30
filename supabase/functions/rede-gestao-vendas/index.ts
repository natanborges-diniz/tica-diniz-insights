import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SANDBOX_BASE_URL = "https://rl7-sandbox-api.useredecloud.com.br";
// Base de produção oficial da API Gestão de Vendas conforme portal do desenvolvedor REDE
const PRODUCTION_BASE_URL = "https://api.userede.com.br/redelabs";

// Token cache (in-memory, per function instance)
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getOAuthToken(baseUrl: string): Promise<string> {
  // Check cache
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const clientId = Deno.env.get("REDE_GV_CLIENT_ID");
  const clientSecret = Deno.env.get("REDE_GV_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new Error("REDE_GV_CLIENT_ID ou REDE_GV_CLIENT_SECRET não configurados");
  }

  const tokenUrl = `${baseUrl}/oauth2/token`;
  console.log(`[rede-gv] Requesting OAuth token from ${tokenUrl}`);

  // Retry com backoff para absorver 5xx transitórios do gateway Akamai da REDE
  const MAX_ATTEMPTS = 3;
  const BACKOFF_MS = [0, 1500, 3500];
  let lastStatus = 0;
  let lastText = "";

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (BACKOFF_MS[attempt] > 0) {
      console.log(`[rede-gv] Retry ${attempt}/${MAX_ATTEMPTS - 1} after ${BACKOFF_MS[attempt]}ms (last status ${lastStatus})`);
      await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
    }

    let res: Response;
    try {
      res = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Basic " + btoa(`${clientId}:${clientSecret}`),
        },
        body: "grant_type=client_credentials",
      });
    } catch (netErr) {
      lastStatus = 0;
      lastText = `network error: ${(netErr as Error).message}`;
      console.error(`[rede-gv] Token network error attempt ${attempt + 1}:`, lastText);
      continue;
    }

    const text = await res.text();
    if (res.ok) {
      const data = JSON.parse(text);
      const token = data.access_token;
      const expiresIn = data.expires_in || 3600;
      cachedToken = { token, expiresAt: Date.now() + expiresIn * 1000 };
      console.log(`[rede-gv] Token obtained on attempt ${attempt + 1}, expires in ${expiresIn}s`);
      return token;
    }

    lastStatus = res.status;
    lastText = text;
    console.error(`[rede-gv] Token error ${res.status} attempt ${attempt + 1}:`, text.slice(0, 300));

    // Só faz retry em 5xx ou 429. 4xx (credencial inválida) falha imediatamente.
    if (res.status < 500 && res.status !== 429) {
      break;
    }
  }

  const err = new Error(`Falha ao obter token OAuth: ${lastStatus} ${lastText.slice(0, 200)}`) as Error & { code?: string; status?: number; retryable?: boolean };
  err.code = lastStatus >= 500 || lastStatus === 429 || lastStatus === 0 ? "GV_TOKEN_TEMPORARY_UNAVAILABLE" : "GV_TOKEN_ERROR";
  err.status = lastStatus;
  err.retryable = lastStatus >= 500 || lastStatus === 429 || lastStatus === 0;
  throw err;
}

function tokenHealthFailure(err: Error & { code?: string; status?: number; retryable?: boolean }, baseUrl: string) {
  const isTemporary = err.retryable || err.code === "GV_TOKEN_TEMPORARY_UNAVAILABLE";
  return {
    ok: false,
    status: isTemporary ? "REDE_INDISPONIVEL" : "ERRO_TOKEN",
    ambiente: baseUrl.includes("sandbox") ? "sandbox" : "production",
    error: isTemporary
      ? "A REDE retornou indisponibilidade temporária ao emitir o token OAuth. Tente validar novamente em alguns minutos."
      : err.message,
    error_code: err.code || "GV_TOKEN_ERROR",
    http_status: err.status,
    retryable: isTemporary,
  };
}


// Classifica erros operacionais comuns da REDE em produção
function classifyApiError(status: number, text: string): { code: string; message: string } {
  const lower = text.toLowerCase();
  if (status === 401 || status === 403) {
    if (lower.includes("opt") || lower.includes("consent") || lower.includes("authorization") || lower.includes("not shared") || lower.includes("compartilh")) {
      return {
        code: "GV_OPTIN_PENDING",
        message: "Acesso aguardando aceite no portal da REDE (Opt-in não aprovado para o PV).",
      };
    }
    return {
      code: "GV_INVALID_CREDENTIALS",
      message: "Credenciais inválidas ou sem permissão para o PV consultado.",
    };
  }
  if (status === 404) {
    return { code: "GV_PV_NOT_FOUND", message: "PV não encontrado ou sem vínculo com a credencial." };
  }
  if (status === 429) {
    return { code: "GV_RATE_LIMITED", message: "Limite de requisições excedido na API REDE." };
  }
  return {
    code: "GV_API_ERROR",
    message: `Rede Gestão Vendas API ${status}: ${text.slice(0, 300)}`,
  };
}

async function apiRequest(
  baseUrl: string,
  path: string,
  token: string,
  params?: Record<string, string>
): Promise<unknown> {
  const qs = new URLSearchParams(params || {});
  const qsStr = qs.toString();
  const url = `${baseUrl}${path}${qsStr ? "?" + qsStr : ""}`;

  console.log(`[rede-gv] GET ${url}`);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });

  const text = await res.text();
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }

  if (!res.ok) {
    console.error(`[rede-gv] API ${res.status}:`, text.slice(0, 500));
    const classified = classifyApiError(res.status, text);
    const err = new Error(classified.message) as Error & { code?: string; status?: number };
    err.code = classified.code;
    err.status = res.status;
    throw err;
  }

  return parsed;
}

function resolveBaseUrl(ambiente?: string): string {
  return ambiente === "production" ? PRODUCTION_BASE_URL : SANDBOX_BASE_URL;
}

// Em sandbox, a documentação manda omitir `subsidiaries`.
// Em produção, só envia se foi passado explicitamente.
function applySubsidiariesPolicy(
  qp: Record<string, string>,
  ambiente: string | undefined,
  subsidiaries?: string,
) {
  const isSandbox = ambiente !== "production";
  if (isSandbox) {
    delete qp.subsidiaries;
    return;
  }
  if (subsidiaries && subsidiaries.trim().length > 0) {
    qp.subsidiaries = subsidiaries;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, ambiente, ...params } = body;

    if (!action) throw new Error("action é obrigatório");

    const baseUrl = resolveBaseUrl(ambiente);
    let token = "";
    try {
      token = await getOAuthToken(baseUrl);
    } catch (tokenErr) {
      if (action === "health") {
        return new Response(JSON.stringify(tokenHealthFailure(tokenErr as Error & { code?: string; status?: number; retryable?: boolean }, baseUrl)), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw tokenErr;
    }

    let result: unknown;

    switch (action) {
      case "consultar_vendas": {
        if (!params.parentCompanyNumber) throw new Error("parentCompanyNumber é obrigatório");
        if (!params.startDate) throw new Error("startDate é obrigatório (YYYY-MM-DD)");
        if (!params.endDate) throw new Error("endDate é obrigatório (YYYY-MM-DD)");

        const qp: Record<string, string> = {
          parentCompanyNumber: params.parentCompanyNumber,
          startDate: params.startDate,
          endDate: params.endDate,
        };
        applySubsidiariesPolicy(qp, ambiente, params.subsidiaries);
        if (params.brands) qp.brands = params.brands;
        if (params.modalities) qp.modalities = params.modalities;
        if (params.status) qp.status = params.status;
        if (params.size) qp.size = String(params.size);
        if (params.page) qp.page = String(params.page);

        result = await apiRequest(baseUrl, "/merchant-statement/v1/sales", token, qp);
        break;
      }

      case "consultar_vendas_diarias": {
        if (!params.nsu) throw new Error("nsu é obrigatório");
        if (!params.startDate) throw new Error("startDate é obrigatório");
        if (!params.endDate) throw new Error("endDate é obrigatório");

        result = await apiRequest(
          baseUrl,
          `/merchant-statement/v1/sales/${params.nsu}/daily`,
          token,
          { startDate: params.startDate, endDate: params.endDate }
        );
        break;
      }

      case "consultar_parcelas": {
        if (!params.parentCompanyNumber) throw new Error("parentCompanyNumber é obrigatório");
        if (!params.startDate) throw new Error("startDate é obrigatório");
        if (!params.endDate) throw new Error("endDate é obrigatório");

        const qp: Record<string, string> = {
          parentCompanyNumber: params.parentCompanyNumber,
          startDate: params.startDate,
          endDate: params.endDate,
        };
        applySubsidiariesPolicy(qp, ambiente, params.subsidiaries);
        if (params.size) qp.size = String(params.size);
        if (params.page) qp.page = String(params.page);

        result = await apiRequest(baseUrl, "/merchant-statement/v1/sales/installments", token, qp);
        break;
      }

      case "consultar_pagamentos": {
        if (!params.parentCompanyNumber) throw new Error("parentCompanyNumber é obrigatório");
        if (!params.startDate) throw new Error("startDate é obrigatório");
        if (!params.endDate) throw new Error("endDate é obrigatório");

        const qp: Record<string, string> = {
          parentCompanyNumber: params.parentCompanyNumber,
          startDate: params.startDate,
          endDate: params.endDate,
        };
        applySubsidiariesPolicy(qp, ambiente, params.subsidiaries);
        if (params.brands) qp.brands = params.brands;
        if (params.status) qp.status = params.status;
        if (params.types) qp.types = params.types;
        if (params.size) qp.size = String(params.size);
        if (params.page) qp.page = String(params.page);

        result = await apiRequest(baseUrl, "/merchant-statement/v1/payments", token, qp);
        break;
      }

      case "consultar_pagamentos_oc": {
        if (!params.parentCompanyNumber) throw new Error("parentCompanyNumber é obrigatório");
        if (!params.startDate) throw new Error("startDate é obrigatório");
        if (!params.endDate) throw new Error("endDate é obrigatório");

        const qp: Record<string, string> = {
          parentCompanyNumber: params.parentCompanyNumber,
          startDate: params.startDate,
          endDate: params.endDate,
        };
        applySubsidiariesPolicy(qp, ambiente, params.subsidiaries);
        if (params.size) qp.size = String(params.size);
        if (params.page) qp.page = String(params.page);

        result = await apiRequest(baseUrl, "/merchant-statement/v1/payments/credit-orders", token, qp);
        break;
      }

      case "consultar_debitos": {
        if (!params.parentCompanyNumber) throw new Error("parentCompanyNumber é obrigatório");
        if (!params.startDate) throw new Error("startDate é obrigatório");
        if (!params.endDate) throw new Error("endDate é obrigatório");

        const qp: Record<string, string> = {
          parentCompanyNumber: params.parentCompanyNumber,
          startDate: params.startDate,
          endDate: params.endDate,
        };
        applySubsidiariesPolicy(qp, ambiente, params.subsidiaries);
        if (params.size) qp.size = String(params.size);

        result = await apiRequest(baseUrl, "/merchant-statement/v1/charges", token, qp);
        break;
      }

      case "consultar_tipos_ajuste": {
        result = await apiRequest(baseUrl, "/merchant-statement/v1/charges/adjustment-types", token);
        break;
      }

      case "health": {
        try {
          const testPv = params.parentCompanyNumber || "13381369";
          const today = new Date().toISOString().slice(0, 10);
          const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

          const qp: Record<string, string> = {
            parentCompanyNumber: testPv,
            startDate: weekAgo,
            endDate: today,
            size: "1",
          };
          applySubsidiariesPolicy(qp, ambiente, params.subsidiaries);

          await apiRequest(baseUrl, "/merchant-statement/v1/sales", token, qp);
          result = {
            ok: true,
            status: "ATIVA",
            ambiente: baseUrl.includes("sandbox") ? "sandbox" : "production",
          };
        } catch (e) {
          const err = e as Error & { code?: string; status?: number };
          result = {
            ok: false,
            status: err.code === "GV_OPTIN_PENDING" ? "AGUARDANDO_OPTIN" :
                    err.code === "GV_INVALID_CREDENTIALS" ? "CREDENCIAIS_INVALIDAS" :
                    "ERRO",
            error: err.message,
            error_code: err.code || "GV_API_ERROR",
            http_status: err.status,
          };
        }
        break;
      }

      default:
        throw new Error(
          `Action '${action}' não suportada. Use: consultar_vendas, consultar_vendas_diarias, consultar_parcelas, consultar_pagamentos, consultar_pagamentos_oc, consultar_debitos, consultar_tipos_ajuste, health`
        );
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[rede-gv] Error:", err);
    const e = err as Error & { code?: string; status?: number };
    return new Response(
      JSON.stringify({ error: e.message, error_code: e.code || "GV_INTERNAL", http_status: e.status }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
