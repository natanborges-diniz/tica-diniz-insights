// supabase/functions/folha-pagamento/index.ts
// Folha de pagamento — importação, fechamento e envio ao BTG.
//
// Fluxo:
//   1. importar  — planilha do contador vira competência + itens (+ encargos)
//   2. fechar    — cria os lançamentos no contas a pagar e um borderô do tipo
//                  FOLHA, que passa pela mesma aprovação dos demais
//   3. o envio   — feito pelo borderô (financeiro-lancamentos), que roteia para
//                  /banking/payroll/payments quando o tipo é FOLHA
//
// O envio mora no borderô de propósito: assim existe UM lugar que fala com o
// banco e UM fluxo de aprovação, em vez de dois caminhos paralelos divergindo
// com o tempo — que foi exatamente o problema que passamos o dia consertando
// entre btg-pagamentos e financeiro-lancamentos.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, authGuard } from "../_shared/authGuard.ts";
import {
  ehEventoFolha,
  validarLinha,
  montarEncargos,
  totalizar,
  ROTULO_EVENTO,
  type EventoFolha,
  type LinhaFolha,
  type TipoEncargo,
} from "../_shared/folha.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requireAdmin(userId: string) {
  const { data } = await supabase.from("user_roles")
    .select("role").eq("user_id", userId).eq("role", "admin");
  if (!data || data.length === 0) throw new Error("Apenas admin");
}

// ─── importar ────────────────────────────────────────────────
/**
 * Recebe a planilha já parseada pelo front (nome, cpf, banco, valores).
 *
 * Reimportar a mesma (loja, competência, evento) SUBSTITUI os itens em vez de
 * duplicar — planilha de contador costuma vir corrigida duas ou três vezes
 * antes de fechar, e a segunda versão é a que vale.
 */
async function importar(body: Record<string, unknown>, userId: string) {
  const { cod_empresa, competencia, evento, data_pagamento, descricao } = body;
  const linhas = (body.itens as LinhaFolha[]) || [];
  const encargosInformados = (body.encargos || {}) as Partial<Record<TipoEncargo, number>>;

  if (!cod_empresa) throw new Error("cod_empresa obrigatório");
  if (!/^\d{4}-\d{2}$/.test(String(competencia))) throw new Error("competencia deve ser YYYY-MM");
  if (!ehEventoFolha(evento)) throw new Error(`Evento inválido: ${evento}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data_pagamento))) throw new Error("data_pagamento deve ser yyyy-MM-dd");
  if (linhas.length === 0) throw new Error("Planilha sem colaboradores");

  const validadas = linhas.map(validarLinha);
  const comErro = validadas.filter((l) => l.erros.length > 0);
  if (comErro.length > 0) {
    // Devolve TODOS os problemas de uma vez: corrigir de um em um numa folha de
    // cem pessoas é inviável.
    return json({
      ok: false,
      code: "PLANILHA_INVALIDA",
      error: `${comErro.length} linha(s) com problema`,
      linhas_invalidas: comErro.map((l) => ({ nome: l.nome, cpf: l.cpf, erros: l.erros })),
    });
  }

  const ev = evento as EventoFolha;
  const totais = totalizar(validadas);

  const { data: existente } = await supabase
    .from("folha_competencias")
    .select("id, status")
    .eq("cod_empresa", Number(cod_empresa))
    .eq("competencia", String(competencia))
    .eq("evento", ev)
    .neq("status", "CANCELADA")
    .maybeSingle();

  if (existente && existente.status !== "RASCUNHO") {
    throw new Error(
      `Já existe folha de ${ROTULO_EVENTO[ev]} para ${competencia} em ${existente.status}. ` +
      `Cancele antes de reimportar.`,
    );
  }

  let competenciaId = existente?.id as string | undefined;

  if (competenciaId) {
    await supabase.from("folha_competencias").update({
      data_pagamento: String(data_pagamento),
      descricao: descricao ? String(descricao) : null,
      ...totais,
    }).eq("id", competenciaId);
    // Substitui itens e encargos — a versão nova da planilha manda.
    await supabase.from("folha_itens").delete().eq("competencia_id", competenciaId);
    await supabase.from("folha_encargos").delete().eq("competencia_id", competenciaId);
  } else {
    const { data: nova, error } = await supabase.from("folha_competencias").insert({
      cod_empresa: Number(cod_empresa),
      competencia: String(competencia),
      evento: ev,
      descricao: descricao ? String(descricao) : `${ROTULO_EVENTO[ev]} ${competencia}`,
      data_pagamento: String(data_pagamento),
      status: "RASCUNHO",
      criado_por: userId,
      ...totais,
    }).select("id").single();
    if (error) throw new Error(error.message);
    competenciaId = nova.id;
  }

  const { error: itErr } = await supabase.from("folha_itens").insert(
    validadas.map((l) => ({
      competencia_id: competenciaId,
      nome: l.nome.trim(),
      cpf: l.cpf,
      matricula: l.matricula ?? null,
      banco: l.banco ?? null,
      agencia: l.agencia ?? null,
      conta: l.conta ?? null,
      tipo_conta: l.tipo_conta ?? "CC",
      chave_pix: l.chave_pix ?? null,
      valor_bruto: Number(l.valor_bruto ?? 0),
      descontos: Number(l.descontos ?? 0),
      valor_liquido: Number(l.valor_liquido),
    })),
  );
  if (itErr) throw new Error(itErr.message);

  const encargos = montarEncargos(String(competencia), encargosInformados);
  if (encargos.length > 0) {
    await supabase.from("folha_encargos").insert(
      encargos.map((e) => ({ competencia_id: competenciaId, ...e })),
    );
  }

  return json({
    ok: true,
    competencia_id: competenciaId,
    ...totais,
    encargos: encargos.length,
    substituiu: !!existente,
  });
}

// ─── listar / detalhe ────────────────────────────────────────
async function listar(body: Record<string, unknown>) {
  let q = supabase.from("folha_competencias").select("*")
    .order("competencia", { ascending: false })
    .order("created_at", { ascending: false });
  if (body.cod_empresa) q = q.eq("cod_empresa", Number(body.cod_empresa));
  if (body.status) q = q.eq("status", String(body.status));
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return json(data || []);
}

async function detalhe(body: Record<string, unknown>) {
  const id = String(body.competencia_id || "");
  if (!id) throw new Error("competencia_id obrigatório");

  const { data: comp } = await supabase.from("folha_competencias").select("*").eq("id", id).single();
  if (!comp) throw new Error("Folha não encontrada");

  const { data: itens } = await supabase.from("folha_itens")
    .select("*").eq("competencia_id", id).order("nome");
  const { data: encargos } = await supabase.from("folha_encargos")
    .select("*").eq("competencia_id", id).order("data_vencimento");

  return json({ competencia: comp, itens: itens || [], encargos: encargos || [] });
}

// ─── fechar ──────────────────────────────────────────────────
/**
 * Fecha a folha: cria os lançamentos no contas a pagar e o borderô do tipo
 * FOLHA já montado.
 *
 * O líquido de cada colaborador vira um lançamento (decisão da casa: folha
 * aberta, sem consolidação). Os encargos viram títulos próprios, com o
 * vencimento legal de cada um — assim o custo do mês aparece inteiro no DRE
 * mesmo antes de a guia ser emitida, e não entram no borderô de folha porque
 * são pagos por guia/DARF.
 */
async function fechar(body: Record<string, unknown>, userId: string) {
  await requireAdmin(userId);
  const id = String(body.competencia_id || "");
  if (!id) throw new Error("competencia_id obrigatório");

  const { data: comp } = await supabase.from("folha_competencias").select("*").eq("id", id).single();
  if (!comp) throw new Error("Folha não encontrada");
  if (comp.status !== "RASCUNHO") throw new Error(`Folha já está ${comp.status}`);

  const { data: itens } = await supabase.from("folha_itens").select("*").eq("competencia_id", id);
  if (!itens || itens.length === 0) throw new Error("Folha sem colaboradores");

  const ev = comp.evento as EventoFolha;
  const rotulo = ROTULO_EVENTO[ev] ?? ev;

  // 1. Borderô do tipo FOLHA — passa pela mesma aprovação dos demais.
  const { data: bordero, error: bErr } = await supabase.from("borderos").insert({
    cod_empresa: comp.cod_empresa,
    tipo: "FOLHA",
    folha_competencia_id: id,
    descricao: `${rotulo} ${comp.competencia}`,
    data_pagamento: comp.data_pagamento,
    modo_data: "DATA_UNICA",
    status: "MONTAGEM",
    criado_por: userId,
    qtd_lancamentos: itens.length,
    total_valor: Number(comp.total_liquido),
  }).select().single();
  if (bErr) throw new Error(bErr.message);

  // 2. Um lançamento por colaborador, já no borderô.
  let criados = 0;
  for (const it of itens) {
    const { data: lanc, error } = await supabase.from("lancamentos_financeiros").insert({
      cod_empresa: comp.cod_empresa,
      tipo: "PAGAR",
      descricao: `${rotulo} ${comp.competencia} — ${it.nome}`,
      pessoa_nome: it.nome,
      pessoa_documento: it.cpf,
      valor: Number(it.valor_liquido),
      data_vencimento: comp.data_pagamento,
      natureza: "DESPESAS_OPERACIONAIS",
      categoria: "PESSOAL",
      subcategoria: rotulo,
      origem: "FOLHA",
      origem_id: `FOLHA:${id}:${it.id}`,
      bordero_id: bordero.id,
      status: "BORDERO",
      criado_por: userId,
      dados_extras: {
        folha_competencia_id: id,
        folha_item_id: it.id,
        folha_evento: ev,
        banco: it.banco,
        agencia: it.agencia,
        conta: it.conta,
        chave_pix: it.chave_pix,
      },
    }).select("id").single();

    if (!error && lanc) {
      await supabase.from("folha_itens").update({ lancamento_id: lanc.id }).eq("id", it.id);
      criados++;
    }
  }

  // 3. Encargos: títulos avulsos, fora do borderô de folha (vão por guia/DARF).
  const { data: encargos } = await supabase.from("folha_encargos").select("*").eq("competencia_id", id);
  let encargosCriados = 0;
  for (const e of (encargos || [])) {
    const { data: lanc, error } = await supabase.from("lancamentos_financeiros").insert({
      cod_empresa: comp.cod_empresa,
      tipo: "PAGAR",
      descricao: e.descricao || `${e.tipo} — folha ${comp.competencia}`,
      valor: Number(e.valor),
      data_vencimento: e.data_vencimento,
      natureza: "DESPESAS_OPERACIONAIS",
      categoria: "ENCARGOS",
      subcategoria: e.tipo,
      origem: "FOLHA",
      origem_id: `FOLHA:${id}:ENCARGO:${e.tipo}`,
      status: "PREVISTO",
      requer_validacao: true, // aguarda a guia com o código de barras
      criado_por: userId,
      dados_extras: { folha_competencia_id: id, encargo_tipo: e.tipo },
    }).select("id").single();
    if (!error && lanc) {
      await supabase.from("folha_encargos").update({ lancamento_id: lanc.id }).eq("id", e.id);
      encargosCriados++;
    }
  }

  await supabase.from("folha_competencias").update({
    status: "FECHADA",
    fechado_por: userId,
    fechado_em: new Date().toISOString(),
  }).eq("id", id);

  return json({
    ok: true,
    bordero_id: bordero.id,
    lancamentos: criados,
    encargos: encargosCriados,
    total_liquido: Number(comp.total_liquido),
  });
}

// ─── cancelar ────────────────────────────────────────────────
async function cancelar(body: Record<string, unknown>, userId: string) {
  await requireAdmin(userId);
  const id = String(body.competencia_id || "");
  if (!id) throw new Error("competencia_id obrigatório");

  const { data: comp } = await supabase.from("folha_competencias").select("status").eq("id", id).single();
  if (!comp) throw new Error("Folha não encontrada");
  if (!["RASCUNHO", "FECHADA"].includes(comp.status)) {
    throw new Error(`Folha em ${comp.status} não pode ser cancelada — já foi ao banco`);
  }

  // Cancela os lançamentos gerados que ainda não foram pagos.
  await supabase.from("lancamentos_financeiros")
    .update({ status: "CANCELADO", bordero_id: null })
    .like("origem_id", `FOLHA:${id}:%`)
    .not("status", "in", "(BAIXADO,PROCESSANDO)");

  await supabase.from("borderos").update({ status: "CANCELADO" }).eq("folha_competencia_id", id);
  await supabase.from("folha_competencias").update({ status: "CANCELADA" }).eq("id", id);

  return json({ ok: true });
}

// ─── MAIN ────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await authGuard(req, { requiredRole: "authenticated" });
    const body = await req.json();

    switch (body.action) {
      case "importar": return await importar(body, auth.userId);
      case "listar": return await listar(body);
      case "detalhe": return await detalhe(body);
      case "fechar": return await fechar(body, auth.userId);
      case "cancelar": return await cancelar(body, auth.userId);
      default:
        return json({ error: `Ação desconhecida: '${body.action}'. Use: importar, listar, detalhe, fechar, cancelar` }, 400);
    }
  } catch (err) {
    console.error("[folha-pagamento]", err);
    return json({ error: err instanceof Error ? err.message : "Erro interno" }, 500);
  }
});
