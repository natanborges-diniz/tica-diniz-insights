import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Edge function para Gestão de Acessos REDE.
 *
 * Modelo: cada loja física tem 1+ PVs Matriz Comerciais (coluna `pvs_matriz_production[]`).
 * Para cada PV Matriz único, fazemos UMA chamada à REDE com requestType="T" (Total)
 * e permissions=["R"]. O requestId retornado é replicado em TODAS as lojas que
 * compartilham aquele PV (ex.: Antonio Agu + Sto Antonio = mesmo PV 90059441).
 *
 * Doc: https://developer.userede.com.br/gestao-acessos
 */

const SANDBOX_OAUTH_BASE = "https://rl7-sandbox-api.useredecloud.com.br";
const PRODUCTION_OAUTH_BASE = "https://api.userede.com.br/redelabs";
const SANDBOX_API_BASE = "https://rl7-sandbox-api.useredecloud.com.br";
const PRODUCTION_API_BASE = "https://api.userede.com.br/redelabs";

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

const resolveOAuthBase = (a?: string) => a === "production" ? PRODUCTION_OAUTH_BASE : SANDBOX_OAUTH_BASE;
const resolveApiBase = (a?: string) => a === "production" ? PRODUCTION_API_BASE : SANDBOX_API_BASE;

interface AccessRequestPayload {
  requestType: "I" | "P" | "T";
  requestCompanyNumber: number;
  permissions: string; // "R" (string única, conforme Rede)
  companyNumbers?: number[];
}

interface AccessRequestResult {
  ok: boolean;
  status: number;
  request_id?: string | null;
  remote_status?: string | null;
  payload: AccessRequestPayload;
  response: unknown;
}

async function postStatementAccessRequest(
  baseUrl: string,
  token: string,
  payload: AccessRequestPayload,
): Promise<AccessRequestResult> {
  const url = `${baseUrl}/partner/v1/organizations/requests/features/merchant-statement`;
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
  pvs_matriz_production: string[] | null;
}

function pickPvsMatriz(cfg: ConfigRow, ambiente: string): string[] {
  if (ambiente === "production") {
    const arr = Array.isArray(cfg.pvs_matriz_production) ? cfg.pvs_matriz_production : [];
    if (arr.length > 0) return arr.filter(Boolean);
    // fallback legado
    if (cfg.pv_matriz_production) return [cfg.pv_matriz_production];
    return [];
  }
  return cfg.pv_matriz ? [cfg.pv_matriz] : [];
}

/**
 * Processa um lote de configurações:
 * 1. Expande (cfg, pv) para cada PV de cada loja.
 * 2. Deduplica por PV.
 * 3. Faz UMA chamada por PV único.
 * 4. Persiste o resultado em TODAS as lojas que compartilham aquele PV.
 */
async function processBatch(
  supabase: any,
  configs: ConfigRow[],
  ambiente: string,
  reference: string | null,
) {
  const oauthBase = resolveOAuthBase(ambiente);
  const apiBase = resolveApiBase(ambiente);

  // 1+2. Expandir e agrupar por PV
  const pvToConfigs: Map<string, ConfigRow[]> = new Map();
  const skipped: { cod_empresa: number; reason: string }[] = [];
  const requestedCodEmpresas = new Set(configs.map(c => c.cod_empresa));

  for (const cfg of configs) {
    const pvs = pickPvsMatriz(cfg, ambiente);
    if (pvs.length === 0) {
      skipped.push({ cod_empresa: cfg.cod_empresa, reason: "PV Matriz não configurado" });
      continue;
    }
    for (const pv of pvs) {
      if (!pvToConfigs.has(pv)) pvToConfigs.set(pv, []);
      pvToConfigs.get(pv)!.push(cfg);
    }
  }

  // 2.5. Auto-discovery: para cada PV, buscar TODAS as lojas que compartilham esse PV
  // (mesmo que não estejam na lista de `configs` recebida). Isso garante que 1 Opt-in
  // por PV cubra todas as lojas filhas e o status seja espelhado para todas.
  const allPvs = Array.from(pvToConfigs.keys());
  if (allPvs.length > 0) {
    const { data: sharedConfigs } = await supabase
      .from("adquirentes_config")
      .select(SELECT_COLS)
      .eq("adquirente", "REDE")
      .eq("ativo", true)
      .overlaps("pvs_matriz_production", allPvs);

    if (Array.isArray(sharedConfigs)) {
      for (const shared of sharedConfigs as ConfigRow[]) {
        const sharedPvs = pickPvsMatriz(shared, ambiente);
        for (const pv of sharedPvs) {
          if (!pvToConfigs.has(pv)) continue;
          const list = pvToConfigs.get(pv)!;
          if (!list.some(c => c.id === shared.id)) {
            list.push(shared);
            console.log(`[rede-ga] Auto-incluída loja ${shared.cod_empresa} (compartilha PV ${pv})`);
          }
        }
      }
    }
  }

  if (pvToConfigs.size === 0) {
    return {
      total_pvs: 0,
      sucesso: 0,
      falha: 0,
      skipped,
      pv_results: [],
      cfg_results: [],
    };
  }

  const token = await getOAuthToken(oauthBase);

  const pvResults: Array<{
    pv: string;
    ok: boolean;
    request_id?: string | null;
    error?: string;
    cod_empresas: number[];
    response?: unknown;
    status?: number;
  }> = [];

  const cfgResults: Array<{
    cod_empresa: number;
    pv: string;
    ok: boolean;
    request_id?: string | null;
    error?: string;
  }> = [];

  // 3. Uma chamada por PV único
  for (const [pv, cfgs] of pvToConfigs.entries()) {
    const requestCompanyNumber = Number(pv);
    if (!Number.isFinite(requestCompanyNumber)) {
      pvResults.push({
        pv,
        ok: false,
        error: `PV inválido (não numérico): ${pv}`,
        cod_empresas: cfgs.map(c => c.cod_empresa),
      });
      for (const c of cfgs) {
        cfgResults.push({ cod_empresa: c.cod_empresa, pv, ok: false, error: "PV inválido" });
      }
      continue;
    }

    const payload: AccessRequestPayload = {
      requestType: "T",
      requestCompanyNumber,
      permissions: "R",
    };

    console.log(`[rede-ga] PV ${pv} compartilhado por ${cfgs.length} loja(s): ${cfgs.map(c => c.cod_empresa).join(",")}`);

    let result: AccessRequestResult;
    try {
      result = await postStatementAccessRequest(apiBase, token, payload);
    } catch (e) {
      const err = (e as Error).message;
      pvResults.push({ pv, ok: false, error: err, cod_empresas: cfgs.map(c => c.cod_empresa) });
      for (const c of cfgs) {
        cfgResults.push({ cod_empresa: c.cod_empresa, pv, ok: false, error: err });
      }
      continue;
    }

    pvResults.push({
      pv,
      ok: result.ok,
      request_id: result.request_id,
      cod_empresas: cfgs.map(c => c.cod_empresa),
      response: result.response,
      status: result.status,
    });

    // 4. Persistir em TODAS as configs que compartilham este PV
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

    // Origem do request: a primeira loja explicitamente solicitada que compartilha este PV
    const originCfg = cfgs.find(c => requestedCodEmpresas.has(c.cod_empresa)) ?? cfgs[0];

    for (const cfg of cfgs) {
      const isMirror = cfg.id !== originCfg.id;
      const cfgUpdates = {
        ...updates,
        gv_optin_mirrored_from: isMirror ? originCfg.cod_empresa : null,
      };

      const { error: upErr } = await supabase
        .from("adquirentes_config")
        .update(cfgUpdates)
        .eq("id", cfg.id);

      if (upErr) {
        console.error(`[rede-ga] Erro ao persistir cfg ${cfg.id}:`, upErr);
        cfgResults.push({
          cod_empresa: cfg.cod_empresa,
          pv,
          ok: false,
          error: `Persistência: ${upErr.message}`,
        });
      } else {
        cfgResults.push({
          cod_empresa: cfg.cod_empresa,
          pv,
          ok: result.ok,
          request_id: result.request_id,
          error: result.ok ? undefined : `HTTP ${result.status}`,
        });
      }
    }
  }

  const sucesso = pvResults.filter(r => r.ok).length;
  return {
    total_pvs: pvResults.length,
    sucesso,
    falha: pvResults.length - sucesso,
    skipped,
    pv_results: pvResults,
    cfg_results: cfgResults,
  };
}

const SELECT_COLS = "id, cod_empresa, ambiente, merchant_id, merchant_id_production, pv_matriz, pv_matriz_production, pvs_matriz_production";

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

    // ---------- Status ----------
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
          mirrored_from: (data as any).gv_optin_mirrored_from,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---------- Registrar aceite manual ----------
    if (action === "registrar_aceite") {
      if (typeof cod_empresa !== "number") throw new Error("cod_empresa é obrigatório");
      const { data, error } = await supabase
        .from("adquirentes_config")
        .select("id, pvs_matriz_production")
        .eq("adquirente", "REDE")
        .eq("cod_empresa", cod_empresa)
        .maybeSingle();
      if (error || !data) throw new Error(`Configuração REDE inexistente para empresa ${cod_empresa}`);

      const pvs = Array.isArray((data as any).pvs_matriz_production) ? (data as any).pvs_matriz_production : [];
      const updates = {
        gv_optin_status: "APROVADO",
        gv_approved_at: new Date().toISOString(),
      };

      // Atualiza a loja origem
      await supabase.from("adquirentes_config").update(updates).eq("id", data.id);

      // Espelha para todas as outras lojas que compartilham qualquer um dos PVs
      let mirroredCount = 0;
      if (pvs.length > 0) {
        const { data: shared } = await supabase
          .from("adquirentes_config")
          .select("id, cod_empresa")
          .eq("adquirente", "REDE")
          .eq("ativo", true)
          .neq("id", data.id)
          .overlaps("pvs_matriz_production", pvs);

        if (Array.isArray(shared) && shared.length > 0) {
          const ids = shared.map((s: any) => s.id);
          await supabase
            .from("adquirentes_config")
            .update({ ...updates, gv_optin_mirrored_from: cod_empresa })
            .in("id", ids);
          mirroredCount = shared.length;
        }
      }

      return new Response(
        JSON.stringify({ ok: true, cod_empresa, status: "APROVADO", mirrored_to: mirroredCount }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---------- Reset ----------
    if (action === "reset") {
      if (typeof cod_empresa !== "number") throw new Error("cod_empresa é obrigatório");
      const { data, error } = await supabase
        .from("adquirentes_config")
        .select("id, pvs_matriz_production")
        .eq("adquirente", "REDE")
        .eq("cod_empresa", cod_empresa)
        .maybeSingle();
      if (error || !data) throw new Error(`Configuração REDE inexistente para empresa ${cod_empresa}`);

      const pvs = Array.isArray((data as any).pvs_matriz_production) ? (data as any).pvs_matriz_production : [];
      const resetFields = {
        gv_optin_status: null,
        gv_optin_requested_at: null,
        gv_optin_reference: null,
        gv_optin_external_id: null,
        gv_optin_request_payload: null,
        gv_optin_response: null,
        gv_approved_at: null,
        gv_optin_mirrored_from: null,
      };

      await supabase.from("adquirentes_config").update(resetFields).eq("id", data.id);

      // Reseta também todas as lojas espelhadas (mesmo PV)
      if (pvs.length > 0) {
        const { data: shared } = await supabase
          .from("adquirentes_config")
          .select("id")
          .eq("adquirente", "REDE")
          .eq("ativo", true)
          .neq("id", data.id)
          .overlaps("pvs_matriz_production", pvs);

        if (Array.isArray(shared) && shared.length > 0) {
          await supabase.from("adquirentes_config").update(resetFields).in("id", shared.map((s: any) => s.id));
        }
      }

      return new Response(
        JSON.stringify({ ok: true, cod_empresa, status: "RESET" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---------- Solicitação (single ou lote) ----------
    const ambiente = ambReq || "production";

    let configs: ConfigRow[] = [];

    if (action === "solicitar_compartilhamento") {
      if (typeof cod_empresa !== "number") throw new Error("cod_empresa é obrigatório");
      const { data, error } = await supabase
        .from("adquirentes_config")
        .select(SELECT_COLS)
        .eq("adquirente", "REDE")
        .eq("cod_empresa", cod_empresa);
      if (error) throw new Error(error.message);
      configs = (data || []) as ConfigRow[];
    } else if (action === "solicitar_compartilhamento_lote") {
      let q = supabase
        .from("adquirentes_config")
        .select(SELECT_COLS)
        .eq("adquirente", "REDE")
        .eq("ativo", true);

      if (Array.isArray(cod_empresas) && cod_empresas.length > 0) {
        q = q.in("cod_empresa", cod_empresas);
      }
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      configs = (data || []) as ConfigRow[];
    } else {
      throw new Error(`action '${action}' não suportada`);
    }

    if (configs.length === 0) {
      throw new Error("Nenhuma configuração REDE elegível encontrada");
    }

    const summary = await processBatch(supabase, configs, ambiente, reference || null);

    return new Response(
      JSON.stringify({
        ok: summary.sucesso > 0,
        ambiente,
        ...summary,
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
