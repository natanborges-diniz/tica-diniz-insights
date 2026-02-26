// supabase/functions/btg-pagamentos/index.ts
// BTG Pactual Banking — Pagamentos (Fase 2)
// Actions: criar, listar, detalhe, cancelar, aprovar_interno, enviar_btg

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

function getBtgUrls() {
  const env = Deno.env.get("BTG_ENVIRONMENT") || "sandbox";
  const isSandbox = env === "sandbox";
  return {
    apiBase: isSandbox
      ? "https://api.sandbox.empresas.btgpactual.com"
      : "https://api.empresas.btgpactual.com",
    isSandbox,
  };
}

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
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
  if (!authHeader?.startsWith("Bearer ")) {
    throw json({ error: "Unauthorized" }, 401);
  }
  const claims = decodeJwtPayload(authHeader.replace("Bearer ", ""));
  if (!claims?.sub || claims.aud !== "authenticated") {
    throw json({ error: "Unauthorized" }, 401);
  }
  const exp = claims.exp as number | undefined;
  if (exp && exp < Math.floor(Date.now() / 1000)) {
    throw json({ error: "Token expirado" }, 401);
  }
  return claims.sub as string;
}

async function isAdmin(userId: string): Promise<boolean> {
  const db = getServiceClient();
  const { data } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin");
  return !!data && data.length > 0;
}

async function requireAdminRole(userId: string) {
  if (!(await isAdmin(userId))) {
    throw json({ error: "Forbidden — apenas admin" }, 403);
  }
}

// ─── BTG Token helper ────────────────────────────────────────
async function getBtgToken(codEmpresa: number): Promise<string> {
  const db = getServiceClient();
  const { data } = await db
    .from("btg_tokens")
    .select("access_token, expires_at")
    .eq("cod_empresa", codEmpresa)
    .single();

  if (!data) {
    throw json({ error: `Empresa ${codEmpresa} não autenticada no BTG. Autorize primeiro.` }, 400);
  }

  const expiresAt = new Date(data.expires_at);
  if (expiresAt < new Date()) {
    throw json({ error: `Token BTG expirado para empresa ${codEmpresa}. Faça refresh.` }, 401);
  }

  return data.access_token;
}

async function getCompanyId(codEmpresa: number): Promise<string> {
  const db = getServiceClient();
  const { data } = await db
    .from("btg_contas_bancarias")
    .select("company_id")
    .eq("cod_empresa", codEmpresa)
    .eq("ativa", true)
    .single();

  if (!data?.company_id) {
    throw json({ error: `Conta bancária BTG não configurada para empresa ${codEmpresa}` }, 400);
  }

  return data.company_id;
}

// ─── Param helper: reads from body (POST) or query string ────
function getParam(body: Record<string, unknown> | null, url: URL, key: string): string | null {
  if (body && body[key] !== undefined && body[key] !== null) return String(body[key]);
  return url.searchParams.get(key);
}

// ─── ACTION: criar ───────────────────────────────────────────
async function handleCriar(body: Record<string, unknown>, userId: string) {
  const { cod_empresa, tipo, valor, beneficiario, dados_pagamento, parcela_id } = body;

  if (!cod_empresa || !tipo || !valor) {
    return json({ error: "cod_empresa, tipo e valor são obrigatórios" }, 400);
  }

  const tiposValidos = ["PIX_KEY", "PIX_QR_CODE", "PIX_MANUAL", "TED", "BANKSLIP", "UTILITIES", "DARF", "PIX_REVERSAL"];
  if (!tiposValidos.includes(String(tipo))) {
    return json({ error: `Tipo inválido. Válidos: ${tiposValidos.join(", ")}` }, 400);
  }

  const db = getServiceClient();
  const { data, error } = await db.from("btg_pagamentos").insert({
    cod_empresa: Number(cod_empresa),
    tipo: String(tipo),
    valor: Number(valor),
    beneficiario: beneficiario ? String(beneficiario) : null,
    dados_pagamento: (dados_pagamento as Record<string, unknown>) || {},
    parcela_id: parcela_id ? String(parcela_id) : null,
    solicitado_por: userId,
    status: "RASCUNHO",
  }).select().single();

  if (error) {
    console.error("[btg-pagamentos] Insert error:", error);
    return json({ error: "Erro ao criar pagamento", details: error.message }, 500);
  }

  return json({ success: true, pagamento: data }, 201);
}

// ─── ACTION: listar ──────────────────────────────────────────
async function handleListar(body: Record<string, unknown> | null, url: URL, userId: string) {
  const codEmpresa = getParam(body, url, "cod_empresa");
  const status = getParam(body, url, "status");
  const limit = Number(getParam(body, url, "limit") || "50");

  const db = getServiceClient();
  const admin = await isAdmin(userId);
  let empresasPermitidas: number[] = [];

  if (!admin) {
    const { data: perms } = await db
      .from("user_empresa_permissions")
      .select("cod_empresa")
      .eq("user_id", userId);
    empresasPermitidas = (perms || []).map((p: { cod_empresa: number }) => p.cod_empresa);
    if (empresasPermitidas.length === 0) return json([]);
  }

  let query = db
    .from("btg_pagamentos")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (codEmpresa) {
    const ce = Number(codEmpresa);
    if (!admin && !empresasPermitidas.includes(ce)) {
      return json({ error: "Sem permissão para essa empresa" }, 403);
    }
    query = query.eq("cod_empresa", ce);
  } else if (!admin) {
    query = query.in("cod_empresa", empresasPermitidas);
  }

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    return json({ error: "Erro ao listar pagamentos", details: error.message }, 500);
  }

  return json(data || []);
}

// ─── ACTION: detalhe ─────────────────────────────────────────
async function handleDetalhe(body: Record<string, unknown> | null, url: URL) {
  const id = getParam(body, url, "id");
  if (!id) return json({ error: "id obrigatório" }, 400);

  const db = getServiceClient();
  const { data, error } = await db
    .from("btg_pagamentos")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return json({ error: "Pagamento não encontrado" }, 404);
  return json(data);
}

// ─── ACTION: aprovar_interno ─────────────────────────────────
async function handleAprovarInterno(body: Record<string, unknown>, userId: string) {
  await requireAdminRole(userId);

  const { id } = body;
  if (!id) return json({ error: "id obrigatório" }, 400);

  const db = getServiceClient();
  const { data: pagamento } = await db
    .from("btg_pagamentos")
    .select("status")
    .eq("id", String(id))
    .single();

  if (!pagamento) return json({ error: "Pagamento não encontrado" }, 404);
  if (pagamento.status !== "RASCUNHO") {
    return json({ error: `Não é possível aprovar pagamento com status ${pagamento.status}` }, 400);
  }

  const { error } = await db
    .from("btg_pagamentos")
    .update({
      status: "APROVADO_INTERNO",
      aprovado_por: userId,
      aprovado_em: new Date().toISOString(),
    })
    .eq("id", String(id));

  if (error) return json({ error: "Erro ao aprovar", details: error.message }, 500);
  return json({ success: true, status: "APROVADO_INTERNO" });
}

// ─── ACTION: enviar_btg ──────────────────────────────────────
async function handleEnviarBtg(body: Record<string, unknown>, userId: string) {
  await requireAdminRole(userId);

  const { id } = body;
  if (!id) return json({ error: "id obrigatório" }, 400);

  const db = getServiceClient();
  const { data: pagamento } = await db
    .from("btg_pagamentos")
    .select("*")
    .eq("id", String(id))
    .single();

  if (!pagamento) return json({ error: "Pagamento não encontrado" }, 404);
  if (pagamento.status !== "APROVADO_INTERNO") {
    return json({ error: `Só é possível enviar pagamentos com status APROVADO_INTERNO. Atual: ${pagamento.status}` }, 400);
  }

  const accessToken = await getBtgToken(pagamento.cod_empresa);
  const companyId = await getCompanyId(pagamento.cod_empresa);
  const { apiBase } = getBtgUrls();

  const btgPayload = {
    type: pagamento.tipo,
    amount: pagamento.valor,
    beneficiary: pagamento.beneficiario,
    ...((pagamento.dados_pagamento as Record<string, unknown>) || {}),
  };

  const btgRes = await fetch(
    `${apiBase}/banking/v1/companies/${companyId}/payments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(btgPayload),
    }
  );

  const btgBody = await btgRes.text();
  let btgData: Record<string, unknown> = {};
  try { btgData = JSON.parse(btgBody); } catch { /* non-JSON */ }

  if (!btgRes.ok) {
    console.error("[btg-pagamentos] BTG API error:", btgRes.status, btgBody);
    await db.from("btg_pagamentos").update({
      status: "REJEITADO",
      dados_pagamento: { ...(pagamento.dados_pagamento as Record<string, unknown>), btg_error: btgData },
    }).eq("id", String(id));
    return json({ error: "BTG rejeitou o pagamento", btg_status: btgRes.status, details: btgData }, 502);
  }

  const btgPaymentId = (btgData.id || btgData.paymentId || btgData.payment_id || "") as string;
  await db.from("btg_pagamentos").update({
    status: "ENVIADO_BTG",
    btg_payment_id: btgPaymentId || null,
    dados_pagamento: { ...(pagamento.dados_pagamento as Record<string, unknown>), btg_response: btgData },
  }).eq("id", String(id));

  return json({ success: true, status: "ENVIADO_BTG", btg_payment_id: btgPaymentId });
}

// ─── ACTION: cancelar ────────────────────────────────────────
async function handleCancelar(body: Record<string, unknown>, userId: string) {
  await requireAdminRole(userId);

  const { id } = body;
  if (!id) return json({ error: "id obrigatório" }, 400);

  const db = getServiceClient();
  const { data: pagamento } = await db
    .from("btg_pagamentos")
    .select("status")
    .eq("id", String(id))
    .single();

  if (!pagamento) return json({ error: "Pagamento não encontrado" }, 404);
  if (!["RASCUNHO", "APROVADO_INTERNO"].includes(pagamento.status)) {
    return json({ error: `Não é possível cancelar pagamento com status ${pagamento.status}` }, 400);
  }

  const { error } = await db.from("btg_pagamentos").update({ status: "CANCELADO" }).eq("id", String(id));
  if (error) return json({ error: "Erro ao cancelar", details: error.message }, 500);
  return json({ success: true, status: "CANCELADO" });
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

    // Auth for all actions
    const userId = requireAuth(req);

    switch (action) {
      case "criar":
        return await handleCriar(body || {}, userId);
      case "listar":
        return await handleListar(body, url, userId);
      case "detalhe":
        return await handleDetalhe(body, url);
      case "aprovar_interno":
        return await handleAprovarInterno(body || {}, userId);
      case "enviar_btg":
        return await handleEnviarBtg(body || {}, userId);
      case "cancelar":
        return await handleCancelar(body || {}, userId);
      default:
        return json(
          { error: `Ação desconhecida: '${action}'. Use: criar, listar, detalhe, aprovar_interno, enviar_btg, cancelar` },
          400
        );
    }
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[btg-pagamentos] Unhandled error:", e);
    return json({ error: "Erro interno", details: String(e) }, 500);
  }
});
