import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, authGuard } from "../_shared/authGuard.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authGuard(req, { requiredRole: "authenticated" });
    const body = await req.json();
    const action = body.action;

    switch (action) {
      case "listar":
        return await listar(body);
      case "conciliar_auto":
        return await conciliarAuto(body, auth.userId);
      case "conciliar_manual":
        return await conciliarManual(body, auth.userId);
      case "marcar_divergente":
        return await marcarDivergente(body);
      case "detalhe":
        return await detalhe(body);
      default:
        return json({ error: `Action desconhecida: ${action}` }, 400);
    }
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[btg-recebiveis-cartao]", err);
    return json({ error: (err as Error).message || "Erro interno" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ═══════════════════════════════════════════════════════════
// LISTAR recebíveis (agora alimentados pela Rede via sync-vendas-cartao)
// ═══════════════════════════════════════════════════════════
async function listar(body: Record<string, unknown>) {
  const { cod_empresa, status: st, data_inicio, data_fim, adquirente, bandeira, limit: lim } = body;

  let query = supabase
    .from("recebiveis_cartao")
    .select("*, recebiveis_cartao_parcelas(id, lancamento_id, valor_parcela, numero_parcela)")
    .order("data_vencimento", { ascending: true });

  if (cod_empresa) query = query.eq("cod_empresa", cod_empresa);
  if (st) query = query.eq("status", st);
  if (data_inicio) query = query.gte("data_vencimento", data_inicio);
  if (data_fim) query = query.lte("data_vencimento", data_fim);
  if (adquirente) query = query.eq("adquirente", adquirente);
  if (bandeira) query = query.eq("bandeira", bandeira);
  if (lim) query = query.limit(Number(lim));

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return json(data);
}

// ═══════════════════════════════════════════════════════════
// CONCILIAÇÃO AUTOMÁTICA — ERP lancamentos vs recebiveis_cartao
// ═══════════════════════════════════════════════════════════
async function conciliarAuto(body: Record<string, unknown>, userId: string) {
  const { cod_empresa } = body;
  if (!cod_empresa) throw new Error("cod_empresa obrigatório");

  const { data: recebiveis, error: rErr } = await supabase
    .from("recebiveis_cartao")
    .select("*")
    .eq("cod_empresa", cod_empresa)
    .eq("status", "PREVISTO");

  if (rErr) throw new Error(rErr.message);
  if (!recebiveis || recebiveis.length === 0) return json({ conciliados: 0, taxas_geradas: 0 });

  const { data: lancamentos, error: lErr } = await supabase
    .from("lancamentos_financeiros")
    .select("*")
    .eq("cod_empresa", cod_empresa)
    .eq("tipo", "RECEBER")
    .eq("status", "PREVISTO")
    .in("forma_pagamento", ["CARTAO_CREDITO", "CARTAO_DEBITO"]);

  if (lErr) throw new Error(lErr.message);

  const groups: Record<string, Array<{ id: string; valor: number; numero_parcela: number | null }>> = {};
  for (const l of (lancamentos || [])) {
    const key = `${(l.adquirente || "").toUpperCase()}|${(l.bandeira || "").toUpperCase()}|${l.data_vencimento}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push({ id: l.id, valor: Number(l.valor), numero_parcela: l.numero_parcela });
  }

  let conciliados = 0;
  let taxasGeradas = 0;

  for (const rec of recebiveis) {
    const key = `${(rec.adquirente || "").toUpperCase()}|${(rec.bandeira || "").toUpperCase()}|${rec.data_vencimento}`;
    const group = groups[key];
    if (!group || group.length === 0) continue;

    const somaGrupo = group.reduce((s: number, g: { valor: number }) => s + g.valor, 0);
    const tolerance = Math.abs(somaGrupo - Number(rec.valor_bruto));
    if (tolerance > somaGrupo * 0.01 && tolerance > 1) continue;

    for (const item of group) {
      await supabase.from("recebiveis_cartao_parcelas").insert({
        recebivel_id: rec.id,
        lancamento_id: item.id,
        valor_parcela: item.valor,
        numero_parcela: item.numero_parcela,
      });
    }

    await supabase.from("recebiveis_cartao").update({ status: "CONCILIADO" }).eq("id", rec.id);

    const ids = group.map((g: { id: string }) => g.id);
    await supabase.from("lancamentos_financeiros").update({
      status: "CONCILIADO_CARTAO",
      recebivel_cartao_id: rec.id,
    }).in("id", ids);

    conciliados++;

    const taxaValor = Number(rec.taxa_valor || 0);
    if (taxaValor > 0) {
      await supabase.from("lancamentos_financeiros").insert({
        cod_empresa: Number(cod_empresa),
        tipo: "PAGAR",
        descricao: `Taxa ${rec.adquirente} ${rec.bandeira} - ${rec.data_vencimento}`,
        valor: taxaValor,
        data_vencimento: rec.data_vencimento,
        natureza: "DESPESAS_FINANCEIRAS",
        categoria: "TAXA_ADQUIRENTE",
        forma_pagamento: "DEBITO_AUTOMATICO",
        origem: "SISTEMA",
        origem_id: rec.id,
        recebivel_cartao_id: rec.id,
        status: "PREVISTO",
        criado_por: userId,
      });
      taxasGeradas++;
    }
  }

  return json({ conciliados, taxas_geradas: taxasGeradas });
}

// ═══════════════════════════════════════════════════════════
// CONCILIAÇÃO MANUAL
// ═══════════════════════════════════════════════════════════
async function conciliarManual(body: Record<string, unknown>, userId: string) {
  const { recebivel_id, lancamento_ids } = body;
  if (!recebivel_id) throw new Error("recebivel_id obrigatório");

  await supabase.from("recebiveis_cartao").update({ status: "CONCILIADO" }).eq("id", recebivel_id);

  if (Array.isArray(lancamento_ids)) {
    for (const lid of lancamento_ids) {
      await supabase.from("recebiveis_cartao_parcelas").insert({
        recebivel_id,
        lancamento_id: lid,
      });
      await supabase.from("lancamentos_financeiros").update({
        status: "CONCILIADO_CARTAO",
        recebivel_cartao_id: recebivel_id,
      }).eq("id", lid);
    }
  }

  return json({ ok: true });
}

// ═══════════════════════════════════════════════════════════
// MARCAR DIVERGENTE
// ═══════════════════════════════════════════════════════════
async function marcarDivergente(body: Record<string, unknown>) {
  const { recebivel_id } = body;
  if (!recebivel_id) throw new Error("recebivel_id obrigatório");

  await supabase.from("recebiveis_cartao").update({ status: "DIVERGENTE" }).eq("id", recebivel_id);
  return json({ ok: true });
}

// ═══════════════════════════════════════════════════════════
// DETALHE — lancamentos vinculados a um recebível
// ═══════════════════════════════════════════════════════════
async function detalhe(body: Record<string, unknown>) {
  const { recebivel_id } = body;
  if (!recebivel_id) throw new Error("recebivel_id obrigatório");

  const { data: parcelas } = await supabase
    .from("recebiveis_cartao_parcelas")
    .select("lancamento_id")
    .eq("recebivel_id", recebivel_id);

  const lancIds = (parcelas || []).map((p: { lancamento_id: string }) => p.lancamento_id).filter(Boolean);

  let lancamentos: unknown[] = [];
  if (lancIds.length > 0) {
    const { data } = await supabase
      .from("lancamentos_financeiros")
      .select("id, descricao, pessoa_nome, valor, data_vencimento, status")
      .in("id", lancIds);
    lancamentos = data || [];
  }

  return json({ recebivel_id, lancamentos });
}
