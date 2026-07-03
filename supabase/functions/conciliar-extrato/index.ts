// supabase/functions/conciliar-extrato/index.ts
// E3 — Motor de conciliação 3 vias do extrato BTG (SPEC_P1_CONCILIACAO_3VIAS.md §4)
// Actions:
//   executar {cod_empresa?}         → waterfall automático (cron diário ou manual)
//   sugestoes {extrato_id}          → recalcula candidatos ao vivo
//   confirmar {extrato_id, alocacoes[]} → conciliação manual de 1 clique (admin)
//   ignorar {extrato_id, observacao}    → transferência interna etc. (admin)
//   criar_lancamento {extrato_id, natureza, categoria?, descricao?} → lançamento avulso (admin)
//   desfazer {extrato_id}           → reverte via snapshot (admin)
//
// Regra de ouro: o motor automático NUNCA cria lançamento para linha sem match —
// criação automática só via regra de tarifa cadastrada (alvo TARIFA). Efeitos colaterais
// rodam em transação única via RPC fn_conciliar_extrato / fn_desconciliar_extrato.
//
// verify_jwt=false: o cron chama com anon key (só permite executar/sugestoes);
// ações mutadoras exigem JWT de usuário admin.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  matchEntry,
  type ExtratoEntry,
  type Pools,
  type CandidatoForte,
  type Alocacao,
} from "../_shared/conciliacaoMotor.ts";

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

// ─── Auth ────────────────────────────────────────────────────
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

interface Caller {
  interno: boolean; // cron/service — só executar/sugestoes
  userId: string | null;
}

function identifyCaller(req: Request): Caller {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw json({ error: "Unauthorized" }, 401);
  const claims = decodeJwtPayload(authHeader.replace("Bearer ", ""));
  if (!claims) throw json({ error: "Unauthorized" }, 401);
  const role = String(claims.role ?? "");
  if (role === "anon" || role === "service_role") return { interno: true, userId: null };
  if (claims.aud === "authenticated" && claims.sub) {
    const exp = claims.exp as number | undefined;
    if (exp && exp < Math.floor(Date.now() / 1000)) throw json({ error: "Token expirado" }, 401);
    return { interno: false, userId: String(claims.sub) };
  }
  throw json({ error: "Unauthorized" }, 401);
}

async function requireAdmin(userId: string | null) {
  if (!userId) throw json({ error: "Forbidden — ação exige usuário admin" }, 403);
  const db = getServiceClient();
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin");
  if (!data || data.length === 0) throw json({ error: "Forbidden — apenas admin" }, 403);
}

// ─── Pools de candidatos por empresa ─────────────────────────
interface PoolsPorLado {
  debito: Pools;
  credito: Pools;
}

// deno-lint-ignore no-explicit-any
async function carregarPools(db: any, codEmpresa: number): Promise<PoolsPorLado> {
  // Alvos já alocados nunca são candidatos de novo
  const { data: alocados } = await db
    .from("conciliacao_extrato")
    .select("alvo_tipo, alvo_id")
    .eq("cod_empresa", codEmpresa);
  const usados = new Set<string>(
    (alocados || []).filter((a: { alvo_id: string | null }) => a.alvo_id).map((a: { alvo_tipo: string; alvo_id: string }) => `${a.alvo_tipo}|${a.alvo_id}`)
  );

  const fortesDebito: CandidatoForte[] = [];
  const fortesCredito: CandidatoForte[] = [];

  // Débito ← pagamentos BTG enviados/pagos
  const { data: pagamentos } = await db
    .from("btg_pagamentos")
    .select("id, valor, status, beneficiario")
    .eq("cod_empresa", codEmpresa)
    .in("status", ["ENVIADO_BTG", "AGUARDANDO_APROVACAO_BTG", "PAGO"]);
  for (const p of (pagamentos || [])) {
    if (usados.has(`PAGAMENTO_BTG|${p.id}`)) continue;
    fortesDebito.push({ alvo_tipo: "PAGAMENTO_BTG", id: p.id, valor: Number(p.valor), data: null, label: `Pagamento BTG ${p.beneficiario ?? ""}`.trim() });
  }

  // Débito ← lançamentos baixados via polling (batch), ainda sem extrato vinculado
  const { data: lancPoll } = await db
    .from("lancamentos_financeiros")
    .select("id, valor, valor_pago, data_pagamento, descricao, tipo")
    .eq("cod_empresa", codEmpresa)
    .eq("status", "BAIXADO")
    .is("btg_extrato_id", null)
    .not("dados_extras->>btg_payment_id", "is", null);
  for (const l of (lancPoll || [])) {
    if (usados.has(`LANCAMENTO|${l.id}`)) continue;
    const cand: CandidatoForte = {
      alvo_tipo: "LANCAMENTO",
      id: l.id,
      valor: Number(l.valor_pago ?? l.valor),
      data: l.data_pagamento,
      label: `Lançamento pago via BTG: ${l.descricao ?? ""}`.trim(),
    };
    (l.tipo === "RECEBER" ? fortesCredito : fortesDebito).push(cand);
  }

  // Crédito ← cobranças (boletos nossos) pagas
  const { data: cobrancas } = await db
    .from("btg_cobrancas")
    .select("id, valor, valor_pago, data_pagamento, sacado_nome, status")
    .eq("cod_empresa", codEmpresa)
    .eq("status", "PAGO");
  for (const c of (cobrancas || [])) {
    if (usados.has(`COBRANCA_BTG|${c.id}`)) continue;
    fortesCredito.push({
      alvo_tipo: "COBRANCA_BTG",
      id: c.id,
      valor: Number(c.valor_pago ?? c.valor),
      data: c.data_pagamento,
      label: `Boleto pago — ${c.sacado_nome ?? ""}`.trim(),
    });
  }

  // Crédito ← recebíveis de cartão
  const { data: recebiveis } = await db
    .from("recebiveis_cartao")
    .select("id, valor_liquido, data_vencimento, adquirente, status")
    .eq("cod_empresa", codEmpresa)
    .in("status", ["PREVISTO", "CONCILIADO"])
    .is("btg_extrato_id", null);
  const poolRecebiveis = (recebiveis || [])
    .filter((r: { id: string }) => !usados.has(`RECEBIVEL_CARTAO|${r.id}`))
    .map((r: { id: string; valor_liquido: number; data_vencimento: string; adquirente: string | null }) => ({
      id: r.id,
      valor_liquido: Number(r.valor_liquido),
      data_vencimento: r.data_vencimento,
      adquirente: r.adquirente,
    }));

  // Ambos ← lançamentos em aberto
  const { data: lancAbertos } = await db
    .from("lancamentos_financeiros")
    .select("id, tipo, valor, data_vencimento, descricao")
    .eq("cod_empresa", codEmpresa)
    .in("status", ["PREVISTO", "AUTORIZADO", "PROCESSANDO"])
    .is("btg_extrato_id", null);
  const poolLanc = (lancAbertos || [])
    .filter((l: { id: string }) => !usados.has(`LANCAMENTO|${l.id}`))
    .map((l: { id: string; tipo: string; valor: number; data_vencimento: string; descricao: string | null }) => ({
      id: l.id,
      tipo: l.tipo as "PAGAR" | "RECEBER",
      valor: Number(l.valor),
      data_vencimento: l.data_vencimento,
      label: l.descricao ?? undefined,
    }));

  // Regras: específicas da empresa primeiro, depois globais
  const { data: regras } = await db
    .from("extrato_regras_classificacao")
    .select("*")
    .eq("ativo", true)
    .or(`cod_empresa.eq.${codEmpresa},cod_empresa.is.null`);
  const poolRegras = (regras || [])
    .map((r: Record<string, unknown>) => ({
      id: String(r.id),
      cod_empresa: r.cod_empresa as number | null,
      padrao_descricao: String(r.padrao_descricao),
      tipo: r.tipo as "CREDITO" | "DEBITO",
      natureza: String(r.natureza),
      categoria: (r.categoria as string) ?? null,
      auto_conciliar: Boolean(r.auto_conciliar),
      valor_max: r.valor_max != null ? Number(r.valor_max) : null,
    }))
    .sort((a: { cod_empresa: number | null }, b: { cod_empresa: number | null }) =>
      (a.cod_empresa == null ? 1 : 0) - (b.cod_empresa == null ? 1 : 0)
    );

  return {
    debito: { fortes: fortesDebito, recebiveis: [], lancamentos: poolLanc, regras: poolRegras },
    credito: { fortes: fortesCredito, recebiveis: poolRecebiveis, lancamentos: poolLanc, regras: poolRegras },
  };
}

// ─── ACTION: executar ────────────────────────────────────────
// deno-lint-ignore no-explicit-any
async function handleExecutar(db: any, body: Record<string, unknown> | null) {
  const codEmpresaFiltro = body?.cod_empresa ? Number(body.cod_empresa) : null;

  let empresas: number[];
  if (codEmpresaFiltro) {
    empresas = [codEmpresaFiltro];
  } else {
    const { data } = await db
      .from("btg_extrato")
      .select("cod_empresa")
      .eq("status_conciliacao", "PENDENTE")
      .limit(2000);
    empresas = [...new Set((data || []).map((e: { cod_empresa: number }) => e.cod_empresa))] as number[];
  }

  const resultado = { empresas: empresas.length, conciliados: 0, com_sugestao: 0, sem_match: 0, erros: [] as string[] };

  for (const codEmpresa of empresas) {
    try {
      const pools = await carregarPools(db, codEmpresa);
      const usados = new Set<string>();

      const { data: entries } = await db
        .from("btg_extrato")
        .select("*")
        .eq("cod_empresa", codEmpresa)
        .eq("status_conciliacao", "PENDENTE")
        .order("data_lancamento", { ascending: true })
        .limit(300);

      for (const entry of (entries || [])) {
        const e: ExtratoEntry = {
          id: entry.id,
          cod_empresa: entry.cod_empresa,
          data_lancamento: entry.data_lancamento,
          descricao: entry.descricao,
          valor: Number(entry.valor),
          tipo: entry.tipo,
        };
        const pool = e.tipo === "DEBITO" ? pools.debito : pools.credito;
        const result = matchEntry(e, pool, usados);

        if (result.status === "MATCH" && result.alocacoes) {
          const { error } = await db.rpc("fn_conciliar_extrato", {
            p_extrato_id: e.id,
            p_alocacoes: result.alocacoes,
            p_metodo: result.metodo,
            p_score: result.score ?? null,
            p_status: "CONCILIADO_AUTO",
            p_user: null,
          });
          if (error) {
            resultado.erros.push(`extrato ${e.id}: ${error.message}`);
            continue;
          }
          for (const a of result.alocacoes) {
            if (a.alvo_id) usados.add(`${a.alvo_tipo}|${a.alvo_id}`);
          }
          resultado.conciliados++;
        } else {
          const dados = (entry.dados_extras || {}) as Record<string, unknown>;
          await db.from("btg_extrato").update({
            dados_extras: { ...dados, sugestoes: result.sugestoes },
            updated_at: new Date().toISOString(),
          }).eq("id", e.id);
          if (result.status === "SUGESTAO") resultado.com_sugestao++;
          else resultado.sem_match++;
        }
      }
    } catch (err) {
      resultado.erros.push(`empresa ${codEmpresa}: ${String(err)}`);
    }
  }

  console.log("[conciliar-extrato] executar:", JSON.stringify(resultado));
  return json({ success: true, ...resultado });
}

// ─── ACTION: sugestoes ───────────────────────────────────────
// deno-lint-ignore no-explicit-any
async function handleSugestoes(db: any, body: Record<string, unknown>) {
  const extratoId = String(body.extrato_id ?? "");
  if (!extratoId) return json({ error: "extrato_id obrigatório" }, 400);

  const { data: entry } = await db.from("btg_extrato").select("*").eq("id", extratoId).single();
  if (!entry) return json({ error: "Linha do extrato não encontrada" }, 404);

  const pools = await carregarPools(db, entry.cod_empresa);
  const e: ExtratoEntry = {
    id: entry.id,
    cod_empresa: entry.cod_empresa,
    data_lancamento: entry.data_lancamento,
    descricao: entry.descricao,
    valor: Number(entry.valor),
    tipo: entry.tipo,
  };
  const result = matchEntry(e, e.tipo === "DEBITO" ? pools.debito : pools.credito, new Set());

  const dados = (entry.dados_extras || {}) as Record<string, unknown>;
  await db.from("btg_extrato").update({
    dados_extras: { ...dados, sugestoes: result.sugestoes },
    updated_at: new Date().toISOString(),
  }).eq("id", extratoId);

  return json({ extrato_id: extratoId, resultado: result });
}

// ─── ACTION: confirmar ───────────────────────────────────────
// deno-lint-ignore no-explicit-any
async function handleConfirmar(db: any, body: Record<string, unknown>, userId: string | null) {
  const extratoId = String(body.extrato_id ?? "");
  const alocacoes = body.alocacoes as Alocacao[] | undefined;
  if (!extratoId || !Array.isArray(alocacoes) || alocacoes.length === 0) {
    return json({ error: "extrato_id e alocacoes[] são obrigatórios" }, 400);
  }

  const { data, error } = await db.rpc("fn_conciliar_extrato", {
    p_extrato_id: extratoId,
    p_alocacoes: alocacoes,
    p_metodo: "MANUAL",
    p_score: null,
    p_status: "CONCILIADO_MANUAL",
    p_user: userId,
  });
  if (error) return json({ error: error.message }, 400);
  return json({ success: true, ...data });
}

// ─── ACTION: ignorar ─────────────────────────────────────────
// deno-lint-ignore no-explicit-any
async function handleIgnorar(db: any, body: Record<string, unknown>, userId: string | null) {
  const extratoId = String(body.extrato_id ?? "");
  if (!extratoId) return json({ error: "extrato_id obrigatório" }, 400);

  const { data: entry } = await db.from("btg_extrato").select("status_conciliacao, dados_extras").eq("id", extratoId).single();
  if (!entry) return json({ error: "Linha do extrato não encontrada" }, 404);
  if (entry.status_conciliacao !== "PENDENTE") {
    return json({ error: `Só é possível ignorar linhas PENDENTES (atual: ${entry.status_conciliacao})` }, 400);
  }

  const dados = (entry.dados_extras || {}) as Record<string, unknown>;
  const { error } = await db.from("btg_extrato").update({
    status_conciliacao: "IGNORADO",
    metodo_conciliacao: "MANUAL",
    conciliado_por: userId,
    conciliado_em: new Date().toISOString(),
    dados_extras: { ...dados, ignorar_observacao: body.observacao ? String(body.observacao) : null },
    updated_at: new Date().toISOString(),
  }).eq("id", extratoId);
  if (error) return json({ error: error.message }, 500);
  return json({ success: true, status: "IGNORADO" });
}

// ─── ACTION: criar_lancamento ────────────────────────────────
// deno-lint-ignore no-explicit-any
async function handleCriarLancamento(db: any, body: Record<string, unknown>, userId: string | null) {
  const extratoId = String(body.extrato_id ?? "");
  const natureza = body.natureza ? String(body.natureza) : null;
  if (!extratoId || !natureza) return json({ error: "extrato_id e natureza são obrigatórios" }, 400);

  const { data: entry } = await db.from("btg_extrato").select("valor, descricao").eq("id", extratoId).single();
  if (!entry) return json({ error: "Linha do extrato não encontrada" }, 404);

  const { data, error } = await db.rpc("fn_conciliar_extrato", {
    p_extrato_id: extratoId,
    p_alocacoes: [{
      alvo_tipo: "TARIFA",
      alvo_id: null,
      valor_alocado: Number(entry.valor),
      natureza,
      categoria: body.categoria ? String(body.categoria) : undefined,
      descricao: body.descricao ? String(body.descricao) : (entry.descricao ?? undefined),
      observacao: "Lançamento criado manualmente a partir do extrato",
    }],
    p_metodo: "MANUAL",
    p_score: null,
    p_status: "CONCILIADO_MANUAL",
    p_user: userId,
  });
  if (error) return json({ error: error.message }, 400);
  return json({ success: true, ...data });
}

// ─── ACTION: desfazer ────────────────────────────────────────
// deno-lint-ignore no-explicit-any
async function handleDesfazer(db: any, body: Record<string, unknown>, userId: string | null) {
  const extratoId = String(body.extrato_id ?? "");
  if (!extratoId) return json({ error: "extrato_id obrigatório" }, 400);

  const { data, error } = await db.rpc("fn_desconciliar_extrato", {
    p_extrato_id: extratoId,
    p_user: userId,
  });
  if (error) return json({ error: error.message }, 400);
  return json({ success: true, ...data });
}

// ─── MAIN ────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    let action = url.searchParams.get("action") || "";
    let body: Record<string, unknown> | null = null;
    if (req.method === "POST") {
      body = await req.json().catch(() => null);
      if (!action && body?.action) action = String(body.action);
    }
    if (!action) action = "executar";

    const caller = identifyCaller(req);
    const db = getServiceClient();

    // Caller interno (cron/anon) só executa o motor — nada mutador por usuário
    if (caller.interno && !["executar", "sugestoes"].includes(action)) {
      return json({ error: `Ação '${action}' exige usuário autenticado admin` }, 403);
    }

    switch (action) {
      case "executar":
        if (!caller.interno) await requireAdmin(caller.userId);
        return await handleExecutar(db, body);
      case "sugestoes":
        return await handleSugestoes(db, body || {});
      case "confirmar":
        await requireAdmin(caller.userId);
        return await handleConfirmar(db, body || {}, caller.userId);
      case "ignorar":
        await requireAdmin(caller.userId);
        return await handleIgnorar(db, body || {}, caller.userId);
      case "criar_lancamento":
        await requireAdmin(caller.userId);
        return await handleCriarLancamento(db, body || {}, caller.userId);
      case "desfazer":
        await requireAdmin(caller.userId);
        return await handleDesfazer(db, body || {}, caller.userId);
      default:
        return json({ error: `Ação desconhecida: '${action}'. Use: executar, sugestoes, confirmar, ignorar, criar_lancamento, desfazer` }, 400);
    }
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[conciliar-extrato] Unhandled error:", e);
    return json({ error: "Erro interno", details: String(e) }, 500);
  }
});
