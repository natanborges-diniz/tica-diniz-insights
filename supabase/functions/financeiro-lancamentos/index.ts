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
      case "criar":
        return await criar(body, auth.userId);
      case "editar":
        return await editar(body, auth.userId);
      case "excluir":
        return await excluir(body);
      case "autorizar":
        return await autorizar(body, auth.userId);
      case "baixar":
        return await baixar(body, auth.userId);
      case "cancelar":
        return await cancelar(body);
      default:
        return json({ error: `Action desconhecida: ${action}` }, 400);
    }
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[financeiro-lancamentos]", err);
    return json({ error: err.message || "Erro interno" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── LISTAR ──────────────────────────────────────────────
async function listar(body: Record<string, unknown>) {
  const { cod_empresa, tipo, status, natureza, origem, data_inicio, data_fim, requer_validacao, limit: lim } = body;

  let query = supabase
    .from("lancamentos_financeiros")
    .select("*")
    .order("data_vencimento", { ascending: true });

  if (cod_empresa) query = query.eq("cod_empresa", cod_empresa);
  if (tipo) query = query.eq("tipo", tipo);
  if (status) query = query.eq("status", status);
  if (natureza) query = query.eq("natureza", natureza);
  if (origem) query = query.eq("origem", origem);
  if (data_inicio) query = query.gte("data_vencimento", data_inicio);
  if (data_fim) query = query.lte("data_vencimento", data_fim);
  if (requer_validacao !== undefined) query = query.eq("requer_validacao", requer_validacao);
  if (lim) query = query.limit(Number(lim));

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return json(data);
}

// ── CRIAR ───────────────────────────────────────────────
async function criar(body: Record<string, unknown>, userId: string) {
  const record = {
    cod_empresa: body.cod_empresa,
    tipo: body.tipo,
    descricao: body.descricao,
    valor: body.valor,
    data_vencimento: body.data_vencimento,
    pessoa_nome: body.pessoa_nome || null,
    pessoa_documento: body.pessoa_documento || null,
    natureza: body.natureza || null,
    categoria: body.categoria || null,
    subcategoria: body.subcategoria || null,
    forma_pagamento: body.forma_pagamento || null,
    adquirente: body.adquirente || null,
    bandeira: body.bandeira || null,
    numero_parcela: body.numero_parcela || null,
    total_parcelas: body.total_parcelas || null,
    data_emissao: body.data_emissao || null,
    observacao: body.observacao || null,
    origem: body.origem || "MANUAL",
    origem_id: body.origem_id || null,
    recorrente: body.recorrente || false,
    recorrencia_tipo: body.recorrencia_tipo || null,
    criado_por: userId,
    status: "PREVISTO",
  };

  const { data, error } = await supabase
    .from("lancamentos_financeiros")
    .insert(record)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return json(data, 201);
}

// ── EDITAR ──────────────────────────────────────────────
async function editar(body: Record<string, unknown>, _userId: string) {
  const { id, ...fields } = body;
  if (!id) throw new Error("id obrigatório");

  // Only allow editing PREVISTO entries
  const { data: existing } = await supabase
    .from("lancamentos_financeiros")
    .select("status")
    .eq("id", id)
    .single();

  if (!existing) throw new Error("Lançamento não encontrado");
  if (existing.status !== "PREVISTO") {
    throw new Error("Apenas lançamentos PREVISTO podem ser editados");
  }

  delete fields.action;
  const { data, error } = await supabase
    .from("lancamentos_financeiros")
    .update(fields)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return json(data);
}

// ── EXCLUIR ─────────────────────────────────────────────
async function excluir(body: Record<string, unknown>) {
  const { id } = body;
  if (!id) throw new Error("id obrigatório");

  const { error } = await supabase
    .from("lancamentos_financeiros")
    .delete()
    .eq("id", id)
    .eq("status", "PREVISTO");

  if (error) throw new Error(error.message);
  return json({ ok: true });
}

// ── AUTORIZAR ───────────────────────────────────────────
async function autorizar(body: Record<string, unknown>, userId: string) {
  const { id } = body;
  if (!id) throw new Error("id obrigatório");

  // Verify admin role
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin");

  if (!roles || roles.length === 0) {
    throw new Error("Apenas administradores podem autorizar lançamentos");
  }

  const { data, error } = await supabase
    .from("lancamentos_financeiros")
    .update({
      status: "AUTORIZADO",
      autorizado_por: userId,
      autorizado_em: new Date().toISOString(),
    })
    .eq("id", id)
    .in("status", ["PREVISTO", "BORDERO"])
    .select()
    .single();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Lançamento não encontrado ou status inválido para autorização");
  return json(data);
}

// ── BAIXAR ──────────────────────────────────────────────
async function baixar(body: Record<string, unknown>, userId: string) {
  const { id, valor_pago, data_pagamento } = body;
  if (!id) throw new Error("id obrigatório");

  const { data, error } = await supabase
    .from("lancamentos_financeiros")
    .update({
      status: "BAIXADO",
      valor_pago: valor_pago || null,
      data_pagamento: data_pagamento || new Date().toISOString().slice(0, 10),
      data_baixa: new Date().toISOString().slice(0, 10),
      baixado_por: userId,
      baixado_em: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return json(data);
}

// ── CANCELAR ────────────────────────────────────────────
async function cancelar(body: Record<string, unknown>) {
  const { id } = body;
  if (!id) throw new Error("id obrigatório");

  const { data, error } = await supabase
    .from("lancamentos_financeiros")
    .update({ status: "CANCELADO" })
    .eq("id", id)
    .not("status", "eq", "BAIXADO")
    .select()
    .single();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Lançamento não encontrado ou já baixado");
  return json(data);
}
