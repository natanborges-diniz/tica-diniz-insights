// supabase/functions/btg-dda/index.ts
// BTG Pactual Banking — DDA + Conciliação (Fase 4)
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

function getBtgUrls() {
  const env = Deno.env.get("BTG_ENVIRONMENT") || "sandbox";
  return {
    apiBase: env === "sandbox"
      ? "https://api.sandbox.empresas.btgpactual.com"
      : "https://api.empresas.btgpactual.com",
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

async function getCompanyId(codEmpresa: number): Promise<string> {
  const db = getServiceClient();
  const { data } = await db.from("btg_contas_bancarias").select("company_id").eq("cod_empresa", codEmpresa).eq("ativa", true).single();
  if (!data?.company_id) throw json({ error: `Conta BTG não configurada para empresa ${codEmpresa}` }, 400);
  return data.company_id;
}

// ─── ACTION: importar ────────────────────────────────────────
// Busca títulos DDA do BTG e salva/atualiza na tabela local
async function handleImportar(req: Request) {
  const userId = requireAuth(req);
  await requireAdminRole(userId);

  const body = await req.json();
  const { cod_empresa } = body;
  if (!cod_empresa) return json({ error: "cod_empresa obrigatório" }, 400);

  const accessToken = await getBtgToken(cod_empresa);
  const companyId = await getCompanyId(cod_empresa);
  const { apiBase } = getBtgUrls();

  const btgRes = await fetch(
    `${apiBase}/banking/v1/companies/${companyId}/dda`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const btgBody = await btgRes.text();
  if (!btgRes.ok) {
    console.error("[btg-dda] BTG API error:", btgRes.status, btgBody);
    return json({ error: "Erro ao consultar DDA no BTG", btg_status: btgRes.status }, 502);
  }

  let btgData: Record<string, unknown>[] = [];
  try {
    const parsed = JSON.parse(btgBody);
    btgData = Array.isArray(parsed) ? parsed : (parsed.items || parsed.data || []);
  } catch {
    return json({ error: "Resposta inválida do BTG" }, 502);
  }

  const db = getServiceClient();
  let inseridos = 0;
  let duplicados = 0;

  for (const titulo of btgData) {
    const btgDdaId = (titulo.id || titulo.ddaId || "") as string;

    // Verificar duplicata
    if (btgDdaId) {
      const { data: existing } = await db
        .from("btg_dda_titulos")
        .select("id")
        .eq("btg_dda_id", btgDdaId)
        .eq("cod_empresa", cod_empresa)
        .maybeSingle();

      if (existing) { duplicados++; continue; }
    }

    const { error } = await db.from("btg_dda_titulos").insert({
      cod_empresa,
      btg_dda_id: btgDdaId || null,
      emissor: (titulo.issuerName || titulo.emissor || null) as string | null,
      documento_emissor: (titulo.issuerDocument || titulo.documento_emissor || null) as string | null,
      numero_documento: (titulo.documentNumber || titulo.numero_documento || null) as string | null,
      valor: Number(titulo.amount || titulo.valor || 0),
      data_vencimento: (titulo.dueDate || titulo.data_vencimento || new Date().toISOString().slice(0, 10)) as string,
      linha_digitavel: (titulo.digitableLine || titulo.linha_digitavel || null) as string | null,
      status: "PENDENTE",
    });

    if (!error) inseridos++;
    else console.warn("[btg-dda] Insert error:", error.message);
  }

  return json({ success: true, importados: inseridos, duplicados, total_btg: btgData.length });
}

// ─── ACTION: conciliar_auto ──────────────────────────────────
// Conciliação automática: match por valor + CNPJ + vencimento + número do documento
// Busca parcelas "A PAGAR" + "EM ABERTO" do ERP via Firebird Bridge
async function handleConciliarAuto(req: Request) {
  const userId = requireAuth(req);
  await requireAdminRole(userId);

  const body = await req.json();
  const { cod_empresa } = body;
  if (!cod_empresa) return json({ error: "cod_empresa obrigatório" }, 400);

  const db = getServiceClient();

  // 1. Buscar títulos DDA pendentes e não conciliados
  const { data: titulosDda, error: ddaErr } = await db
    .from("btg_dda_titulos")
    .select("*")
    .eq("cod_empresa", cod_empresa)
    .eq("status", "PENDENTE")
    .eq("conciliado", false);

  if (ddaErr) return json({ error: "Erro ao buscar títulos DDA", details: ddaErr.message }, 500);
  if (!titulosDda || titulosDda.length === 0) {
    return json({ success: true, conciliados: 0, mensagem: "Nenhum título DDA pendente" });
  }

  // 2. Determinar range de datas dos títulos DDA para buscar parcelas relevantes
  const vencimentos = titulosDda.map((t) => t.data_vencimento).filter(Boolean).sort();
  const dataInicio = vencimentos[0] || new Date().toISOString().slice(0, 10);
  const dataFim = vencimentos[vencimentos.length - 1] || dataInicio;

  // 3. Buscar parcelas "A PAGAR" + "EM ABERTO" do ERP via Firebird Bridge
  const firebirdBaseUrl = Deno.env.get("FIREBIRD_API_BASE_URL") || "https://firebird-bridge-production.up.railway.app";
  const parcelasUrl = new URL(`${firebirdBaseUrl}/api/v1/financeiro/parcelas`);
  parcelasUrl.searchParams.set("empresa", String(cod_empresa));
  parcelasUrl.searchParams.set("dataInicio", dataInicio);
  parcelasUrl.searchParams.set("dataFim", dataFim);
  parcelasUrl.searchParams.set("tipo", "PAGAR");
  parcelasUrl.searchParams.set("situacao", "EM ABERTO");
  parcelasUrl.searchParams.set("campoData", "VENCIMENTO");

  let parcelasErp: Array<{
    lancamento_documento?: string;
    pessoa_nome?: string;
    parcela_valor?: number;
    parcela_data_vencimento?: string;
    cod_empresa?: number;
    // CNPJ do emissor virá do campo pessoa se disponível
    [key: string]: unknown;
  }> = [];

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
    return json({
      error: "Não foi possível consultar parcelas do ERP para conciliação",
      details: String(e),
    }, 502);
  }

  // 4. Fazer o match: valor + documento_emissor (CNPJ) + data_vencimento + numero_documento
  const resultados: {
    titulo_id: string;
    status: "conciliado" | "sem_match";
    parcela_documento?: string;
    criterios: { valor: number; cnpj: string | null; vencimento: string; numero_documento: string | null };
  }[] = [];

  // Indexar parcelas do ERP para match rápido
  // Chave: "valor|vencimento|documento" (numero_documento = lancamento_documento do ERP)
  const parcelasIndex = new Map<string, typeof parcelasErp[0]>();
  for (const p of parcelasErp) {
    const valor = Number(p.parcela_valor || 0).toFixed(2);
    const venc = (p.parcela_data_vencimento || "").slice(0, 10);
    const doc = (p.lancamento_documento || "").trim();
    // Chave composta com os 3 critérios disponíveis no ERP
    const key = `${valor}|${venc}|${doc}`;
    if (!parcelasIndex.has(key)) {
      parcelasIndex.set(key, p);
    }
  }

  let conciliadosCount = 0;

  for (const titulo of titulosDda) {
    const criterios = {
      valor: titulo.valor,
      cnpj: titulo.documento_emissor,
      vencimento: titulo.data_vencimento,
      numero_documento: titulo.numero_documento,
    };

    // Construir chave de match
    const valorStr = Number(titulo.valor).toFixed(2);
    const vencStr = (titulo.data_vencimento || "").slice(0, 10);
    const docStr = (titulo.numero_documento || "").trim();
    const matchKey = `${valorStr}|${vencStr}|${docStr}`;

    const parcelaMatch = parcelasIndex.get(matchKey);

    if (parcelaMatch) {
      // Match encontrado — atualizar título DDA como conciliado
      await db
        .from("btg_dda_titulos")
        .update({
          conciliado: true,
          status: "CONCILIADO",
        })
        .eq("id", titulo.id);

      // Remover do índice para evitar match duplo
      parcelasIndex.delete(matchKey);

      resultados.push({
        titulo_id: titulo.id,
        status: "conciliado",
        parcela_documento: parcelaMatch.lancamento_documento || undefined,
        criterios,
      });
      conciliadosCount++;
    } else {
      resultados.push({
        titulo_id: titulo.id,
        status: "sem_match",
        criterios,
      });
    }
  }

  const semMatch = resultados.filter((r) => r.status === "sem_match").length;

  return json({
    success: true,
    conciliados: conciliadosCount,
    sem_match: semMatch,
    total: titulosDda.length,
    parcelas_erp_encontradas: parcelasErp.length,
    detalhes: resultados,
  });
}

// ─── ACTION: conciliar_manual ────────────────────────────────
// Vincula manualmente um título DDA a uma parcela do ERP
async function handleConciliarManual(req: Request) {
  const userId = requireAuth(req);
  await requireAdminRole(userId);

  const { titulo_id, parcela_id } = await req.json();
  if (!titulo_id || !parcela_id) {
    return json({ error: "titulo_id e parcela_id são obrigatórios" }, 400);
  }

  const db = getServiceClient();

  const { data: titulo } = await db
    .from("btg_dda_titulos")
    .select("id, conciliado")
    .eq("id", titulo_id)
    .single();

  if (!titulo) return json({ error: "Título DDA não encontrado" }, 404);
  if (titulo.conciliado) return json({ error: "Título já conciliado" }, 400);

  const { error } = await db
    .from("btg_dda_titulos")
    .update({
      parcela_id,
      conciliado: true,
      status: "CONCILIADO",
    })
    .eq("id", titulo_id);

  if (error) return json({ error: "Erro ao conciliar", details: error.message }, 500);
  return json({ success: true, status: "CONCILIADO" });
}

// ─── ACTION: ignorar ─────────────────────────────────────────
async function handleIgnorar(req: Request) {
  const userId = requireAuth(req);
  await requireAdminRole(userId);

  const { titulo_id } = await req.json();
  if (!titulo_id) return json({ error: "titulo_id obrigatório" }, 400);

  const db = getServiceClient();
  const { error } = await db
    .from("btg_dda_titulos")
    .update({ status: "IGNORADO" })
    .eq("id", titulo_id);

  if (error) return json({ error: "Erro ao ignorar", details: error.message }, 500);
  return json({ success: true, status: "IGNORADO" });
}

// ─── ACTION: listar ──────────────────────────────────────────
async function handleListar(req: Request) {
  const userId = requireAuth(req);
  const url = new URL(req.url);
  const codEmpresa = url.searchParams.get("cod_empresa");
  const status = url.searchParams.get("status");
  const conciliado = url.searchParams.get("conciliado");
  const limit = Number(url.searchParams.get("limit") || "100");

  const db = getServiceClient();
  const admin = await isAdmin(userId);
  let empresasPermitidas: number[] = [];

  if (!admin) {
    const { data: perms } = await db.from("user_empresa_permissions").select("cod_empresa").eq("user_id", userId);
    empresasPermitidas = (perms || []).map((p: { cod_empresa: number }) => p.cod_empresa);
    if (empresasPermitidas.length === 0) return json([]);
  }

  let query = db
    .from("btg_dda_titulos")
    .select("*")
    .order("data_vencimento", { ascending: true })
    .limit(limit);

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
// KPIs de conciliação para uma empresa
async function handleIndicadores(req: Request) {
  const userId = requireAuth(req);
  const url = new URL(req.url);
  const codEmpresa = url.searchParams.get("cod_empresa");
  if (!codEmpresa) return json({ error: "cod_empresa obrigatório" }, 400);

  const db = getServiceClient();
  const ce = Number(codEmpresa);

  // Total
  const { count: total } = await db
    .from("btg_dda_titulos")
    .select("id", { count: "exact", head: true })
    .eq("cod_empresa", ce);

  // Conciliados
  const { count: conciliados } = await db
    .from("btg_dda_titulos")
    .select("id", { count: "exact", head: true })
    .eq("cod_empresa", ce)
    .eq("conciliado", true);

  // Pendentes
  const { count: pendentes } = await db
    .from("btg_dda_titulos")
    .select("id", { count: "exact", head: true })
    .eq("cod_empresa", ce)
    .eq("status", "PENDENTE")
    .eq("conciliado", false);

  // Ignorados
  const { count: ignorados } = await db
    .from("btg_dda_titulos")
    .select("id", { count: "exact", head: true })
    .eq("cod_empresa", ce)
    .eq("status", "IGNORADO");

  const t = total || 0;
  const c = conciliados || 0;

  return json({
    total: t,
    conciliados: c,
    pendentes: pendentes || 0,
    ignorados: ignorados || 0,
    percentual_conciliado: t > 0 ? Math.round((c / t) * 100) : 0,
    orfaos: (pendentes || 0),
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
      } catch { /* no-op */ }
    }

    switch (action) {
      case "importar":
        return await handleImportar(req);
      case "listar":
        return await handleListar(req);
      case "conciliar_auto":
        return await handleConciliarAuto(req);
      case "conciliar_manual":
        return await handleConciliarManual(req);
      case "ignorar":
        return await handleIgnorar(req);
      case "indicadores":
        return await handleIndicadores(req);
      default:
        return json(
          { error: `Ação desconhecida: '${action}'. Use: importar, listar, conciliar_auto, conciliar_manual, ignorar, indicadores` },
          400
        );
    }
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[btg-dda] Unhandled error:", e);
    return json({ error: "Erro interno", details: String(e) }, 500);
  }
});
