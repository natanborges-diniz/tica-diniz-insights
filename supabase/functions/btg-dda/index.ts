// supabase/functions/btg-dda/index.ts
// BTG Pactual Banking — DDA + Conciliação (endpoints oficiais v2)
// Path: /{CNPJ}/banking/direct-debit/debits
// Actions: importar, listar, conciliar_auto, conciliar_manual, ignorar, indicadores

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function getBtgConfig() {
  const db = getServiceClient();
  const { data } = await db
    .from("fornecedor_configuracao")
    .select("ambiente")
    .eq("fornecedor", "btg")
    .eq("ativo", true)
    .single();
  const env = data?.ambiente === "production" ? "production" : "sandbox";
  const isSandbox = env === "sandbox";
  return {
    apiBase: isSandbox
      ? "https://api.sandbox.empresas.btgpactual.com"
      : "https://api.empresas.btgpactual.com",
    isSandbox,
  };
}

// ─── Auth helpers ────────────────────────────────────────────
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

function requireAuth(req: Request): string {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw json({ error: "Unauthorized" }, 401);
  const claims = decodeJwtPayload(authHeader.replace("Bearer ", ""));
  if (!claims?.sub || claims.aud !== "authenticated") throw json({ error: "Unauthorized" }, 401);
  const exp = claims.exp as number | undefined;
  if (exp && exp < Math.floor(Date.now() / 1000)) throw json({ error: "Token expirado" }, 401);
  return claims.sub as string;
}

async function isAdmin(userId: string): Promise<boolean> {
  const db = getServiceClient();
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin");
  return !!data && data.length > 0;
}

async function requireAdminRole(userId: string) {
  if (!(await isAdmin(userId))) throw json({ error: "Forbidden — apenas admin" }, 403);
}

async function getBtgToken(codEmpresa: number): Promise<string> {
  const db = getServiceClient();
  const { data } = await db.from("btg_tokens").select("access_token, expires_at").eq("cod_empresa", codEmpresa).single();
  if (!data) throw json({ error: `Empresa ${codEmpresa} não autenticada no BTG.` }, 400);
  if (new Date(data.expires_at) < new Date()) throw json({ error: `Token BTG expirado para empresa ${codEmpresa}.` }, 401);
  return data.access_token;
}

async function getCnpj(codEmpresa: number): Promise<string> {
  const db = getServiceClient();
  const { data: conta } = await db.from("btg_contas_bancarias").select("cnpj").eq("cod_empresa", codEmpresa).eq("ativa", true).single();
  if (conta?.cnpj) return conta.cnpj.replace(/\D/g, "");
  const { data: emp } = await db.from("empresa").select("cnpj").eq("cod_empresa", codEmpresa).single();
  if (emp?.cnpj) return emp.cnpj.replace(/\D/g, "");
  throw json({ error: `CNPJ não encontrado para empresa ${codEmpresa}` }, 400);
}

// ─── Param helper ────────────────────────────────────────────
function getParam(body: Record<string, unknown> | null, url: URL, key: string): string | null {
  if (body && body[key] !== undefined && body[key] !== null) return String(body[key]);
  return url.searchParams.get(key);
}

// ─── ACTION: importar ────────────────────────────────────────
async function handleImportar(body: Record<string, unknown>, userId: string) {
  await requireAdminRole(userId);
  const db = getServiceClient();

  const { cod_empresa } = body;
  if (!cod_empresa) return json({ error: "cod_empresa obrigatório" }, 400);

  const ce = Number(cod_empresa);
  const { apiBase, isSandbox } = await getBtgConfig();

  let btgData: Record<string, unknown>[] = [];

  if (isSandbox) {
    btgData = [
      {
        id: `sandbox-dda-${Date.now()}-1`,
        amount: 1890.50,
        dueDate: new Date(Date.now() + 5 * 86400000).toISOString(),
        expirationDate: new Date(Date.now() + 10 * 86400000).toISOString(),
        digitableLine: "23793.38128 60000.000003 00000.000402 1 88880000189050",
        payee: { document: "06981180000116", fantasyName: "CEMIG DISTRIBUICAO SA", socialName: "CEMIG DISTRIBUICAO SA", bankCode: "001", bankName: "BANCO DO BRASIL" },
        hidden: false,
        status: "CREATED",
      },
      {
        id: `sandbox-dda-${Date.now()}-2`,
        amount: 450.00,
        dueDate: new Date(Date.now() + 3 * 86400000).toISOString(),
        expirationDate: new Date(Date.now() + 8 * 86400000).toISOString(),
        digitableLine: "23793.38128 60000.000004 00000.000403 1 88880000045000",
        payee: { document: "02558157000162", fantasyName: "TELEFONICA BRASIL SA", socialName: "TELEFONICA BRASIL SA", bankCode: "341", bankName: "ITAU UNIBANCO" },
        hidden: false,
        status: "OVERDUE",
      },
      {
        id: `sandbox-dda-${Date.now()}-3`,
        amount: 12350.00,
        dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        expirationDate: new Date(Date.now() + 12 * 86400000).toISOString(),
        digitableLine: "23793.38128 60000.000005 00000.000404 1 88881001235000",
        payee: { document: "01722296000117", fantasyName: "HOYA LENS DO BRASIL LTDA", socialName: "HOYA LENS DO BRASIL LTDA", bankCode: "208", bankName: "BTG PACTUAL" },
        hidden: false,
        status: "CREATED",
      },
    ];
  } else {
    const accessToken = await getBtgToken(ce);
    const cnpj = await getCnpj(ce);

    const btgRes = await fetch(
      `${apiBase}/${cnpj}/banking/direct-debit/debits?pageNumber=1&pageSize=100`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }
    );

    const btgBody = await btgRes.text();
    if (!btgRes.ok) {
      console.error("[btg-dda] BTG API error:", btgRes.status, btgBody);
      return json({ error: "Erro ao consultar DDA no BTG", btg_status: btgRes.status, details: btgBody }, 502);
    }

    try {
      const parsed = JSON.parse(btgBody);
      console.log("[btg-dda] BTG raw response keys:", JSON.stringify(Object.keys(parsed)));
      // BTG response: { data: [...], _links: {...} }
      btgData = Array.isArray(parsed) ? parsed : (parsed.data || []);
      if (btgData.length > 0) {
        console.log("[btg-dda] First item sample:", JSON.stringify(btgData[0]));
      }
    } catch {
      return json({ error: "Resposta inválida do BTG" }, 502);
    }
  }

  // Delete old records that have null emissor (bad imports) to allow reimport
  const { count: deletedOld } = await db
    .from("btg_dda_titulos")
    .delete({ count: "exact" })
    .eq("cod_empresa", ce)
    .is("emissor", null)
    .eq("status", "PENDENTE");

  console.log(`[btg-dda] Deleted ${deletedOld ?? 0} old records with null emissor for reimport`);

  let inseridos = 0;
  let duplicados = 0;

  for (const titulo of btgData) {
    const btgDdaId = (titulo.id || titulo.ddaId || "") as string;

    if (btgDdaId) {
      const { data: existing } = await db
        .from("btg_dda_titulos")
        .select("id")
        .eq("btg_dda_id", btgDdaId)
        .eq("cod_empresa", ce)
        .maybeSingle();
      if (existing) { duplicados++; continue; }
    }

    // Map BTG API fields — handle nested payee object
    const payee = (titulo.payee || {}) as Record<string, unknown>;
    const emissorVal = (payee.fantasyName || payee.socialName || titulo.issuerName || titulo.payeeName || null) as string | null;
    const docEmissorVal = (payee.taxId || titulo.issuerDocument || titulo.payeeDocument || null) as string | null;
    const bancoVal = (payee.bankName || null) as string | null;
    const valorVal = Number(titulo.amount || titulo.value || 0);
    const vencVal = (titulo.dueDate || titulo.due_date || new Date().toISOString().slice(0, 10)) as string;
    const linhaVal = (titulo.digitableLine || titulo.digitable_line || null) as string | null;

    const { error } = await db.from("btg_dda_titulos").insert({
      cod_empresa: ce,
      btg_dda_id: btgDdaId || null,
      emissor: emissorVal,
      documento_emissor: docEmissorVal,
      banco_emissor: bancoVal,
      valor: valorVal,
      data_vencimento: vencVal,
      linha_digitavel: linhaVal,
      status: "PENDENTE",
    });

    if (!error) inseridos++;
    else console.warn("[btg-dda] Insert error:", error.message);
  }

  // Include a sample of raw BTG data for debugging field mapping
  const sampleItem = btgData.length > 0 ? btgData[0] : null;

  return json({
    success: true,
    importados: inseridos,
    duplicados,
    registros_limpos: deletedOld ?? 0,
    total_btg: btgData.length,
    sandbox: isSandbox,
    _debug_sample_keys: sampleItem ? Object.keys(sampleItem) : [],
    _debug_sample: sampleItem,
  });
}

// ─── ACTION: conciliar_auto ──────────────────────────────────
async function handleConciliarAuto(body: Record<string, unknown>, userId: string) {
  await requireAdminRole(userId);

  const { cod_empresa } = body;
  if (!cod_empresa) return json({ error: "cod_empresa obrigatório" }, 400);

  const ce = Number(cod_empresa);
  const db = getServiceClient();

  const { data: titulosDda, error: ddaErr } = await db
    .from("btg_dda_titulos")
    .select("*")
    .eq("cod_empresa", ce)
    .eq("status", "PENDENTE")
    .eq("conciliado", false);

  if (ddaErr) return json({ error: "Erro ao buscar títulos DDA", details: ddaErr.message }, 500);
  if (!titulosDda || titulosDda.length === 0) {
    return json({ success: true, conciliados: 0, sem_match: 0, mensagem: "Nenhum título DDA pendente" });
  }

  const vencimentos = titulosDda.map((t) => t.data_vencimento).filter(Boolean).sort();
  const dataInicio = vencimentos[0] || new Date().toISOString().slice(0, 10);
  const dataFim = vencimentos[vencimentos.length - 1] || dataInicio;

  const firebirdBaseUrl = Deno.env.get("FIREBIRD_API_BASE_URL") || "https://firebird-bridge-production.up.railway.app";
  const parcelasUrl = new URL(`${firebirdBaseUrl}/api/v1/financeiro/parcelas`);
  parcelasUrl.searchParams.set("empresa", String(ce));
  parcelasUrl.searchParams.set("dataInicio", dataInicio);
  parcelasUrl.searchParams.set("dataFim", dataFim);
  parcelasUrl.searchParams.set("tipo", "PAGAR");
  parcelasUrl.searchParams.set("situacao", "EM ABERTO");
  parcelasUrl.searchParams.set("campoData", "VENCIMENTO");

  let parcelasErp: Array<Record<string, unknown>> = [];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(parcelasUrl.toString(), {
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const envelope = await res.json();
      parcelasErp = envelope.ok ? (envelope.data || []) : [];
    } else {
      console.warn("[btg-dda] Firebird parcelas error:", res.status);
    }
  } catch (e) {
    console.error("[btg-dda] Erro ao buscar parcelas do ERP:", e);
    return json({ error: "Não foi possível consultar parcelas do ERP", details: String(e) }, 502);
  }

  // Index parcelas by valor+vencimento (primary) and valor-only (fallback)
  const parcelasIndexExact = new Map<string, Record<string, unknown>>();
  const parcelasIndexValorVenc = new Map<string, Record<string, unknown>>();
  for (const p of parcelasErp) {
    const valor = Number(p.parcela_valor || 0).toFixed(2);
    const venc = (String(p.parcela_data_vencimento || "")).slice(0, 10);
    const keyExact = `${valor}|${venc}`;
    if (!parcelasIndexExact.has(keyExact)) parcelasIndexExact.set(keyExact, p);
    // Also index by valor+fornecedor (CNPJ) for CNPJ-based matching
    const cnpjForn = (String(p.fornecedor_cnpj || p.pessoa_identificador || "")).replace(/\D/g, "");
    if (cnpjForn) {
      const keyCnpj = `${valor}|${venc}|${cnpjForn}`;
      if (!parcelasIndexValorVenc.has(keyCnpj)) parcelasIndexValorVenc.set(keyCnpj, p);
    }
  }

  let conciliadosCount = 0;
  let semMatch = 0;

  for (const titulo of titulosDda) {
    const valorStr = Number(titulo.valor).toFixed(2);
    const vencStr = (titulo.data_vencimento || "").slice(0, 10);
    const cnpjDda = (titulo.documento_emissor || "").replace(/\D/g, "");

    // Try CNPJ + valor + vencimento first (most precise)
    let parcelaMatch: Record<string, unknown> | undefined;
    let matchKeyUsed = "";

    if (cnpjDda) {
      const keyCnpj = `${valorStr}|${vencStr}|${cnpjDda}`;
      parcelaMatch = parcelasIndexValorVenc.get(keyCnpj);
      if (parcelaMatch) matchKeyUsed = keyCnpj;
    }

    // Fallback: valor + vencimento only
    if (!parcelaMatch) {
      const keyExact = `${valorStr}|${vencStr}`;
      parcelaMatch = parcelasIndexExact.get(keyExact);
      if (parcelaMatch) matchKeyUsed = keyExact;
    }

    if (parcelaMatch) {
      await db.from("btg_dda_titulos").update({ conciliado: true, status: "CONCILIADO" }).eq("id", titulo.id);
      if (matchKeyUsed.includes("|") && matchKeyUsed.split("|").length === 3) {
        parcelasIndexValorVenc.delete(matchKeyUsed);
      } else {
        parcelasIndexExact.delete(matchKeyUsed);
      }
      conciliadosCount++;
    } else {
      semMatch++;
    }
  }

  return json({
    success: true,
    conciliados: conciliadosCount,
    sem_match: semMatch,
    total: titulosDda.length,
    parcelas_erp_encontradas: parcelasErp.length,
  });
}

// ─── ACTION: conciliar_manual ────────────────────────────────
async function handleConciliarManual(body: Record<string, unknown>, userId: string) {
  await requireAdminRole(userId);

  const { titulo_id, parcela_id } = body;
  if (!titulo_id || !parcela_id) return json({ error: "titulo_id e parcela_id são obrigatórios" }, 400);

  const db = getServiceClient();
  const { data: titulo } = await db.from("btg_dda_titulos").select("id, conciliado").eq("id", String(titulo_id)).single();
  if (!titulo) return json({ error: "Título DDA não encontrado" }, 404);
  if (titulo.conciliado) return json({ error: "Título já conciliado" }, 400);

  const { error } = await db.from("btg_dda_titulos").update({
    parcela_id: String(parcela_id),
    conciliado: true,
    status: "CONCILIADO",
  }).eq("id", String(titulo_id));

  if (error) return json({ error: "Erro ao conciliar", details: error.message }, 500);
  return json({ success: true, status: "CONCILIADO" });
}

// ─── ACTION: ignorar ─────────────────────────────────────────
async function handleIgnorar(body: Record<string, unknown>, userId: string) {
  await requireAdminRole(userId);

  const { titulo_id } = body;
  if (!titulo_id) return json({ error: "titulo_id obrigatório" }, 400);

  const db = getServiceClient();
  const { error } = await db.from("btg_dda_titulos").update({ status: "IGNORADO" }).eq("id", String(titulo_id));
  if (error) return json({ error: "Erro ao ignorar", details: error.message }, 500);
  return json({ success: true, status: "IGNORADO" });
}

// ─── ACTION: listar ──────────────────────────────────────────
async function handleListar(body: Record<string, unknown> | null, url: URL, userId: string) {
  const codEmpresa = getParam(body, url, "cod_empresa");
  const status = getParam(body, url, "status");
  const conciliado = getParam(body, url, "conciliado");
  const limit = Number(getParam(body, url, "limit") || "100");

  const db = getServiceClient();
  const admin = await isAdmin(userId);
  let empresasPermitidas: number[] = [];

  if (!admin) {
    const { data: perms } = await db.from("user_empresa_permissions").select("cod_empresa").eq("user_id", userId);
    empresasPermitidas = (perms || []).map((p: { cod_empresa: number }) => p.cod_empresa);
    if (empresasPermitidas.length === 0) return json([]);
  }

  let query = db.from("btg_dda_titulos").select("*").order("data_vencimento", { ascending: true }).limit(limit);

  if (codEmpresa) {
    const ce = Number(codEmpresa);
    if (!admin && !empresasPermitidas.includes(ce)) return json({ error: "Sem permissão" }, 403);
    query = query.eq("cod_empresa", ce);
  } else if (!admin) {
    query = query.in("cod_empresa", empresasPermitidas);
  }

  if (status) query = query.eq("status", status);
  if (conciliado !== null && conciliado !== undefined) {
    query = query.eq("conciliado", conciliado === "true");
  }

  const { data, error } = await query;
  if (error) return json({ error: "Erro ao listar DDA", details: error.message }, 500);
  return json(data || []);
}

// ─── ACTION: indicadores ─────────────────────────────────────
async function handleIndicadores(body: Record<string, unknown> | null, url: URL) {
  const codEmpresa = getParam(body, url, "cod_empresa");
  if (!codEmpresa) return json({ error: "cod_empresa obrigatório" }, 400);

  const db = getServiceClient();
  const ce = Number(codEmpresa);

  const { count: total } = await db.from("btg_dda_titulos").select("id", { count: "exact", head: true }).eq("cod_empresa", ce);
  const { count: conciliados } = await db.from("btg_dda_titulos").select("id", { count: "exact", head: true }).eq("cod_empresa", ce).eq("conciliado", true);
  const { count: pendentes } = await db.from("btg_dda_titulos").select("id", { count: "exact", head: true }).eq("cod_empresa", ce).eq("status", "PENDENTE").eq("conciliado", false);
  const { count: ignorados } = await db.from("btg_dda_titulos").select("id", { count: "exact", head: true }).eq("cod_empresa", ce).eq("status", "IGNORADO");

  const t = total || 0;
  const c = conciliados || 0;

  return json({
    total: t,
    conciliados: c,
    pendentes: pendentes || 0,
    ignorados: ignorados || 0,
    percentual_conciliado: t > 0 ? Math.round((c / t) * 100) : 0,
  });
}

// ─── MAIN ────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let action = url.searchParams.get("action") || "";
    let body: Record<string, unknown> | null = null;

    if (req.method === "POST") {
      try {
        body = await req.json();
        if (!action && body?.action) action = String(body.action);
      } catch { /* no-op */ }
    }

    const userId = requireAuth(req);

    switch (action) {
      case "importar":
        return await handleImportar(body || {}, userId);
      case "listar":
        return await handleListar(body, url, userId);
      case "conciliar_auto":
        return await handleConciliarAuto(body || {}, userId);
      case "conciliar_manual":
        return await handleConciliarManual(body || {}, userId);
      case "ignorar":
        return await handleIgnorar(body || {}, userId);
      case "indicadores":
        return await handleIndicadores(body, url);
      default:
        return json({ error: `Ação desconhecida: '${action}'. Use: importar, listar, conciliar_auto, conciliar_manual, ignorar, indicadores` }, 400);
    }
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[btg-dda] Unhandled error:", e);
    return json({ error: "Erro interno", details: String(e) }, 500);
  }
});
