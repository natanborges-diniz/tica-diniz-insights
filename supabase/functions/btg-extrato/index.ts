// supabase/functions/btg-extrato/index.ts
// BTG Pactual Banking — Extrato + Saldo (Fase 5)
// Actions: saldo, extrato, importar, listar, classificar, batimento

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

async function getUserEmpresas(userId: string, admin: boolean): Promise<number[]> {
  if (admin) return [];
  const db = getServiceClient();
  const { data } = await db
    .from("user_empresa_permissions")
    .select("cod_empresa")
    .eq("user_id", userId);
  return (data || []).map((p: { cod_empresa: number }) => p.cod_empresa);
}

// ─── BTG Token + Company helpers ─────────────────────────────
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
    .select("company_id, account_id")
    .eq("cod_empresa", codEmpresa)
    .eq("ativa", true)
    .single();

  if (!data?.company_id) {
    throw json({ error: `Conta bancária BTG não configurada para empresa ${codEmpresa}` }, 400);
  }
  return data.company_id;
}

// ─── ACTION: saldo ───────────────────────────────────────────
async function handleSaldo(req: Request) {
  const userId = requireAuth(req);
  const url = new URL(req.url);
  const codEmpresa = Number(url.searchParams.get("cod_empresa"));
  if (!codEmpresa) return json({ error: "cod_empresa obrigatório" }, 400);

  const accessToken = await getBtgToken(codEmpresa);
  const companyId = await getCompanyId(codEmpresa);
  const { apiBase, isSandbox } = getBtgUrls();

  if (isSandbox) {
    // Sandbox mock
    return json({
      cod_empresa: codEmpresa,
      saldo_disponivel: 125430.50,
      saldo_bloqueado: 3200.00,
      data_consulta: new Date().toISOString(),
      sandbox: true,
    });
  }

  const res = await fetch(
    `${apiBase}/banking/v1/companies/${companyId}/balance`,
    {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    }
  );

  if (!res.ok) {
    const body = await res.text();
    console.error("[btg-extrato] Saldo error:", res.status, body);
    return json({ error: "Erro ao consultar saldo", details: body }, 502);
  }

  const data = await res.json();
  return json({ cod_empresa: codEmpresa, ...data });
}

// ─── ACTION: extrato (consulta BTG) ─────────────────────────
async function handleExtrato(req: Request) {
  const userId = requireAuth(req);
  const url = new URL(req.url);
  const codEmpresa = Number(url.searchParams.get("cod_empresa"));
  const dataInicio = url.searchParams.get("data_inicio");
  const dataFim = url.searchParams.get("data_fim");

  if (!codEmpresa) return json({ error: "cod_empresa obrigatório" }, 400);

  const accessToken = await getBtgToken(codEmpresa);
  const companyId = await getCompanyId(codEmpresa);
  const { apiBase, isSandbox } = getBtgUrls();

  if (isSandbox) {
    // Sandbox mock — retorna lançamentos fake
    const mockEntries = [
      { date: "2026-02-24", description: "TED RECEBIDA - CLIENTE ABC LTDA", amount: 5200.00, type: "CREDITO" },
      { date: "2026-02-24", description: "PIX ENVIADO - FORNECEDOR XYZ", amount: -3100.00, type: "DEBITO" },
      { date: "2026-02-23", description: "BOLETO PAGO - ENERGIA ELETRICA", amount: -890.50, type: "DEBITO" },
      { date: "2026-02-23", description: "PIX RECEBIDO - VENDA OS 92345", amount: 1450.00, type: "CREDITO" },
      { date: "2026-02-22", description: "TED ENVIADA - SALARIOS", amount: -15600.00, type: "DEBITO" },
      { date: "2026-02-22", description: "BOLETO RECEBIDO - CLIENTE DEF", amount: 2800.00, type: "CREDITO" },
      { date: "2026-02-21", description: "PIX RECEBIDO - VENDA OS 92310", amount: 980.00, type: "CREDITO" },
      { date: "2026-02-21", description: "DEBITO AUTOMATICO - INTERNET", amount: -189.90, type: "DEBITO" },
    ];
    return json({ cod_empresa: codEmpresa, lancamentos: mockEntries, sandbox: true });
  }

  const params = new URLSearchParams();
  if (dataInicio) params.set("startDate", dataInicio);
  if (dataFim) params.set("endDate", dataFim);

  const res = await fetch(
    `${apiBase}/banking/v1/companies/${companyId}/statements?${params}`,
    {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    }
  );

  if (!res.ok) {
    const body = await res.text();
    console.error("[btg-extrato] Extrato error:", res.status, body);
    return json({ error: "Erro ao consultar extrato", details: body }, 502);
  }

  const data = await res.json();
  return json({ cod_empresa: codEmpresa, lancamentos: data });
}

// ─── ACTION: importar ────────────────────────────────────────
// Importa lançamentos do extrato para btg_extrato
async function handleImportar(req: Request) {
  const userId = requireAuth(req);
  await requireAdminRole(userId);

  const { cod_empresa, data_inicio, data_fim } = await req.json();
  if (!cod_empresa) return json({ error: "cod_empresa obrigatório" }, 400);

  const accessToken = await getBtgToken(cod_empresa);
  const companyId = await getCompanyId(cod_empresa);
  const { apiBase, isSandbox } = getBtgUrls();

  let lancamentos: Array<{
    date: string; description: string; amount: number; type: string;
    balance_after?: number;
  }> = [];

  if (isSandbox) {
    lancamentos = [
      { date: "2026-02-24", description: "TED RECEBIDA - CLIENTE ABC LTDA", amount: 5200.00, type: "CREDITO", balance_after: 130630.50 },
      { date: "2026-02-24", description: "PIX ENVIADO - FORNECEDOR XYZ", amount: -3100.00, type: "DEBITO", balance_after: 125430.50 },
      { date: "2026-02-23", description: "BOLETO PAGO - ENERGIA ELETRICA", amount: -890.50, type: "DEBITO", balance_after: 128530.50 },
      { date: "2026-02-23", description: "PIX RECEBIDO - VENDA OS 92345", amount: 1450.00, type: "CREDITO", balance_after: 129421.00 },
    ];
  } else {
    const params = new URLSearchParams();
    if (data_inicio) params.set("startDate", data_inicio);
    if (data_fim) params.set("endDate", data_fim);

    const res = await fetch(
      `${apiBase}/banking/v1/companies/${companyId}/statements?${params}`,
      {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      }
    );

    if (!res.ok) {
      const body = await res.text();
      return json({ error: "Erro ao consultar extrato BTG", details: body }, 502);
    }

    const data = await res.json();
    lancamentos = Array.isArray(data) ? data : data.entries || data.lancamentos || [];
  }

  // Insert into btg_extrato
  const db = getServiceClient();
  const rows = lancamentos.map((l) => ({
    cod_empresa,
    data_lancamento: l.date,
    descricao: l.description,
    valor: Math.abs(l.amount),
    tipo: l.amount >= 0 ? "CREDITO" : "DEBITO",
    saldo_apos: l.balance_after || null,
    conciliado: false,
  }));

  if (rows.length === 0) {
    return json({ success: true, importados: 0 });
  }

  const { error } = await db.from("btg_extrato").insert(rows);
  if (error) {
    console.error("[btg-extrato] Insert error:", error);
    return json({ error: "Erro ao importar lançamentos", details: error.message }, 500);
  }

  return json({ success: true, importados: rows.length });
}

// ─── ACTION: listar ──────────────────────────────────────────
// Lista lançamentos já importados na btg_extrato
async function handleListar(req: Request) {
  const userId = requireAuth(req);
  const url = new URL(req.url);
  const codEmpresa = Number(url.searchParams.get("cod_empresa"));
  const dataInicio = url.searchParams.get("data_inicio");
  const dataFim = url.searchParams.get("data_fim");
  const tipo = url.searchParams.get("tipo");
  const conciliado = url.searchParams.get("conciliado");
  const limit = Number(url.searchParams.get("limit") || "200");

  const admin = await isAdmin(userId);
  const empresas = await getUserEmpresas(userId, admin);

  const db = getServiceClient();
  let query = db
    .from("btg_extrato")
    .select("*")
    .order("data_lancamento", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (codEmpresa) {
    if (!admin && !empresas.includes(codEmpresa)) {
      return json({ error: "Sem permissão" }, 403);
    }
    query = query.eq("cod_empresa", codEmpresa);
  } else if (!admin) {
    query = query.in("cod_empresa", empresas);
  }

  if (dataInicio) query = query.gte("data_lancamento", dataInicio);
  if (dataFim) query = query.lte("data_lancamento", dataFim);
  if (tipo) query = query.eq("tipo", tipo);
  if (conciliado !== null && conciliado !== undefined && conciliado !== "") {
    query = query.eq("conciliado", conciliado === "true");
  }

  const { data, error } = await query;
  if (error) {
    return json({ error: "Erro ao listar extrato", details: error.message }, 500);
  }

  return json(data || []);
}

// ─── ACTION: classificar ────────────────────────────────────
// Classifica lançamento por natureza contábil
async function handleClassificar(req: Request) {
  const userId = requireAuth(req);
  await requireAdminRole(userId);

  const { id, natureza } = await req.json();
  if (!id || !natureza) return json({ error: "id e natureza obrigatórios" }, 400);

  const db = getServiceClient();
  const { error } = await db
    .from("btg_extrato")
    .update({ natureza, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return json({ error: "Erro ao classificar", details: error.message }, 500);
  }

  return json({ success: true });
}

// ─── ACTION: conciliar ──────────────────────────────────────
// Marca lançamento como conciliado e opcionalmente vincula referência
async function handleConciliar(req: Request) {
  const userId = requireAuth(req);
  await requireAdminRole(userId);

  const { id, conciliado, referencia_id } = await req.json();
  if (!id) return json({ error: "id obrigatório" }, 400);

  const db = getServiceClient();
  const updateData: Record<string, unknown> = {
    conciliado: conciliado !== false,
    updated_at: new Date().toISOString(),
  };
  if (referencia_id) updateData.referencia_id = referencia_id;

  const { error } = await db.from("btg_extrato").update(updateData).eq("id", id);

  if (error) {
    return json({ error: "Erro ao conciliar", details: error.message }, 500);
  }

  return json({ success: true });
}

// ─── ACTION: resumo ─────────────────────────────────────────
// Resumo do extrato por período (totais crédito/débito, conciliação)
async function handleResumo(req: Request) {
  const userId = requireAuth(req);
  const url = new URL(req.url);
  const codEmpresa = Number(url.searchParams.get("cod_empresa"));
  const dataInicio = url.searchParams.get("data_inicio");
  const dataFim = url.searchParams.get("data_fim");

  if (!codEmpresa) return json({ error: "cod_empresa obrigatório" }, 400);

  const db = getServiceClient();
  let query = db
    .from("btg_extrato")
    .select("*")
    .eq("cod_empresa", codEmpresa);

  if (dataInicio) query = query.gte("data_lancamento", dataInicio);
  if (dataFim) query = query.lte("data_lancamento", dataFim);

  const { data, error } = await query;
  if (error) {
    return json({ error: "Erro ao buscar resumo", details: error.message }, 500);
  }

  const lancamentos = data || [];
  const totalCredito = lancamentos
    .filter((l: { tipo: string }) => l.tipo === "CREDITO")
    .reduce((sum: number, l: { valor: number }) => sum + Number(l.valor), 0);
  const totalDebito = lancamentos
    .filter((l: { tipo: string }) => l.tipo === "DEBITO")
    .reduce((sum: number, l: { valor: number }) => sum + Number(l.valor), 0);
  const totalConciliado = lancamentos.filter((l: { conciliado: boolean }) => l.conciliado).length;
  const totalNaoConciliado = lancamentos.filter((l: { conciliado: boolean }) => !l.conciliado).length;

  // Group by natureza
  const porNatureza: Record<string, { count: number; total: number }> = {};
  lancamentos.forEach((l: { natureza: string | null; valor: number; tipo: string }) => {
    const nat = l.natureza || "Sem classificação";
    if (!porNatureza[nat]) porNatureza[nat] = { count: 0, total: 0 };
    porNatureza[nat].count++;
    porNatureza[nat].total += l.tipo === "DEBITO" ? -Number(l.valor) : Number(l.valor);
  });

  return json({
    cod_empresa: codEmpresa,
    total_lancamentos: lancamentos.length,
    total_credito: totalCredito,
    total_debito: totalDebito,
    saldo_periodo: totalCredito - totalDebito,
    total_conciliado: totalConciliado,
    total_nao_conciliado: totalNaoConciliado,
    percentual_conciliado: lancamentos.length > 0
      ? Math.round((totalConciliado / lancamentos.length) * 100)
      : 0,
    por_natureza: porNatureza,
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
      case "saldo":
        return await handleSaldo(req);
      case "extrato":
        return await handleExtrato(req);
      case "importar":
        return await handleImportar(req);
      case "listar":
        return await handleListar(req);
      case "classificar":
        return await handleClassificar(req);
      case "conciliar":
        return await handleConciliar(req);
      case "resumo":
        return await handleResumo(req);
      default:
        return json(
          { error: `Ação desconhecida: '${action}'. Use: saldo, extrato, importar, listar, classificar, conciliar, resumo` },
          400
        );
    }
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[btg-extrato] Unhandled error:", e);
    return json({ error: "Erro interno", details: String(e) }, 500);
  }
});
