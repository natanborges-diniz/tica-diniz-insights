import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Edge function para Gestão de Acessos REDE.
 *
 * Conforme e-mail oficial da REDE (CNPJ matriz 12.107.885/0001-01), o fluxo
 * para ler vendas via Gestão de Vendas exige:
 *   1. Parceiro (nós) chamar a API de Gestão de Acessos para registrar
 *      a solicitação de acesso aos extratos do PV (opt-in).
 *   2. A loja dona do PV aceitar manualmente no portal da REDE
 *      (Minha Rede → PV → Conciliação → Compartilhar).
 *   3. Após o aceite, Gestão de Vendas devolve as transações.
 *
 * Documentação base: https://developer.userede.com.br/gestao-acessos
 *
 * Actions suportadas:
 *   - solicitar_compartilhamento: dispara a chamada REST real à REDE para 1 PV
 *   - solicitar_compartilhamento_lote: dispara para vários cod_empresa de uma vez
 *   - registrar_aceite: marca como APROVADO após confirmação manual
 *   - reset: limpa o status (em caso de retrabalho)
 *   - status: devolve o estado atual da ativação
 *
 * As credenciais são EXCLUSIVAS da API Gestão de Acessos (REDE_GA_CLIENT_ID/SECRET) —
 * a REDE emite um par OAuth distinto do Gestão de Vendas (confirmado por e-mail oficial).
 */

// OAuth token endpoint (Basic auth)
const SANDBOX_OAUTH_BASE = "https://rl7-sandbox-api.useredecloud.com.br";
const PRODUCTION_OAUTH_BASE = "https://api.userede.com.br/redelabs";

// API Access Management endpoint base (NOTE: produção NÃO usa o prefixo /redelabs aqui;
// caso contrário a rota cai no bucket de objetos estáticos da Akamai e devolve 405 XML)
const SANDBOX_API_BASE = "https://rl7-sandbox-api.useredecloud.com.br";
const PRODUCTION_API_BASE = "https://api.userede.com.br";

type Action =
  | "solicitar_compartilhamento"
  | "solicitar_compartilhamento_lote"
  | "registrar_aceite"
  | "reset"
  | "status";

interface RequestBody {
  action: Action;
  cod_empresa?: number;
  cod_empresas?: number[];
  ambiente?: "production" | "sandbox";
  reference?: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getOAuthToken(baseUrl: string): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const clientId = Deno.env.get("REDE_GA_CLIENT_ID");
  const clientSecret = Deno.env.get("REDE_GA_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new Error("REDE_GA_CLIENT_ID ou REDE_GA_CLIENT_SECRET não configurados");
  }

  // Endpoint OAuth conforme PDF oficial:
  // Sandbox:    https://rl7-sandbox-api.useredecloud.com.br/oauth/token
  // Production: https://api.userede.com.br/redelabs/oauth/token
  const tokenUrl = `${baseUrl}/oauth/token`;
  console.log(`[rede-ga] Requesting OAuth token from ${tokenUrl}`);

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + btoa(`${clientId}:${clientSecret}`),
    },
    body: "grant_type=client_credentials",
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`[rede-ga] Token error ${res.status}:`, text.slice(0, 500));
    throw new Error(`Falha ao obter token OAuth: ${res.status} ${text.slice(0, 200)}`);
  }

  const data = JSON.parse(text);
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 1440) * 1000,
  };
  return cachedToken.token;
}

function resolveOAuthBase(ambiente?: string): string {
  return ambiente === "production" ? PRODUCTION_OAUTH_BASE : SANDBOX_OAUTH_BASE;
}
function resolveApiBase(ambiente?: string): string {
  return ambiente === "production" ? PRODUCTION_API_BASE : SANDBOX_API_BASE;
}

interface AccessRequestPayload {
  requestType: string;
  requestCompanyNumber: string; // PV cujo acesso queremos
  parentCompanyNumber: string;  // PV matriz do parceiro (nós)
}

interface AccessRequestResult {
  ok: boolean;
  status: number;
  request_id?: string | null;
  remote_status?: string | null;
  payload: AccessRequestPayload;
  response: unknown;
}

/**
 * Faz POST real ao endpoint de solicitação de acesso.
 * Endpoint conforme PDF oficial da REDE (Access Management).
 *
 * O response esperado contém um identificador da solicitação e status PENDING.
 * Em caso de erro, devolvemos o response cru para diagnóstico.
 */
async function postStatementAccessRequest(
  baseUrl: string,
  token: string,
  payload: AccessRequestPayload,
): Promise<AccessRequestResult> {
  const url = `${baseUrl}/access-management/v1/statement-access-requests`;
  console.log(`[rede-ga] POST ${url}`, JSON.stringify(payload));

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }

  console.log(`[rede-ga] Response ${res.status}:`, text.slice(0, 800));

  return {
    ok: res.ok,
    status: res.status,
    request_id:
      parsed?.id ||
      parsed?.requestId ||
      parsed?.accessRequestId ||
      parsed?.statementAccessRequestId ||
      null,
    remote_status: parsed?.status || parsed?.requestStatus || null,
    payload,
    response: parsed,
  };
}

interface ConfigRow {
  id: string;
  cod_empresa: number;
  ambiente: string;
  merchant_id: string | null;
  merchant_id_production: string | null;
  pv_matriz: string | null;
  pv_matriz_production: string | null;
}

function pickPvMatriz(cfg: ConfigRow, ambiente: string): string | null {
  return ambiente === "production" ? cfg.pv_matriz_production : cfg.pv_matriz;
}
function pickMerchantId(cfg: ConfigRow, ambiente: string): string | null {
  return ambiente === "production" ? cfg.merchant_id_production : cfg.merchant_id;
}

async function processSingle(
  supabase: any,
  cfg: ConfigRow,
  ambiente: string,
  reference: string | null,
): Promise<{ cod_empresa: number; ok: boolean; result?: AccessRequestResult; error?: string }> {
  const pvMatriz = pickPvMatriz(cfg, ambiente);
  const requestPv = pickMerchantId(cfg, ambiente);

  if (!pvMatriz) {
    return {
      cod_empresa: cfg.cod_empresa,
      ok: false,
      error: `PV matriz (${ambiente}) não configurado`,
    };
  }
  if (!requestPv) {
    return {
      cod_empresa: cfg.cod_empresa,
      ok: false,
      error: `Merchant ID/PV (${ambiente}) não configurado`,
    };
  }

  const baseUrl = resolveBaseUrl(ambiente);
  const token = await getOAuthToken(baseUrl);

  const payload: AccessRequestPayload = {
    requestType: "STATEMENT",
    requestCompanyNumber: requestPv,
    parentCompanyNumber: pvMatriz,
  };

  const result = await postStatementAccessRequest(baseUrl, token, payload);

  // Persiste sempre — sucesso ou falha — para auditoria
  const updates: Record<string, unknown> = {
    gv_optin_request_payload: payload,
    gv_optin_response: result.response,
    gv_optin_requested_at: new Date().toISOString(),
    gv_optin_reference: reference,
  };

  if (result.ok) {
    updates.gv_optin_status = "AGUARDANDO_ACEITE";
    updates.gv_optin_external_id = result.request_id;
    updates.gv_approved_at = null;
  } else {
    updates.gv_optin_status = "ERRO_SOLICITACAO";
  }

  const { error: upErr } = await supabase
    .from("adquirentes_config")
    .update(updates)
    .eq("id", cfg.id);

  if (upErr) {
    console.error(`[rede-ga] Erro ao persistir cfg ${cfg.id}:`, upErr);
  }

  return { cod_empresa: cfg.cod_empresa, ok: result.ok, result };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as RequestBody;
    const { action, cod_empresa, cod_empresas, ambiente: ambReq, reference } = body || ({} as RequestBody);

    if (!action) throw new Error("action é obrigatório");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ---------- Status (leitura) ----------
    if (action === "status") {
      if (typeof cod_empresa !== "number") throw new Error("cod_empresa é obrigatório");
      const { data, error } = await supabase
        .from("adquirentes_config")
        .select("*")
        .eq("adquirente", "REDE")
        .eq("cod_empresa", cod_empresa)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error(`Configuração REDE inexistente para empresa ${cod_empresa}`);
      return new Response(
        JSON.stringify({
          cod_empresa,
          optin_status: (data as any).gv_optin_status,
          optin_requested_at: (data as any).gv_optin_requested_at,
          optin_reference: (data as any).gv_optin_reference,
          optin_external_id: (data as any).gv_optin_external_id,
          optin_response: (data as any).gv_optin_response,
          approved_at: (data as any).gv_approved_at,
          last_healthcheck_at: (data as any).gv_last_healthcheck_at,
          last_healthcheck_status: (data as any).gv_last_healthcheck_status,
          last_healthcheck_message: (data as any).gv_last_healthcheck_message,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---------- Registrar aceite manual ----------
    if (action === "registrar_aceite") {
      if (typeof cod_empresa !== "number") throw new Error("cod_empresa é obrigatório");
      const { data, error } = await supabase
        .from("adquirentes_config")
        .select("id")
        .eq("adquirente", "REDE")
        .eq("cod_empresa", cod_empresa)
        .maybeSingle();
      if (error || !data) throw new Error(`Configuração REDE inexistente para empresa ${cod_empresa}`);

      await supabase
        .from("adquirentes_config")
        .update({
          gv_optin_status: "APROVADO",
          gv_approved_at: new Date().toISOString(),
        })
        .eq("id", data.id);

      return new Response(
        JSON.stringify({ ok: true, cod_empresa, status: "APROVADO" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---------- Reset ----------
    if (action === "reset") {
      if (typeof cod_empresa !== "number") throw new Error("cod_empresa é obrigatório");
      const { data, error } = await supabase
        .from("adquirentes_config")
        .select("id")
        .eq("adquirente", "REDE")
        .eq("cod_empresa", cod_empresa)
        .maybeSingle();
      if (error || !data) throw new Error(`Configuração REDE inexistente para empresa ${cod_empresa}`);

      await supabase
        .from("adquirentes_config")
        .update({
          gv_optin_status: null,
          gv_optin_requested_at: null,
          gv_optin_reference: null,
          gv_optin_external_id: null,
          gv_optin_request_payload: null,
          gv_optin_response: null,
          gv_approved_at: null,
        })
        .eq("id", data.id);

      return new Response(
        JSON.stringify({ ok: true, cod_empresa, status: "RESET" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---------- Solicitação real (single ou lote) ----------
    const ambiente = ambReq || "production";

    let configs: ConfigRow[] = [];

    if (action === "solicitar_compartilhamento") {
      if (typeof cod_empresa !== "number") throw new Error("cod_empresa é obrigatório");
      const { data, error } = await supabase
        .from("adquirentes_config")
        .select("id, cod_empresa, ambiente, merchant_id, merchant_id_production, pv_matriz, pv_matriz_production")
        .eq("adquirente", "REDE")
        .eq("cod_empresa", cod_empresa);
      if (error) throw new Error(error.message);
      configs = (data || []) as ConfigRow[];
    } else if (action === "solicitar_compartilhamento_lote") {
      let q = supabase
        .from("adquirentes_config")
        .select("id, cod_empresa, ambiente, merchant_id, merchant_id_production, pv_matriz, pv_matriz_production")
        .eq("adquirente", "REDE")
        .eq("ativo", true);

      if (Array.isArray(cod_empresas) && cod_empresas.length > 0) {
        q = q.in("cod_empresa", cod_empresas);
      }
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      configs = (data || []) as ConfigRow[];

      // Para lote em produção, filtra apenas as que têm credenciais de produção
      if (ambiente === "production") {
        configs = configs.filter(
          (c) => c.merchant_id_production && c.pv_matriz_production,
        );
      }
    } else {
      throw new Error(`action '${action}' não suportada`);
    }

    if (configs.length === 0) {
      throw new Error("Nenhuma configuração REDE elegível encontrada");
    }

    const results = [];
    for (const cfg of configs) {
      try {
        const r = await processSingle(supabase, cfg, ambiente, reference || null);
        results.push(r);
      } catch (e) {
        results.push({
          cod_empresa: cfg.cod_empresa,
          ok: false,
          error: (e as Error).message,
        });
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    return new Response(
      JSON.stringify({
        ok: okCount > 0,
        ambiente,
        total: results.length,
        sucesso: okCount,
        falha: results.length - okCount,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[rede-gestao-acessos] Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
