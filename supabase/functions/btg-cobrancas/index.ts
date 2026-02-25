// supabase/functions/btg-cobrancas/index.ts
// BTG Pactual Banking — Cobranças / Boletos (Fase 3)
// Actions: emitir, listar, detalhe, cancelar, segunda_via

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
    throw json({ error: `Empresa ${codEmpresa} não autenticada no BTG.` }, 400);
  }

  if (new Date(data.expires_at) < new Date()) {
    throw json({ error: `Token BTG expirado para empresa ${codEmpresa}.` }, 401);
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
    throw json({ error: `Conta BTG não configurada para empresa ${codEmpresa}` }, 400);
  }

  return data.company_id;
}

// ─── ACTION: emitir ──────────────────────────────────────────
// Emite boleto/cobrança via API BTG e grava internamente
async function handleEmitir(req: Request) {
  const userId = requireAuth(req);
  await requireAdminRole(userId);

  const body = await req.json();
  const {
    cod_empresa,
    valor,
    data_vencimento,
    sacado_nome,
    sacado_documento,
    parcela_id,
  } = body;

  if (!cod_empresa || !valor || !data_vencimento || !sacado_documento) {
    return json(
      { error: "cod_empresa, valor, data_vencimento e sacado_documento são obrigatórios" },
      400
    );
  }

  const accessToken = await getBtgToken(cod_empresa);
  const companyId = await getCompanyId(cod_empresa);
  const { apiBase } = getBtgUrls();

  // Build BTG receivable payload
  const btgPayload = {
    amount: valor,
    dueDate: data_vencimento,
    payer: {
      name: sacado_nome || "",
      document: sacado_documento,
    },
  };

  const btgRes = await fetch(
    `${apiBase}/banking/v1/companies/${companyId}/receivables`,
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
  try {
    btgData = JSON.parse(btgBody);
  } catch {
    // non-JSON
  }

  if (!btgRes.ok) {
    console.error("[btg-cobrancas] BTG API error:", btgRes.status, btgBody);
    return json(
      { error: "BTG rejeitou a emissão", btg_status: btgRes.status, details: btgData },
      502
    );
  }

  const btgReceivableId = (btgData.id || btgData.receivableId || "") as string;
  const linhaDigitavel = (btgData.digitableLine || btgData.linha_digitavel || "") as string;
  const urlBoleto = (btgData.url || btgData.boletoUrl || "") as string;

  const db = getServiceClient();
  const { data, error } = await db
    .from("btg_cobrancas")
    .insert({
      cod_empresa,
      btg_receivable_id: btgReceivableId || null,
      valor,
      data_vencimento,
      sacado_nome: sacado_nome || null,
      sacado_documento,
      linha_digitavel: linhaDigitavel || null,
      url_boleto: urlBoleto || null,
      status: "EMITIDO",
      parcela_id: parcela_id || null,
    })
    .select()
    .single();

  if (error) {
    console.error("[btg-cobrancas] Insert error:", error);
    return json({ error: "Erro ao gravar cobrança", details: error.message }, 500);
  }

  return json({ success: true, cobranca: data }, 201);
}

// ─── ACTION: listar ──────────────────────────────────────────
async function handleListar(req: Request) {
  const userId = requireAuth(req);
  const url = new URL(req.url);
  const codEmpresa = url.searchParams.get("cod_empresa");
  const status = url.searchParams.get("status");
  const limit = Number(url.searchParams.get("limit") || "50");

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
    .from("btg_cobrancas")
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
    return json({ error: "Erro ao listar cobranças", details: error.message }, 500);
  }

  return json(data || []);
}

// ─── ACTION: detalhe ─────────────────────────────────────────
async function handleDetalhe(req: Request) {
  requireAuth(req);
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ error: "id obrigatório" }, 400);

  const db = getServiceClient();
  const { data, error } = await db
    .from("btg_cobrancas")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return json({ error: "Cobrança não encontrada" }, 404);
  return json(data);
}

// ─── ACTION: cancelar ────────────────────────────────────────
async function handleCancelar(req: Request) {
  const userId = requireAuth(req);
  await requireAdminRole(userId);

  const { id } = await req.json();
  if (!id) return json({ error: "id obrigatório" }, 400);

  const db = getServiceClient();
  const { data: cobranca } = await db
    .from("btg_cobrancas")
    .select("status, cod_empresa, btg_receivable_id")
    .eq("id", id)
    .single();

  if (!cobranca) return json({ error: "Cobrança não encontrada" }, 404);
  if (cobranca.status !== "EMITIDO") {
    return json({ error: `Não é possível cancelar cobrança com status ${cobranca.status}` }, 400);
  }

  // Cancelar no BTG se tiver ID
  if (cobranca.btg_receivable_id) {
    try {
      const accessToken = await getBtgToken(cobranca.cod_empresa);
      const companyId = await getCompanyId(cobranca.cod_empresa);
      const { apiBase } = getBtgUrls();

      await fetch(
        `${apiBase}/banking/v1/companies/${companyId}/receivables/${cobranca.btg_receivable_id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
    } catch (e) {
      console.warn("[btg-cobrancas] Erro ao cancelar no BTG (prosseguindo):", e);
    }
  }

  const { error } = await db
    .from("btg_cobrancas")
    .update({ status: "CANCELADO" })
    .eq("id", id);

  if (error) return json({ error: "Erro ao cancelar", details: error.message }, 500);
  return json({ success: true, status: "CANCELADO" });
}

// ─── ACTION: segunda_via ─────────────────────────────────────
// Consulta URL atualizada do boleto no BTG
async function handleSegundaVia(req: Request) {
  requireAuth(req);
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ error: "id obrigatório" }, 400);

  const db = getServiceClient();
  const { data: cobranca } = await db
    .from("btg_cobrancas")
    .select("*")
    .eq("id", id)
    .single();

  if (!cobranca) return json({ error: "Cobrança não encontrada" }, 404);
  if (!cobranca.btg_receivable_id) {
    return json({ error: "Cobrança sem ID BTG — não é possível gerar segunda via" }, 400);
  }

  const accessToken = await getBtgToken(cobranca.cod_empresa);
  const companyId = await getCompanyId(cobranca.cod_empresa);
  const { apiBase } = getBtgUrls();

  const btgRes = await fetch(
    `${apiBase}/banking/v1/companies/${companyId}/receivables/${cobranca.btg_receivable_id}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!btgRes.ok) {
    return json({ error: "Erro ao consultar BTG", btg_status: btgRes.status }, 502);
  }

  const btgData = await btgRes.json();
  const urlBoleto = (btgData.url || btgData.boletoUrl || cobranca.url_boleto || "") as string;

  // Atualizar URL se mudou
  if (urlBoleto && urlBoleto !== cobranca.url_boleto) {
    await db
      .from("btg_cobrancas")
      .update({ url_boleto: urlBoleto })
      .eq("id", id);
  }

  return json({
    url_boleto: urlBoleto,
    linha_digitavel: cobranca.linha_digitavel,
    btg_data: btgData,
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

    if (!action && req.method === "POST") {
      const cloned = req.clone();
      try {
        const body = await cloned.json();
        action = body.action || "";
      } catch {
        // no-op
      }
    }

    switch (action) {
      case "emitir":
        return await handleEmitir(req);
      case "listar":
        return await handleListar(req);
      case "detalhe":
        return await handleDetalhe(req);
      case "cancelar":
        return await handleCancelar(req);
      case "segunda_via":
        return await handleSegundaVia(req);
      default:
        return json(
          { error: `Ação desconhecida: '${action}'. Use: emitir, listar, detalhe, cancelar, segunda_via` },
          400
        );
    }
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[btg-cobrancas] Unhandled error:", e);
    return json({ error: "Erro interno", details: String(e) }, 500);
  }
});
