// supabase/functions/btg-cobrancas/index.ts
// BTG Pactual Banking — Cobranças / Boletos (endpoints oficiais v2)
// Path: /{CNPJ}/banking/collections
// Actions: emitir, listar, detalhe, cancelar, segunda_via, importar
// BTG Collection Types: BANKSLIP, BANKSLIP_QRCODE, DUE_DATE_PIX
// BTG Status: CREATED, PROCESSING, PAID, OVERDUE, CANCELED, FAILED, EXPIRED

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { gerarParcelasBoleto, sanitizarCpf, podeDisparar } from "../_shared/crediario.ts";
import { hojeBrt } from "../_shared/agendamento.ts";

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

async function getAccountId(codEmpresa: number): Promise<string> {
  const db = getServiceClient();
  const { data } = await db.from("btg_contas_bancarias").select("account_id").eq("cod_empresa", codEmpresa).eq("ativa", true).single();
  if (!data?.account_id) throw json({ error: `Account ID não configurado para empresa ${codEmpresa}.` }, 400);
  return data.account_id;
}

function getParam(body: Record<string, unknown> | null, url: URL, key: string): string | null {
  if (body && body[key] !== undefined && body[key] !== null) return String(body[key]);
  return url.searchParams.get(key);
}

// ─── ACTION: emitir ──────────────────────────────────────────
// BTG POST /collections expects:
// { amount, type (BANKSLIP|BANKSLIP_QRCODE|DUE_DATE_PIX), dueDate, overDueDate,
//   payer: { name, personType (J|F), document },
//   account: { accountId },
//   detail: { bankslip: {} } (for BANKSLIP type),
//   description, deliveryMediums, interest, fine, discounts }
async function handleEmitir(body: Record<string, unknown>, userId: string) {
  await requireAdminRole(userId);

  const { cod_empresa, valor, data_vencimento, data_expiracao, sacado_nome, sacado_documento,
    parcela_id, tipo_cobranca, descricao } = body;

  if (!cod_empresa || !valor || !data_vencimento || !sacado_documento) {
    return json({ error: "cod_empresa, valor, data_vencimento e sacado_documento são obrigatórios" }, 400);
  }

  const r = await emitirCore({
    cod_empresa: Number(cod_empresa),
    valor: Number(valor),
    data_vencimento: String(data_vencimento),
    data_expiracao: data_expiracao ? String(data_expiracao) : null,
    sacado_nome: sacado_nome ? String(sacado_nome) : null,
    sacado_documento: String(sacado_documento),
    parcela_id: parcela_id ? String(parcela_id) : null,
    tipo_cobranca: String(tipo_cobranca || "BANKSLIP"),
    descricao: descricao ? String(descricao) : null,
    userId,
  });
  return json({ success: true, ...r }, 201);
}

interface EmitirCoreArgs {
  cod_empresa: number;
  valor: number;
  data_vencimento: string;
  data_expiracao?: string | null;
  sacado_nome?: string | null;
  sacado_documento: string;
  parcela_id?: string | null;
  tipo_cobranca?: string | null;
  descricao?: string | null;
  liberacao_id?: string | null;
  parcela_numero?: number | null;
  userId: string;
}

// Núcleo da emissão (BTG + persistência + lançamento RECEBER). Lança Response
// em erro (o serve devolve); retorna objeto em sucesso — reutilizado pelo
// emitir manual (admin) e pelo disparo do Crediário Loja.
async function emitirCore(args: EmitirCoreArgs) {
  const { cod_empresa, valor, data_vencimento, data_expiracao, sacado_nome, sacado_documento,
    parcela_id, tipo_cobranca, descricao, liberacao_id, parcela_numero, userId } = args;
  const ce = cod_empresa;
  const collectionType = String(tipo_cobranca || "BANKSLIP");
  const { apiBase, isSandbox } = await getBtgConfig();

  let btgCollectionId = "";
  let linhaDigitavel = "";
  let urlBoleto = "";
  let btgStatus = "CREATED";

  if (isSandbox) {
    btgCollectionId = `sandbox-col-${Date.now()}`;
    linhaDigitavel = "23793.38128 60000.000003 00000.000402 1 " + String(Math.floor(Math.random() * 9999999999)).padStart(10, "0");
    urlBoleto = `https://sandbox.btgpactual.com/boleto/${btgCollectionId}`;
  } else {
    const accessToken = await getBtgToken(ce);
    const cnpj = await getCnpj(ce);
    const accountId = await getAccountId(ce);

    // Determine personType from document length
    const doc = String(sacado_documento).replace(/\D/g, "");
    const personType = doc.length > 11 ? "J" : "F";

    // Calculate overDueDate: use provided or default +30 days from dueDate
    const overDueDate = data_expiracao
      ? String(data_expiracao)
      : (() => {
          const d = new Date(String(data_vencimento));
          d.setDate(d.getDate() + 30);
          return d.toISOString().slice(0, 10);
        })();

    const btgPayload: Record<string, unknown> = {
      amount: Number(valor),
      type: collectionType,
      dueDate: String(data_vencimento),
      overDueDate,
      payer: {
        name: sacado_nome ? String(sacado_nome) : "",
        document: doc,
        personType,
      },
      account: { accountId },
    };

    if (descricao) btgPayload.description = String(descricao);

    // Add type-specific detail
    if (collectionType === "BANKSLIP" || collectionType === "BANKSLIP_QRCODE") {
      btgPayload.detail = { bankslip: {} };
    }

    console.log("[btg-cobrancas] BTG payload:", JSON.stringify(btgPayload).substring(0, 500));

    const btgRes = await fetch(
      `${apiBase}/${cnpj}/banking/collections`,
      { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(btgPayload) }
    );

    const btgBody = await btgRes.text();
    let btgData: Record<string, unknown> = {};
    try { btgData = JSON.parse(btgBody); } catch { /* non-JSON */ }

    if (!btgRes.ok) {
      console.error("[btg-cobrancas] BTG API error:", btgRes.status, btgBody);
      throw json({ error: "BTG rejeitou a emissão", btg_status: btgRes.status, details: btgData }, 502);
    }

    // BTG response: { collectionId, status, digitableLine, ... }
    btgCollectionId = (btgData.collectionId || btgData.id || "") as string;
    linhaDigitavel = (btgData.digitableLine || btgData.digitableLi || "") as string;
    urlBoleto = (btgData.url || btgData.boletoUrl || "") as string;
    btgStatus = (btgData.status || "CREATED") as string;
  }

  const db = getServiceClient();
  const { data, error } = await db.from("btg_cobrancas").insert({
    cod_empresa: ce,
    btg_receivable_id: btgCollectionId || null,
    valor: Number(valor),
    data_vencimento: String(data_vencimento),
    sacado_nome: sacado_nome ? String(sacado_nome) : null,
    sacado_documento: String(sacado_documento),
    linha_digitavel: linhaDigitavel || null,
    url_boleto: urlBoleto || null,
    status: btgStatus,
    parcela_id: parcela_id ? String(parcela_id) : null,
    liberacao_id: liberacao_id || null,
    parcela_numero: parcela_numero ?? null,
  }).select().single();

  if (error) {
    console.error("[btg-cobrancas] Insert error:", error);
    throw json({ error: "Erro ao gravar cobrança", details: error.message }, 500);
  }

  // Auto-create lancamento_financeiro RECEBER linked to this cobranca
  let lancamentoId: string | null = null;
  if (data?.id) {
    const { data: existingLanc } = await db
      .from("lancamentos_financeiros")
      .select("id")
      .eq("btg_cobranca_id", data.id)
      .eq("cod_empresa", ce)
      .maybeSingle();

    if (!existingLanc) {
      const { data: newLanc } = await db.from("lancamentos_financeiros").insert({
        cod_empresa: ce,
        tipo: "RECEBER",
        descricao: `Cobrança - ${sacado_nome || sacado_documento || "Boleto"}`,
        valor: Number(valor),
        data_vencimento: String(data_vencimento),
        pessoa_nome: sacado_nome ? String(sacado_nome) : null,
        pessoa_documento: String(sacado_documento),
        natureza: "RECEITA_BRUTA",
        forma_pagamento: "BOLETO",
        origem: "COBRANCA",
        origem_id: btgCollectionId || null,
        btg_cobranca_id: data.id,
        status: "PREVISTO",
        observacao: descricao ? String(descricao) : null,
        criado_por: userId,
      }).select("id").single();
      lancamentoId = newLanc?.id || null;
    }
  }

  return { cobranca: data, lancamento_id: lancamentoId, sandbox: isSandbox };
}

// ═══ CREDIÁRIO LOJA (SPEC_CREDIARIO_LOJA.md) ═════════════════
// Financeiro LIBERA o CPF com valores/parcelas travados; a loja só DISPARA.

async function requireEmpresaAccess(userId: string, ce: number) {
  if (await isAdmin(userId)) return;
  const db = getServiceClient();
  const { data } = await db
    .from("user_empresa_permissions")
    .select("cod_empresa")
    .eq("user_id", userId)
    .eq("cod_empresa", ce)
    .maybeSingle();
  if (!data) throw json({ error: `Sem permissão na empresa ${ce}` }, 403);
}

// Financeiro registra a consulta aprovada — valores rigorosamente travados.
async function handleLiberarCpf(body: Record<string, unknown>, userId: string) {
  await requireAdminRole(userId);
  const { cod_empresa, cpf, cliente_nome, valor_total, parcelas, valor_parcela,
    primeiro_vencimento, validade, observacao, imprimir } = body;

  if (!cod_empresa || !cpf || !cliente_nome || !valor_total || !parcelas || !valor_parcela || !primeiro_vencimento) {
    return json({ error: "cod_empresa, cpf, cliente_nome, valor_total, parcelas, valor_parcela e primeiro_vencimento são obrigatórios" }, 400);
  }

  const cpfLimpo = sanitizarCpf(cpf); // lança se inválido
  // Valida a coerência ANTES de gravar — liberação inconsistente nunca nasce.
  gerarParcelasBoleto({
    valor_total: Number(valor_total),
    parcelas: Number(parcelas),
    valor_parcela: Number(valor_parcela),
    primeiro_vencimento: String(primeiro_vencimento),
  });

  const db = getServiceClient();
  const { data, error } = await db.from("crediario_liberacoes").insert({
    cod_empresa: Number(cod_empresa),
    cpf: cpfLimpo,
    cliente_nome: String(cliente_nome).trim().toUpperCase(),
    valor_total: Number(valor_total),
    parcelas: Number(parcelas),
    valor_parcela: Number(valor_parcela),
    primeiro_vencimento: String(primeiro_vencimento),
    validade: validade ? String(validade) : null,
    observacao: observacao ? String(observacao) : null,
    imprimir: Boolean(imprimir),
    liberado_por: userId,
  }).select().single();
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, liberacao: data }, 201);
}

async function handleListarLiberacoes(body: Record<string, unknown>, userId: string) {
  const db = getServiceClient();
  const admin = await isAdmin(userId);
  let empresas: number[] | null = null;
  if (!admin) {
    const { data: perms } = await db.from("user_empresa_permissions").select("cod_empresa").eq("user_id", userId);
    empresas = (perms || []).map((p) => Number(p.cod_empresa));
    if (empresas.length === 0) return json({ liberacoes: [], boletos: {} });
  }

  let q = db.from("crediario_liberacoes").select("*").order("created_at", { ascending: false }).limit(200);
  if (body.cod_empresa) q = q.eq("cod_empresa", Number(body.cod_empresa));
  if (empresas) q = q.in("cod_empresa", empresas);
  if (body.status) q = q.eq("status", String(body.status));
  const { data: libs, error } = await q;
  if (error) return json({ error: error.message }, 500);

  // Boletos por liberação (linha digitável + PDF para a loja copiar/baixar)
  const ids = (libs || []).map((l) => l.id);
  const boletos: Record<string, unknown[]> = {};
  if (ids.length > 0) {
    const { data: cobs } = await db
      .from("btg_cobrancas")
      .select("id, liberacao_id, parcela_numero, valor, data_vencimento, linha_digitavel, url_boleto, status")
      .in("liberacao_id", ids)
      .order("parcela_numero", { ascending: true });
    for (const c of (cobs || [])) {
      const k = String(c.liberacao_id);
      (boletos[k] = boletos[k] || []).push(c);
    }
  }
  return json({ liberacoes: libs, boletos });
}

// A loja dispara: o sistema emite TODAS as parcelas exatamente como aprovadas.
// Idempotente: reenvio emite só as parcelas que faltaram (falha parcial).
async function handleDispararBoletos(body: Record<string, unknown>, userId: string) {
  const { liberacao_id } = body;
  if (!liberacao_id) return json({ error: "liberacao_id obrigatório" }, 400);

  const db = getServiceClient();
  const { data: lib } = await db.from("crediario_liberacoes").select("*").eq("id", String(liberacao_id)).single();
  if (!lib) return json({ error: "Liberação não encontrada" }, 404);

  await requireEmpresaAccess(userId, Number(lib.cod_empresa));

  const hoje = hojeBrt();
  const gate = podeDisparar(lib, hoje);
  // Reenvio de parcial é permitido (completa o que faltou)
  if (!gate.ok && lib.status !== "BOLETOS_PARCIAL") {
    return json({ error: gate.motivo }, 409);
  }

  const parcelasPlano = gerarParcelasBoleto({
    valor_total: Number(lib.valor_total),
    parcelas: Number(lib.parcelas),
    valor_parcela: Number(lib.valor_parcela),
    primeiro_vencimento: String(lib.primeiro_vencimento),
  });

  const { data: jaEmitidos } = await db
    .from("btg_cobrancas")
    .select("parcela_numero")
    .eq("liberacao_id", lib.id);
  const emitidas = new Set((jaEmitidos || []).map((c) => Number(c.parcela_numero)));

  const sucessos: unknown[] = [];
  const falhas: { parcela: number; erro: string }[] = [];
  for (const p of parcelasPlano) {
    if (emitidas.has(p.numero)) continue;
    try {
      const r = await emitirCore({
        cod_empresa: Number(lib.cod_empresa),
        valor: p.valor,
        data_vencimento: p.vencimento,
        sacado_nome: String(lib.cliente_nome),
        sacado_documento: String(lib.cpf),
        tipo_cobranca: "BANKSLIP",
        descricao: `Crediário ${lib.cliente_nome} — parcela ${p.numero}/${lib.parcelas}`,
        liberacao_id: String(lib.id),
        parcela_numero: p.numero,
        userId,
      });
      sucessos.push(r.cobranca);
    } catch (e) {
      const erro = e instanceof Response ? await e.text() : String(e);
      console.error(`[btg-cobrancas] Crediário: falha parcela ${p.numero} (lib ${lib.id}):`, erro);
      falhas.push({ parcela: p.numero, erro: erro.slice(0, 300) });
    }
  }

  const totalEmitidas = emitidas.size + sucessos.length;
  const statusNovo = falhas.length === 0 && totalEmitidas >= Number(lib.parcelas)
    ? "BOLETOS_EMITIDOS"
    : (totalEmitidas > 0 ? "BOLETOS_PARCIAL" : lib.status);

  await db.from("crediario_liberacoes").update({
    status: statusNovo,
    disparado_por: lib.disparado_por || userId,
    disparado_em: lib.disparado_em || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", lib.id);

  return json({
    ok: falhas.length === 0,
    status: statusNovo,
    emitidos_agora: sucessos.length,
    ja_existiam: emitidas.size,
    falhas,
    boletos: sucessos,
  });
}

// M2M — Conect$flow (outro projeto Supabase) emite o carnê de uma solicitação
// de boleto aprovada. Auth por segredo compartilhado (x-crediario-secret);
// idempotente por referencia_externa (id da solicitação) + parcela_numero.
// Usa a projeção de parcelas aprovada lá (validada aqui) ou deriva do padrão.
const M2M_USER = "00000000-0000-0000-0000-000000000000";

async function handleEmitirLoteCrediario(body: Record<string, unknown>) {
  const { cod_empresa, cpf, cliente_nome, valor_total, parcelas, valor_parcela,
    primeiro_vencimento, parcelas_detalhe, referencia_externa, imprimir, observacao } = body;

  if (!cod_empresa || !cpf || !cliente_nome || !valor_total || !referencia_externa) {
    return json({ error: "cod_empresa, cpf, cliente_nome, valor_total e referencia_externa são obrigatórios" }, 400);
  }
  const cpfLimpo = sanitizarCpf(cpf);
  const total = Number(valor_total);

  // Plano de parcelas: projeção explícita aprovada no Conect$flow, ou derivada.
  let plano: { numero: number; valor: number; vencimento: string }[];
  if (Array.isArray(parcelas_detalhe) && parcelas_detalhe.length > 0) {
    plano = (parcelas_detalhe as Record<string, unknown>[]).map((p, i) => ({
      numero: Number(p.numero ?? p.n ?? i + 1),
      valor: Math.round(Number(p.valor) * 100) / 100,
      vencimento: String(p.vencimento),
    }));
    if (plano.some((p) => !(p.valor > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(p.vencimento))) {
      return json({ error: "parcelas_detalhe inválido (valor > 0 e vencimento yyyy-MM-dd)" }, 400);
    }
    const soma = plano.reduce((s, p) => s + p.valor, 0);
    if (Math.abs(soma - total) >= 1) {
      return json({ error: `Projeção inconsistente: soma ${soma.toFixed(2)} ≠ total ${total.toFixed(2)}` }, 400);
    }
  } else {
    plano = gerarParcelasBoleto({
      valor_total: total,
      parcelas: Number(parcelas),
      valor_parcela: Number(valor_parcela),
      primeiro_vencimento: String(primeiro_vencimento),
    });
  }

  const db = getServiceClient();
  let { data: lib } = await db.from("crediario_liberacoes")
    .select("*").eq("referencia_externa", String(referencia_externa)).maybeSingle();

  if (lib && lib.status === "CANCELADO") {
    return json({ error: "Liberação cancelada no financeiro — não emite" }, 409);
  }
  if (!lib) {
    const { data: nova, error } = await db.from("crediario_liberacoes").insert({
      cod_empresa: Number(cod_empresa),
      cpf: cpfLimpo,
      cliente_nome: String(cliente_nome).trim().toUpperCase(),
      valor_total: total,
      parcelas: plano.length,
      valor_parcela: plano[0].valor,
      primeiro_vencimento: plano[0].vencimento,
      status: "LIBERADO",
      observacao: observacao ? String(observacao) : "Origem: Conect$flow (solicitação de boleto)",
      imprimir: Boolean(imprimir),
      liberado_por: M2M_USER,
      referencia_externa: String(referencia_externa),
    }).select().single();
    if (error) return json({ error: error.message }, 500);
    lib = nova;
  }

  const { data: jaEmitidos } = await db.from("btg_cobrancas")
    .select("parcela_numero").eq("liberacao_id", lib.id);
  const emitidas = new Set((jaEmitidos || []).map((c) => Number(c.parcela_numero)));

  const falhas: { parcela: number; erro: string }[] = [];
  let novos = 0;
  for (const p of plano) {
    if (emitidas.has(p.numero)) continue;
    try {
      await emitirCore({
        cod_empresa: Number(lib.cod_empresa),
        valor: p.valor,
        data_vencimento: p.vencimento,
        sacado_nome: String(lib.cliente_nome),
        sacado_documento: cpfLimpo,
        tipo_cobranca: "BANKSLIP",
        descricao: `Crediário ${lib.cliente_nome} — parcela ${p.numero}/${plano.length}`,
        liberacao_id: String(lib.id),
        parcela_numero: p.numero,
        userId: M2M_USER,
      });
      novos++;
    } catch (e) {
      const erro = e instanceof Response ? await e.text() : String(e);
      console.error(`[btg-cobrancas] m2m crediário: falha parcela ${p.numero} (ref ${referencia_externa}):`, erro);
      falhas.push({ parcela: p.numero, erro: erro.slice(0, 300) });
    }
  }

  const totalOk = emitidas.size + novos;
  const statusNovo = falhas.length === 0 && totalOk >= plano.length
    ? "BOLETOS_EMITIDOS" : (totalOk > 0 ? "BOLETOS_PARCIAL" : lib.status);
  await db.from("crediario_liberacoes").update({
    status: statusNovo,
    disparado_por: lib.disparado_por || M2M_USER,
    disparado_em: lib.disparado_em || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", lib.id);

  const { data: boletos } = await db.from("btg_cobrancas")
    .select("parcela_numero, valor, data_vencimento, linha_digitavel, url_boleto, status")
    .eq("liberacao_id", lib.id)
    .order("parcela_numero", { ascending: true });

  return json({ ok: falhas.length === 0, status: statusNovo, emitidos_agora: novos, falhas, boletos: boletos || [] });
}

async function handleCancelarLiberacao(body: Record<string, unknown>, userId: string) {
  await requireAdminRole(userId);
  const { liberacao_id, motivo } = body;
  if (!liberacao_id) return json({ error: "liberacao_id obrigatório" }, 400);
  const db = getServiceClient();
  const { data: lib } = await db.from("crediario_liberacoes").select("id, status").eq("id", String(liberacao_id)).single();
  if (!lib) return json({ error: "Liberação não encontrada" }, 404);
  await db.from("crediario_liberacoes").update({
    status: "CANCELADO",
    observacao: motivo ? String(motivo) : undefined,
    updated_at: new Date().toISOString(),
  }).eq("id", lib.id);
  const aviso = ["BOLETOS_EMITIDOS", "BOLETOS_PARCIAL"].includes(String(lib.status))
    ? "Boletos já emitidos NÃO são cancelados automaticamente — cancele-os individualmente na tela de Cobranças."
    : null;
  return json({ ok: true, aviso });
}

async function handleMarcarImpressao(body: Record<string, unknown>, userId: string) {
  await requireAdminRole(userId);
  const { liberacao_id, imprimir, impresso } = body;
  if (!liberacao_id) return json({ error: "liberacao_id obrigatório" }, 400);
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (imprimir !== undefined) updates.imprimir = Boolean(imprimir);
  if (impresso) updates.impresso_em = new Date().toISOString();
  const db = getServiceClient();
  const { error } = await db.from("crediario_liberacoes").update(updates).eq("id", String(liberacao_id));
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}

// ─── ACTION: importar (fetch existing collections from BTG) ──
async function handleImportar(body: Record<string, unknown>, userId: string) {
  await requireAdminRole(userId);

  const { cod_empresa } = body;
  if (!cod_empresa) return json({ error: "cod_empresa obrigatório" }, 400);

  const ce = Number(cod_empresa);
  const { apiBase, isSandbox } = await getBtgConfig();

  let btgItems: Record<string, unknown>[] = [];

  if (isSandbox) {
    btgItems = [
      { collectionId: `sandbox-col-1`, amount: 1500.00, dueDate: "2026-03-15", status: "CREATED", payer: { name: "CLIENTE TESTE 1", document: "12345678000100" }, digitableLine: "23793.38128 60000.000003 00000.000402 1 88880000150000" },
      { collectionId: `sandbox-col-2`, amount: 3200.00, dueDate: "2026-03-10", status: "PAID", payer: { name: "CLIENTE TESTE 2", document: "98765432000199" }, digitableLine: "23793.38128 60000.000004 00000.000403 1 88880000320000" },
      { collectionId: `sandbox-col-3`, amount: 890.00, dueDate: "2026-02-28", status: "OVERDUE", payer: { name: "CLIENTE TESTE 3", document: "11222333000144" }, digitableLine: "23793.38128 60000.000005 00000.000404 1 88880000089000" },
    ];
  } else {
    const accessToken = await getBtgToken(ce);
    const cnpj = await getCnpj(ce);
    const accountId = await getAccountId(ce);

    const params = new URLSearchParams();
    params.set("accountId", accountId);

    const btgRes = await fetch(
      `${apiBase}/${cnpj}/banking/collections?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }
    );

    const btgBody = await btgRes.text();
    if (!btgRes.ok) {
      console.error("[btg-cobrancas] BTG import error:", btgRes.status, btgBody);
      return json({ error: "Erro ao importar cobranças do BTG", btg_status: btgRes.status, details: btgBody }, 502);
    }

    try {
      const parsed = JSON.parse(btgBody);
      btgItems = Array.isArray(parsed) ? parsed : (parsed.items || parsed.content || parsed.data || []);
    } catch {
      return json({ error: "Resposta inválida do BTG" }, 502);
    }
  }

  const db = getServiceClient();
  let inseridos = 0;
  let duplicados = 0;

  for (const item of btgItems) {
    const collectionId = (item.collectionId || item.id || "") as string;

    if (collectionId) {
      const { data: existing } = await db
        .from("btg_cobrancas")
        .select("id")
        .eq("btg_receivable_id", collectionId)
        .eq("cod_empresa", ce)
        .maybeSingle();
      if (existing) { duplicados++; continue; }
    }

    const payer = item.payer as Record<string, unknown> | undefined;
    const { error } = await db.from("btg_cobrancas").insert({
      cod_empresa: ce,
      btg_receivable_id: collectionId || null,
      valor: Number(item.amount || 0),
      data_vencimento: (item.dueDate || new Date().toISOString().slice(0, 10)) as string,
      sacado_nome: (payer?.name || null) as string | null,
      sacado_documento: (payer?.document || payer?.taxId || null) as string | null,
      linha_digitavel: (item.digitableLine || null) as string | null,
      url_boleto: (item.url || item.boletoUrl || null) as string | null,
      status: (item.status || "CREATED") as string,
    });

    if (!error) inseridos++;
    else console.warn("[btg-cobrancas] Insert error:", error.message);
  }

  return json({ success: true, importados: inseridos, duplicados, total_btg: btgItems.length, sandbox: isSandbox });
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
    const { data: perms } = await db.from("user_empresa_permissions").select("cod_empresa").eq("user_id", userId);
    empresasPermitidas = (perms || []).map((p: { cod_empresa: number }) => p.cod_empresa);
    if (empresasPermitidas.length === 0) return json([]);
  }

  let query = db.from("btg_cobrancas").select("*").order("created_at", { ascending: false }).limit(limit);

  if (codEmpresa) {
    const ce = Number(codEmpresa);
    if (!admin && !empresasPermitidas.includes(ce)) return json({ error: "Sem permissão para essa empresa" }, 403);
    query = query.eq("cod_empresa", ce);
  } else if (!admin) {
    query = query.in("cod_empresa", empresasPermitidas);
  }

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return json({ error: "Erro ao listar cobranças", details: error.message }, 500);
  return json(data || []);
}

// ─── ACTION: detalhe ─────────────────────────────────────────
async function handleDetalhe(body: Record<string, unknown> | null, url: URL) {
  const id = getParam(body, url, "id");
  if (!id) return json({ error: "id obrigatório" }, 400);

  const db = getServiceClient();
  const { data, error } = await db.from("btg_cobrancas").select("*").eq("id", id).single();
  if (error || !data) return json({ error: "Cobrança não encontrada" }, 404);
  return json(data);
}

// ─── ACTION: cancelar ────────────────────────────────────────
// BTG: DELETE /{companyId}/banking/collections/{collectionId}
async function handleCancelar(body: Record<string, unknown>, userId: string) {
  await requireAdminRole(userId);

  const { id } = body;
  if (!id) return json({ error: "id obrigatório" }, 400);

  const db = getServiceClient();
  const { data: cobranca } = await db.from("btg_cobrancas").select("status, cod_empresa, btg_receivable_id").eq("id", String(id)).single();

  if (!cobranca) return json({ error: "Cobrança não encontrada" }, 404);
  if (!["CREATED", "PROCESSING", "EMITIDO"].includes(cobranca.status)) {
    return json({ error: `Não é possível cancelar cobrança com status ${cobranca.status}` }, 400);
  }

  const { isSandbox, apiBase } = await getBtgConfig();

  if (cobranca.btg_receivable_id && !isSandbox) {
    try {
      const accessToken = await getBtgToken(cobranca.cod_empresa);
      const cnpj = await getCnpj(cobranca.cod_empresa);
      await fetch(`${apiBase}/${cnpj}/banking/collections/${cobranca.btg_receivable_id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (e) {
      console.warn("[btg-cobrancas] Erro ao cancelar no BTG (prosseguindo):", e);
    }
  }

  const { error } = await db.from("btg_cobrancas").update({ status: "CANCELED" }).eq("id", String(id));
  if (error) return json({ error: "Erro ao cancelar", details: error.message }, 500);
  return json({ success: true, status: "CANCELED" });
}

// ─── ACTION: segunda_via ─────────────────────────────────────
// BTG: GET /{companyId}/banking/collections/{collectionId}
async function handleSegundaVia(body: Record<string, unknown> | null, url: URL) {
  const id = getParam(body, url, "id");
  if (!id) return json({ error: "id obrigatório" }, 400);

  const db = getServiceClient();
  const { data: cobranca } = await db.from("btg_cobrancas").select("*").eq("id", id).single();

  if (!cobranca) return json({ error: "Cobrança não encontrada" }, 404);
  if (!cobranca.btg_receivable_id) return json({ error: "Cobrança sem ID BTG" }, 400);

  const { isSandbox, apiBase } = await getBtgConfig();
  if (isSandbox) {
    return json({ url_boleto: cobranca.url_boleto, linha_digitavel: cobranca.linha_digitavel });
  }

  const accessToken = await getBtgToken(cobranca.cod_empresa);
  const cnpj = await getCnpj(cobranca.cod_empresa);

  const btgRes = await fetch(
    `${apiBase}/${cnpj}/banking/collections/${cobranca.btg_receivable_id}`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }
  );

  if (!btgRes.ok) return json({ error: "Erro ao consultar BTG", btg_status: btgRes.status }, 502);

  const btgData = await btgRes.json();
  const urlBoleto = (btgData.url || btgData.boletoUrl || cobranca.url_boleto || "") as string;
  const btgStatus = (btgData.status || cobranca.status) as string;

  // Update local record with latest BTG data
  const updates: Record<string, unknown> = {};
  if (urlBoleto && urlBoleto !== cobranca.url_boleto) updates.url_boleto = urlBoleto;
  if (btgStatus !== cobranca.status) updates.status = btgStatus;
  if (btgData.paidAmount) updates.valor_pago = Number(btgData.paidAmount);
  if (btgData.paymentDate) updates.data_pagamento = String(btgData.paymentDate);

  if (Object.keys(updates).length > 0) {
    await db.from("btg_cobrancas").update(updates).eq("id", id);
  }

  return json({ url_boleto: urlBoleto, linha_digitavel: cobranca.linha_digitavel, status: btgStatus, btg_data: btgData });
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

    // Ação máquina-a-máquina (Conect$flow) — autentica por segredo, sem JWT.
    if (action === "emitir_lote_crediario") {
      const esperado = Deno.env.get("CREDIARIO_SHARED_SECRET") || "";
      const recebido = req.headers.get("x-crediario-secret") || "";
      if (!esperado || recebido !== esperado) {
        return json({ error: "Unauthorized — segredo do crediário ausente/incorreto" }, 401);
      }
      return await handleEmitirLoteCrediario(body || {});
    }

    const userId = requireAuth(req);

    switch (action) {
      case "emitir":
        return await handleEmitir(body || {}, userId);
      case "importar":
        return await handleImportar(body || {}, userId);
      case "listar":
        return await handleListar(body, url, userId);
      case "detalhe":
        return await handleDetalhe(body, url);
      case "cancelar":
        return await handleCancelar(body || {}, userId);
      case "segunda_via":
        return await handleSegundaVia(body, url);
      case "liberar_cpf":
        return await handleLiberarCpf(body || {}, userId);
      case "listar_liberacoes":
        return await handleListarLiberacoes(body || {}, userId);
      case "disparar_boletos":
        return await handleDispararBoletos(body || {}, userId);
      case "cancelar_liberacao":
        return await handleCancelarLiberacao(body || {}, userId);
      case "marcar_impressao":
        return await handleMarcarImpressao(body || {}, userId);
      default:
        return json({ error: `Ação desconhecida: '${action}'. Use: emitir, importar, listar, detalhe, cancelar, segunda_via, liberar_cpf, listar_liberacoes, disparar_boletos, cancelar_liberacao, marcar_impressao` }, 400);
    }
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[btg-cobrancas] Unhandled error:", e);
    return json({ error: "Erro interno", details: String(e) }, 500);
  }
});
