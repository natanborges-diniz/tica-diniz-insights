// supabase/functions/btg-extrato/index.ts
// BTG Pactual Banking — Extrato + Saldo (endpoints oficiais v2)
// Paths: /{CNPJ}/banking/accounts, /{CNPJ}/banking/accounts/{accountId}/balances|statements
// Actions: contas, saldo, extrato, importar, listar, classificar, conciliar, resumo

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

// ─── Config helpers ─────────────────────────────────────────
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

async function getUserEmpresas(userId: string, admin: boolean): Promise<number[]> {
  if (admin) return [];
  const db = getServiceClient();
  const { data } = await db.from("user_empresa_permissions").select("cod_empresa").eq("user_id", userId);
  return (data || []).map((p: { cod_empresa: number }) => p.cod_empresa);
}

async function getBtgToken(codEmpresa: number): Promise<string> {
  const db = getServiceClient();
  const { data } = await db.from("btg_tokens").select("access_token, expires_at").eq("cod_empresa", codEmpresa).single();
  if (!data) throw json({ error: `Empresa ${codEmpresa} não autenticada no BTG.` }, 400);
  if (new Date(data.expires_at) < new Date()) throw json({ error: `Token BTG expirado para empresa ${codEmpresa}.` }, 401);
  return data.access_token;
}

// ─── CNPJ helper (companyId for BTG API = CNPJ sem pontuação) ──
async function getCnpj(codEmpresa: number): Promise<string> {
  const db = getServiceClient();
  const { data: conta } = await db.from("btg_contas_bancarias").select("cnpj").eq("cod_empresa", codEmpresa).eq("ativa", true).single();
  if (conta?.cnpj) return conta.cnpj.replace(/\D/g, "");
  const { data: emp } = await db.from("empresa").select("cnpj").eq("cod_empresa", codEmpresa).single();
  if (emp?.cnpj) return emp.cnpj.replace(/\D/g, "");
  throw json({ error: `CNPJ não encontrado para empresa ${codEmpresa}. Configure na tabela de empresas.` }, 400);
}

async function getAccountId(codEmpresa: number): Promise<string> {
  const db = getServiceClient();
  const { data } = await db.from("btg_contas_bancarias").select("account_id").eq("cod_empresa", codEmpresa).eq("ativa", true).single();
  if (!data?.account_id) throw json({ error: `Account ID não configurado para empresa ${codEmpresa}. Execute a action 'contas' primeiro.` }, 400);
  return data.account_id;
}

// ─── Param helper ────────────────────────────────────────────
function getParam(body: Record<string, unknown> | null, url: URL, key: string): string | null {
  if (body && body[key] !== undefined && body[key] !== null) return String(body[key]);
  return url.searchParams.get(key);
}

// ─── Dedup helper ────────────────────────────────────────────
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// dedupe_key = sha256(cod_empresa|YYYY-MM-DD|valor 2 casas|tipo|descricao|n), onde n é o
// índice de ocorrência da mesma combinação no dia. DEVE espelhar exatamente o backfill SQL
// da migration 20260703120000 (E1 — SPEC_P1_CONCILIACAO_3VIAS.md).
async function assignDedupeKeys(rows: Array<Record<string, unknown>>): Promise<void> {
  const counters = new Map<string, number>();
  for (const row of rows) {
    const base = `${row.cod_empresa}|${row.data_lancamento}|${Number(row.valor).toFixed(2)}|${row.tipo}|${row.descricao ?? ""}`;
    const n = counters.get(base) ?? 0;
    counters.set(base, n + 1);
    row.dedupe_key = await sha256Hex(`${base}|${n}`);
  }
}

// ─── ACTION: contas (construir e salvar account_id) ─────────
async function handleContas(body: Record<string, unknown> | null, url: URL, userId: string) {
  await requireAdminRole(userId);
  const codEmpresa = Number(getParam(body, url, "cod_empresa"));
  const agencia = getParam(body, url, "agencia");
  const conta = getParam(body, url, "conta");
  if (!codEmpresa) return json({ error: "cod_empresa obrigatório" }, 400);
  if (!agencia || !conta) return json({ error: "agencia e conta são obrigatórios para construir o accountId" }, 400);

  const cnpj = await getCnpj(codEmpresa);
  const accountId = `${cnpj}-208-${agencia}-${conta}`;

  const db = getServiceClient();
  const { error } = await db.from("btg_contas_bancarias")
    .update({ account_id: accountId, agencia, conta })
    .eq("cod_empresa", codEmpresa);

  if (error) {
    console.error("[btg-extrato] Erro ao salvar account_id:", error);
    return json({ error: "Erro ao salvar account_id", details: error.message }, 500);
  }

  console.log(`[btg-extrato] Account ID ${accountId} salvo para empresa ${codEmpresa}`);
  return json({ cod_empresa: codEmpresa, account_id: accountId, success: true });
}

// ─── ACTION: saldo ───────────────────────────────────────────
// BTG v2 Response: { accountId, available: { amount, currency }, blocked: { amount, currency, blockedDate } }
async function handleSaldo(body: Record<string, unknown> | null, url: URL) {
  const codEmpresa = Number(getParam(body, url, "cod_empresa"));
  if (!codEmpresa) return json({ error: "cod_empresa obrigatório" }, 400);

  const { apiBase, isSandbox } = await getBtgConfig();

  if (isSandbox) {
    return json({
      cod_empresa: codEmpresa,
      accountId: "sandbox-account",
      available: { amount: 125430.50, currency: "BRL" },
      blocked: { amount: 3200.00, currency: "BRL", blockedDate: null },
      data_consulta: new Date().toISOString(),
      sandbox: true,
    });
  }

  const accessToken = await getBtgToken(codEmpresa);
  const cnpj = await getCnpj(codEmpresa);
  const accountId = await getAccountId(codEmpresa);

  const res = await fetch(
    `${apiBase}/${cnpj}/banking/accounts/${accountId}/balances`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }
  );

  if (!res.ok) {
    const resBody = await res.text();
    console.error("[btg-extrato] Saldo error:", res.status, resBody);
    return json({ error: "Erro ao consultar saldo", status: res.status, details: resBody }, 502);
  }

  // BTG returns: { accountId, available: { amount, currency }, blocked: { amount, currency, blockedDate } }
  const data = await res.json();
  return json({
    cod_empresa: codEmpresa,
    accountId: data.accountId,
    available: data.available || { amount: 0, currency: "BRL" },
    blocked: data.blocked || { amount: 0, currency: "BRL", blockedDate: null },
    data_consulta: new Date().toISOString(),
  });
}

// ─── Normalize BTG statement movements ──────────────────────
function flattenStatements(data: unknown): Array<Record<string, unknown>> {
  if (!data || typeof data !== "object") return [];
  const d = data as Record<string, unknown>;

  // Direct array
  if (Array.isArray(d)) return d;

  // BTG v2: { data: { dailyMovements: [{ date, movements: [...] }] } }
  const inner = d.data as Record<string, unknown> | undefined;
  if (inner?.dailyMovements && Array.isArray(inner.dailyMovements)) {
    const items: Record<string, unknown>[] = [];
    for (const day of inner.dailyMovements as Array<Record<string, unknown>>) {
      const dayDate = day.date ? String(day.date).substring(0, 10) : null;
      if (Array.isArray(day.movements)) {
        for (const mov of day.movements as Array<Record<string, unknown>>) {
          items.push({ ...mov, _dayDate: dayDate });
        }
      }
    }
    return items;
  }

  // Fallback keys
  for (const key of ["entries", "transactions", "lancamentos", "items", "statement"]) {
    if (Array.isArray(d[key])) return d[key] as Record<string, unknown>[];
  }
  if (Array.isArray(d.data)) return d.data as Record<string, unknown>[];

  return [];
}

// ─── Normalize a single movement to our schema ─────────────
function normalizeMovement(l: Record<string, unknown>, codEmpresa: number) {
  // BTG v2 fields: dateHour, description, amount, type ("credit"/"debit"), _dayDate (injected)
  const date = l._dayDate || l.dateHour || l.date || l.bookingDate || l.transactionDate || l.data || l.dataLancamento || null;
  const desc = l.description || l.remittanceInformation || l.descricao || l.detail || "";
  const rawAmount = l.amount || l.transactionAmount || l.valor || 0;
  const amount = typeof rawAmount === "object" && rawAmount !== null
    ? Number((rawAmount as Record<string, unknown>).amount || 0)
    : Number(rawAmount);
  const balanceAfter = l.balance_after || l.balanceAfterTransaction || l.saldo_apos || null;
  const rawType = l.type || l.creditDebitIndicator || l.tipo || "";
  const txnId = l.transactionId || l.entryId || l.transactionIdentification || l.id || null;

  const isCredit = String(rawType).toLowerCase() === "credit" ||
    String(rawType).toUpperCase().includes("CRED") ||
    String(rawType).toUpperCase().includes("CRDT") ||
    String(rawType).toUpperCase() === "C" ||
    (!rawType && amount > 0);

  return {
    cod_empresa: codEmpresa,
    data_lancamento: date ? String(date).substring(0, 10) : new Date().toISOString().substring(0, 10),
    descricao: String(desc),
    valor: Math.abs(amount),
    tipo: isCredit ? "CREDITO" : "DEBITO",
    saldo_apos: balanceAfter != null ? Number(balanceAfter) : null,
    conciliado: false,
    status_conciliacao: "PENDENTE",
    transaction_id: txnId != null ? String(txnId) : null,
    dados_extras: l,
  };
}

// ─── ACTION: extrato (consulta BTG) ─────────────────────────
async function handleExtrato(body: Record<string, unknown> | null, url: URL) {
  const codEmpresa = Number(getParam(body, url, "cod_empresa"));
  const dataInicio = getParam(body, url, "data_inicio");
  const dataFim = getParam(body, url, "data_fim");

  if (!codEmpresa) return json({ error: "cod_empresa obrigatório" }, 400);

  const { apiBase, isSandbox } = await getBtgConfig();

  if (isSandbox) {
    const mockEntries = [
      { date: "2026-03-09", description: "TED RECEBIDA - CLIENTE ABC LTDA", amount: 5200.00, type: "credit" },
      { date: "2026-03-09", description: "PIX ENVIADO - FORNECEDOR XYZ", amount: 3100.00, type: "debit" },
      { date: "2026-03-08", description: "BOLETO PAGO - ENERGIA ELETRICA", amount: 890.50, type: "debit" },
      { date: "2026-03-08", description: "PIX RECEBIDO - VENDA OS 92345", amount: 1450.00, type: "credit" },
      { date: "2026-03-07", description: "TED ENVIADA - SALARIOS", amount: 15800.00, type: "debit" },
      { date: "2026-03-07", description: "BOLETO RECEBIDO - CLIENTE DEF", amount: 3200.00, type: "credit" },
      { date: "2026-03-06", description: "PIX RECEBIDO - VENDA OS 92301", amount: 980.00, type: "credit" },
      { date: "2026-03-05", description: "DEBITO AUTOMATICO - TELECOM", amount: 299.90, type: "debit" },
    ];
    return json({ cod_empresa: codEmpresa, lancamentos: mockEntries, sandbox: true });
  }

  const accessToken = await getBtgToken(codEmpresa);
  const cnpj = await getCnpj(codEmpresa);
  const accountId = await getAccountId(codEmpresa);

  const params = new URLSearchParams();
  if (dataInicio) params.set("startDate", dataInicio);
  if (dataFim) params.set("endDate", dataFim);

  const qs = params.toString() ? `?${params}` : "";
  const res = await fetch(
    `${apiBase}/${cnpj}/banking/accounts/${accountId}/statements${qs}`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }
  );

  if (!res.ok) {
    const resBody = await res.text();
    console.error("[btg-extrato] Extrato error:", res.status, resBody);
    return json({ error: "Erro ao consultar extrato", status: res.status, details: resBody }, 502);
  }

  const data = await res.json();
  console.log("[btg-extrato] handleExtrato raw keys:", Object.keys(data || {}));

  const items = flattenStatements(data);
  console.log(`[btg-extrato] Parsed ${items.length} movements`);

  return json({ cod_empresa: codEmpresa, lancamentos: items, raw_keys: Object.keys(data || {}) });
}

// ─── ACTION: importar ────────────────────────────────────────
async function handleImportar(body: Record<string, unknown>, userId: string) {
  await requireAdminRole(userId);

  const cod_empresa = Number(body.cod_empresa);
  let data_inicio = body.data_inicio ? String(body.data_inicio) : null;
  const data_fim = body.data_fim ? String(body.data_fim) : null;
  if (!cod_empresa) return json({ error: "cod_empresa obrigatório" }, 400);

  // Overlap de 3 dias na janela: com dedup por dedupe_key, reimportar é seguro e
  // garante que movimentos tardios do fim da janela anterior não se percam.
  if (data_inicio) {
    const d = new Date(`${data_inicio}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 3);
    data_inicio = d.toISOString().slice(0, 10);
  }

  const { apiBase, isSandbox } = await getBtgConfig();

  let rawItems: Array<Record<string, unknown>> = [];

  if (isSandbox) {
    rawItems = [
      { date: "2026-03-09", description: "TED RECEBIDA - CLIENTE ABC LTDA", amount: 5200.00, type: "credit", balance_after: 130630.50 },
      { date: "2026-03-09", description: "PIX ENVIADO - FORNECEDOR XYZ", amount: 3100.00, type: "debit", balance_after: 125430.50 },
      { date: "2026-03-08", description: "BOLETO PAGO - ENERGIA ELETRICA", amount: 890.50, type: "debit", balance_after: 128530.50 },
      { date: "2026-03-08", description: "PIX RECEBIDO - VENDA OS 92345", amount: 1450.00, type: "credit", balance_after: 129421.00 },
      { date: "2026-03-07", description: "TED ENVIADA - SALARIOS", amount: 15800.00, type: "debit", balance_after: 127971.00 },
      { date: "2026-03-07", description: "BOLETO RECEBIDO - CLIENTE DEF", amount: 3200.00, type: "credit", balance_after: 143771.00 },
      { date: "2026-03-06", description: "PIX RECEBIDO - VENDA OS 92301", amount: 980.00, type: "credit", balance_after: 140571.00 },
      { date: "2026-03-05", description: "DEBITO AUTOMATICO - TELECOM", amount: 299.90, type: "debit", balance_after: 139591.00 },
    ];
  } else {
    const accessToken = await getBtgToken(cod_empresa);
    const cnpj = await getCnpj(cod_empresa);
    const accountId = await getAccountId(cod_empresa);
    const params = new URLSearchParams();
    if (data_inicio) params.set("startDate", data_inicio);
    if (data_fim) params.set("endDate", data_fim);

    const qs = params.toString() ? `?${params}` : "";
    const res = await fetch(
      `${apiBase}/${cnpj}/banking/accounts/${accountId}/statements${qs}`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }
    );

    if (!res.ok) {
      const resBody = await res.text();
      return json({ error: "Erro ao consultar extrato BTG", details: resBody }, 502);
    }

    const data = await res.json();
    console.log("[btg-extrato] Raw statements keys:", Object.keys(data || {}));
    rawItems = flattenStatements(data);
    console.log(`[btg-extrato] Parsed ${rawItems.length} items from BTG`);
  }

  if (rawItems.length > 0) {
    console.log("[btg-extrato] First item keys:", Object.keys(rawItems[0]));
  }

  const rows = rawItems
    .map((l) => normalizeMovement(l, cod_empresa))
    .filter((r) => r.data_lancamento && r.valor > 0);

  if (rows.length === 0) return json({ success: true, importados: 0, duplicados: 0, raw_count: rawItems.length });

  await assignDedupeKeys(rows as Array<Record<string, unknown>>);

  // Upsert por dedupe_key: duplicata é ignorada e preserva o status_conciliacao existente.
  const db = getServiceClient();
  const { data: inserted, error } = await db
    .from("btg_extrato")
    .upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true })
    .select("id");
  if (error) {
    console.error("[btg-extrato] Upsert error:", error);
    return json({ error: "Erro ao importar lançamentos", details: error.message }, 500);
  }

  const importados = inserted?.length ?? 0;
  return json({ success: true, importados, duplicados: rows.length - importados });
}

// ─── ACTION: listar ──────────────────────────────────────────
async function handleListar(body: Record<string, unknown> | null, url: URL, userId: string) {
  const codEmpresa = Number(getParam(body, url, "cod_empresa") || "0");
  const dataInicio = getParam(body, url, "data_inicio");
  const dataFim = getParam(body, url, "data_fim");
  const tipo = getParam(body, url, "tipo");
  const conciliado = getParam(body, url, "conciliado");
  const limit = Number(getParam(body, url, "limit") || "200");

  const admin = await isAdmin(userId);
  const empresas = await getUserEmpresas(userId, admin);

  const db = getServiceClient();
  let query = db.from("btg_extrato").select("*").order("data_lancamento", { ascending: false }).order("created_at", { ascending: false }).limit(limit);

  if (codEmpresa) {
    if (!admin && !empresas.includes(codEmpresa)) return json({ error: "Sem permissão" }, 403);
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
  if (error) return json({ error: "Erro ao listar extrato", details: error.message }, 500);
  return json(data || []);
}

// ─── ACTION: classificar ────────────────────────────────────
async function handleClassificar(body: Record<string, unknown>, userId: string) {
  await requireAdminRole(userId);
  const { id, natureza } = body;
  if (!id || !natureza) return json({ error: "id e natureza obrigatórios" }, 400);

  const db = getServiceClient();
  const { error } = await db.from("btg_extrato").update({ natureza: String(natureza), updated_at: new Date().toISOString() }).eq("id", String(id));
  if (error) return json({ error: "Erro ao classificar", details: error.message }, 500);
  return json({ success: true });
}

// ─── ACTION: conciliar ──────────────────────────────────────
async function handleConciliar(body: Record<string, unknown>, userId: string) {
  await requireAdminRole(userId);
  const { id, conciliado, referencia_id } = body;
  if (!id) return json({ error: "id obrigatório" }, 400);

  const db = getServiceClient();
  const marcando = conciliado !== false;
  const updateData: Record<string, unknown> = {
    conciliado: marcando,
    status_conciliacao: marcando ? "CONCILIADO_MANUAL" : "PENDENTE",
    metodo_conciliacao: marcando ? "MANUAL" : null,
    conciliado_por: marcando ? userId : null,
    conciliado_em: marcando ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  if (referencia_id) updateData.referencia_id = String(referencia_id);

  const { error } = await db.from("btg_extrato").update(updateData).eq("id", String(id));
  if (error) return json({ error: "Erro ao conciliar", details: error.message }, 500);
  return json({ success: true });
}

// ─── ACTION: resumo ─────────────────────────────────────────
async function handleResumo(body: Record<string, unknown> | null, url: URL) {
  const codEmpresa = Number(getParam(body, url, "cod_empresa") || "0");
  const dataInicio = getParam(body, url, "data_inicio");
  const dataFim = getParam(body, url, "data_fim");

  if (!codEmpresa) return json({ error: "cod_empresa obrigatório" }, 400);

  const db = getServiceClient();
  let query = db.from("btg_extrato").select("*").eq("cod_empresa", codEmpresa);
  if (dataInicio) query = query.gte("data_lancamento", dataInicio);
  if (dataFim) query = query.lte("data_lancamento", dataFim);

  const { data, error } = await query;
  if (error) return json({ error: "Erro ao buscar resumo", details: error.message }, 500);

  const lancamentos = data || [];
  const totalCredito = lancamentos.filter((l: { tipo: string }) => l.tipo === "CREDITO").reduce((sum: number, l: { valor: number }) => sum + Number(l.valor), 0);
  const totalDebito = lancamentos.filter((l: { tipo: string }) => l.tipo === "DEBITO").reduce((sum: number, l: { valor: number }) => sum + Number(l.valor), 0);
  const totalConciliado = lancamentos.filter((l: { conciliado: boolean }) => l.conciliado).length;
  const totalNaoConciliado = lancamentos.filter((l: { conciliado: boolean }) => !l.conciliado).length;

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
    percentual_conciliado: lancamentos.length > 0 ? Math.round((totalConciliado / lancamentos.length) * 100) : 0,
    por_natureza: porNatureza,
  });
}

// ─── ACTION: conciliar_auto_lancamentos ─────────────────────
// Matches non-reconciled btg_extrato entries with lancamentos_financeiros
// by valor + data + tipo (CREDITO→RECEBER, DEBITO→PAGAR) + description similarity
async function handleConciliarAutoLancamentos(body: Record<string, unknown>, userId: string) {
  await requireAdminRole(userId);
  const codEmpresa = Number(body.cod_empresa);
  if (!codEmpresa) return json({ error: "cod_empresa obrigatório" }, 400);

  const db = getServiceClient();

  // Get non-reconciled extrato entries
  const { data: extratoEntries, error: eErr } = await db
    .from("btg_extrato")
    .select("*")
    .eq("cod_empresa", codEmpresa)
    .eq("conciliado", false)
    .order("data_lancamento", { ascending: true });

  if (eErr) return json({ error: eErr.message }, 500);
  if (!extratoEntries || extratoEntries.length === 0) {
    return json({ conciliados: 0, lancamentos_criados: 0 });
  }

  // Get candidate lancamentos (PREVISTO or AUTORIZADO, not yet linked to extrato)
  const { data: lancamentos, error: lErr } = await db
    .from("lancamentos_financeiros")
    .select("*")
    .eq("cod_empresa", codEmpresa)
    .in("status", ["PREVISTO", "AUTORIZADO", "PROCESSANDO"])
    .is("btg_extrato_id", null)
    .order("data_vencimento", { ascending: true });

  if (lErr) return json({ error: lErr.message }, 500);

  // Index lancamentos by valor|tipo for matching
  const lancIndex = new Map<string, Array<Record<string, unknown>>>();
  for (const l of (lancamentos || [])) {
    const tipoExtrato = l.tipo === "RECEBER" ? "CREDITO" : "DEBITO";
    const key = `${Number(l.valor).toFixed(2)}|${tipoExtrato}`;
    if (!lancIndex.has(key)) lancIndex.set(key, []);
    lancIndex.get(key)!.push(l);
  }

  let conciliados = 0;
  let lancamentosCriados = 0;

  for (const entry of extratoEntries) {
    const key = `${Number(entry.valor).toFixed(2)}|${entry.tipo}`;
    const candidates = lancIndex.get(key);

    if (candidates && candidates.length > 0) {
      // Best match: closest date
      const entryDate = new Date(entry.data_lancamento).getTime();
      candidates.sort((a, b) => {
        const da = Math.abs(new Date(a.data_vencimento as string).getTime() - entryDate);
        const db2 = Math.abs(new Date(b.data_vencimento as string).getTime() - entryDate);
        return da - db2;
      });

      const match = candidates[0];
      const dateDiff = Math.abs(new Date(match.data_vencimento as string).getTime() - entryDate);

      // Only match if within 7 days
      if (dateDiff <= 7 * 86400000) {
        // Update extrato as reconciled
        await db.from("btg_extrato").update({
          conciliado: true,
          status_conciliacao: "CONCILIADO_AUTO",
          metodo_conciliacao: "TOLERANCIA",
          conciliado_em: new Date().toISOString(),
          referencia_id: match.id as string,
        }).eq("id", entry.id);

        // Update lancamento as BAIXADO
        const isReceber = match.tipo === "RECEBER";
        await db.from("lancamentos_financeiros").update({
          status: "BAIXADO",
          btg_extrato_id: entry.id,
          valor_pago: entry.valor,
          data_pagamento: entry.data_lancamento,
          data_baixa: entry.data_lancamento,
          baixado_por: userId,
          baixado_em: new Date().toISOString(),
        }).eq("id", match.id as string);

        // Remove matched lancamento from index
        const idx = candidates.indexOf(match);
        if (idx > -1) candidates.splice(idx, 1);
        if (candidates.length === 0) lancIndex.delete(key);

        conciliados++;
      }
    }

    // If no match found, create a PREVISTO lancamento for unmatched entries
    if (!lancIndex.has(key) || (lancIndex.get(key)?.length === 0)) {
      // Only create for entries we didn't just match
      const { data: checkConciliado } = await db
        .from("btg_extrato")
        .select("conciliado")
        .eq("id", entry.id)
        .single();

      if (checkConciliado && !checkConciliado.conciliado) {
        const tipoLanc = entry.tipo === "CREDITO" ? "RECEBER" : "PAGAR";
        const natureza = entry.tipo === "CREDITO" ? "RECEITA_BRUTA" : "DESPESAS_OPERACIONAIS";

        await db.from("lancamentos_financeiros").insert({
          cod_empresa: codEmpresa,
          tipo: tipoLanc,
          descricao: entry.descricao || `Extrato - ${entry.tipo}`,
          valor: entry.valor,
          data_vencimento: entry.data_lancamento,
          data_emissao: entry.data_lancamento,
          natureza,
          origem: "EXTRATO",
          origem_id: entry.id,
          btg_extrato_id: entry.id,
          status: "BAIXADO",
          valor_pago: entry.valor,
          data_pagamento: entry.data_lancamento,
          data_baixa: entry.data_lancamento,
          baixado_por: userId,
          baixado_em: new Date().toISOString(),
          requer_validacao: true,
          criado_por: userId,
        });

        // Mark extrato as conciliado
        await db.from("btg_extrato").update({
          conciliado: true,
          status_conciliacao: "CONCILIADO_AUTO",
          metodo_conciliacao: "REGRA",
          conciliado_em: new Date().toISOString(),
        }).eq("id", entry.id);

        lancamentosCriados++;
      }
    }
  }

  return json({ conciliados, lancamentos_criados: lancamentosCriados, total_extrato: extratoEntries.length });
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
      case "contas":
        return await handleContas(body, url, userId);
      case "saldo":
        return await handleSaldo(body, url);
      case "extrato":
        return await handleExtrato(body, url);
      case "importar":
        return await handleImportar(body || {}, userId);
      case "listar":
        return await handleListar(body, url, userId);
      case "classificar":
        return await handleClassificar(body || {}, userId);
      case "conciliar":
        return await handleConciliar(body || {}, userId);
      case "conciliar_auto_lancamentos":
        return await handleConciliarAutoLancamentos(body || {}, userId);
      case "resumo":
        return await handleResumo(body, url);
      default:
        return json({ error: `Ação desconhecida: '${action}'. Use: contas, saldo, extrato, importar, listar, classificar, conciliar, conciliar_auto_lancamentos, resumo` }, 400);
    }
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[btg-extrato] Unhandled error:", e);
    return json({ error: "Erro interno", details: String(e) }, 500);
  }
});
