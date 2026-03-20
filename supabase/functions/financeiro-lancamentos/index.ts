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
      // ── Lançamentos ──
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
      case "importar_erp":
        return await importarErp(body, auth.userId);
      case "classificar":
        return await classificar(body, auth.userId);
      case "listar_pendentes_validacao":
        return await listarPendentesValidacao(body);
      case "resumo_financeiro":
        return await resumoFinanceiro(body);

      // ── Borderôs ──
      case "listar_borderos":
        return await listarBorderos(body);
      case "criar_bordero":
        return await criarBordero(body, auth.userId);
      case "adicionar_ao_bordero":
        return await adicionarAoBordero(body);
      case "remover_do_bordero":
        return await removerDoBordero(body);
      case "aprovar_bordero":
        return await aprovarBordero(body, auth.userId);
      case "enviar_bordero_btg":
        return await enviarBorderoBtg(body, auth.userId);
      case "cancelar_bordero":
        return await cancelarBordero(body);
      case "detalhe_bordero":
        return await detalheBordero(body);

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

async function requireAdmin(userId: string) {
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin");
  if (!roles || roles.length === 0) {
    throw new Error("Apenas administradores podem executar esta ação");
  }
}

// ═══════════════════════════════════════════════════════════
// LANÇAMENTOS
// ═══════════════════════════════════════════════════════════

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

async function editar(body: Record<string, unknown>, _userId: string) {
  const { id, ...fields } = body;
  if (!id) throw new Error("id obrigatório");

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

async function autorizar(body: Record<string, unknown>, userId: string) {
  const { id } = body;
  if (!id) throw new Error("id obrigatório");
  await requireAdmin(userId);

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

// ═══════════════════════════════════════════════════════════
// BORDERÔS
// ═══════════════════════════════════════════════════════════

async function listarBorderos(body: Record<string, unknown>) {
  const { cod_empresa, status: st, limit: lim } = body;

  let query = supabase
    .from("borderos")
    .select("*")
    .order("created_at", { ascending: false });

  if (cod_empresa) query = query.eq("cod_empresa", cod_empresa);
  if (st) query = query.eq("status", st);
  if (lim) query = query.limit(Number(lim));

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return json(data);
}

async function criarBordero(body: Record<string, unknown>, userId: string) {
  const { cod_empresa, descricao, lancamento_ids } = body;
  if (!cod_empresa) throw new Error("cod_empresa obrigatório");

  const ids = (lancamento_ids as string[]) || [];

  // Create borderô
  const { data: bordero, error: bErr } = await supabase
    .from("borderos")
    .insert({
      cod_empresa: Number(cod_empresa),
      descricao: descricao ? String(descricao) : null,
      criado_por: userId,
      status: "MONTAGEM",
      qtd_lancamentos: ids.length,
      total_valor: 0,
    })
    .select()
    .single();

  if (bErr) throw new Error(bErr.message);

  // Link lancamentos if provided
  if (ids.length > 0) {
    const { error: uErr } = await supabase
      .from("lancamentos_financeiros")
      .update({ bordero_id: bordero.id, status: "BORDERO" })
      .in("id", ids)
      .eq("status", "PREVISTO")
      .eq("tipo", "PAGAR");

    if (uErr) throw new Error(uErr.message);

    // Recalculate totals
    await recalcBordero(bordero.id);
  }

  const { data: updated } = await supabase.from("borderos").select("*").eq("id", bordero.id).single();
  return json(updated, 201);
}

async function adicionarAoBordero(body: Record<string, unknown>) {
  const { bordero_id, lancamento_ids } = body;
  if (!bordero_id) throw new Error("bordero_id obrigatório");
  const ids = (lancamento_ids as string[]) || [];
  if (ids.length === 0) throw new Error("lancamento_ids obrigatório");

  // Verify borderô is in MONTAGEM
  const { data: bordero } = await supabase.from("borderos").select("status").eq("id", bordero_id).single();
  if (!bordero) throw new Error("Borderô não encontrado");
  if (bordero.status !== "MONTAGEM") throw new Error("Borderô não está em montagem");

  const { error } = await supabase
    .from("lancamentos_financeiros")
    .update({ bordero_id: String(bordero_id), status: "BORDERO" })
    .in("id", ids)
    .eq("status", "PREVISTO")
    .eq("tipo", "PAGAR");

  if (error) throw new Error(error.message);
  await recalcBordero(String(bordero_id));
  return json({ ok: true });
}

async function removerDoBordero(body: Record<string, unknown>) {
  const { bordero_id, lancamento_ids } = body;
  if (!bordero_id) throw new Error("bordero_id obrigatório");
  const ids = (lancamento_ids as string[]) || [];
  if (ids.length === 0) throw new Error("lancamento_ids obrigatório");

  const { data: bordero } = await supabase.from("borderos").select("status").eq("id", bordero_id).single();
  if (!bordero) throw new Error("Borderô não encontrado");
  if (bordero.status !== "MONTAGEM") throw new Error("Borderô não está em montagem");

  const { error } = await supabase
    .from("lancamentos_financeiros")
    .update({ bordero_id: null, status: "PREVISTO" })
    .in("id", ids)
    .eq("bordero_id", bordero_id);

  if (error) throw new Error(error.message);
  await recalcBordero(String(bordero_id));
  return json({ ok: true });
}

async function aprovarBordero(body: Record<string, unknown>, userId: string) {
  const { bordero_id } = body;
  if (!bordero_id) throw new Error("bordero_id obrigatório");
  await requireAdmin(userId);

  const { data: bordero } = await supabase.from("borderos").select("*").eq("id", bordero_id).single();
  if (!bordero) throw new Error("Borderô não encontrado");
  if (bordero.status !== "MONTAGEM") throw new Error(`Borderô com status ${bordero.status} não pode ser aprovado`);
  if (bordero.qtd_lancamentos === 0) throw new Error("Borderô vazio — adicione lançamentos antes de aprovar");

  // Update borderô
  const { error: bErr } = await supabase
    .from("borderos")
    .update({
      status: "APROVADO",
      aprovado_por: userId,
      aprovado_em: new Date().toISOString(),
    })
    .eq("id", bordero_id);

  if (bErr) throw new Error(bErr.message);

  // Update linked lancamentos
  const { error: lErr } = await supabase
    .from("lancamentos_financeiros")
    .update({
      status: "AUTORIZADO",
      autorizado_por: userId,
      autorizado_em: new Date().toISOString(),
    })
    .eq("bordero_id", bordero_id)
    .eq("status", "BORDERO");

  if (lErr) throw new Error(lErr.message);

  return json({ ok: true, status: "APROVADO" });
}

async function enviarBorderoBtg(body: Record<string, unknown>, userId: string) {
  const { bordero_id } = body;
  if (!bordero_id) throw new Error("bordero_id obrigatório");
  await requireAdmin(userId);

  const { data: bordero } = await supabase.from("borderos").select("*").eq("id", bordero_id).single();
  if (!bordero) throw new Error("Borderô não encontrado");
  if (bordero.status !== "APROVADO") throw new Error("Borderô precisa estar APROVADO para envio ao banco");

  // Get BTG environment config
  const { data: config } = await supabase
    .from("fornecedor_configuracao")
    .select("ambiente")
    .eq("fornecedor", "btg")
    .eq("ativo", true)
    .single();

  const isSandbox = !config || config.ambiente !== "production";

  if (isSandbox) {
    // Sandbox mock
    const mockBatchId = `sandbox-batch-${Date.now()}`;
    await supabase.from("borderos").update({
      status: "ENVIADO",
      btg_batch_id: mockBatchId,
    }).eq("id", bordero_id);

    await supabase.from("lancamentos_financeiros").update({
      status: "PROCESSANDO",
    }).eq("bordero_id", bordero_id).eq("status", "AUTORIZADO");

    return json({ ok: true, status: "ENVIADO", btg_batch_id: mockBatchId, sandbox: true });
  }

  // Production: BTG Batch Payments API
  const { data: tokenData } = await supabase
    .from("btg_tokens")
    .select("access_token, expires_at")
    .eq("cod_empresa", bordero.cod_empresa)
    .single();

  if (!tokenData) throw new Error("Token BTG não encontrado para esta empresa");
  if (new Date(tokenData.expires_at) < new Date()) throw new Error("Token BTG expirado");

  // Get CNPJ
  const { data: conta } = await supabase
    .from("btg_contas_bancarias")
    .select("cnpj")
    .eq("cod_empresa", bordero.cod_empresa)
    .eq("ativa", true)
    .single();

  const cnpj = conta?.cnpj?.replace(/\D/g, "");
  if (!cnpj) throw new Error("CNPJ não encontrado");

  const apiBase = "https://api.empresas.btgpactual.com";

  // 1. Open batch
  const batchRes = await fetch(`${apiBase}/${cnpj}/banking/batch-payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ description: bordero.descricao || `Borderô ${bordero.id.slice(0, 8)}` }),
  });

  if (!batchRes.ok) {
    const errBody = await batchRes.text();
    throw new Error(`BTG batch-payments open failed: ${batchRes.status} ${errBody}`);
  }

  const batchData = await batchRes.json();
  const batchId = batchData.batchId || batchData.id;

  // 2. Fetch lancamentos for this borderô
  const { data: lancamentos } = await supabase
    .from("lancamentos_financeiros")
    .select("*")
    .eq("bordero_id", bordero_id)
    .eq("status", "AUTORIZADO");

  // 3. Add each payment to the batch
  for (const lanc of (lancamentos || [])) {
    const dados = (lanc.dados_extras || {}) as Record<string, unknown>;
    const paymentPayload: Record<string, unknown> = {
      type: dados.btg_payment_type || "PIX_KEY",
      amount: Number(lanc.valor),
      details: dados.btg_details || {},
    };
    if (dados.scheduledDate) paymentPayload.scheduledDate = dados.scheduledDate;

    await fetch(`${apiBase}/${cnpj}/banking/batch-payments/${batchId}/payments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(paymentPayload),
    });
  }

  // 4. Process the batch
  await fetch(`${apiBase}/${cnpj}/banking/batch-payments/${batchId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "PROCESS" }),
  });

  // 5. Update local records
  await supabase.from("borderos").update({
    status: "ENVIADO",
    btg_batch_id: batchId,
  }).eq("id", bordero_id);

  await supabase.from("lancamentos_financeiros").update({
    status: "PROCESSANDO",
  }).eq("bordero_id", bordero_id).eq("status", "AUTORIZADO");

  return json({ ok: true, status: "ENVIADO", btg_batch_id: batchId });
}

async function cancelarBordero(body: Record<string, unknown>) {
  const { bordero_id } = body;
  if (!bordero_id) throw new Error("bordero_id obrigatório");

  const { data: bordero } = await supabase.from("borderos").select("status").eq("id", bordero_id).single();
  if (!bordero) throw new Error("Borderô não encontrado");
  if (!["MONTAGEM", "APROVADO"].includes(bordero.status)) {
    throw new Error("Borderô já enviado ou processado não pode ser cancelado");
  }

  // Unlink lancamentos back to PREVISTO
  await supabase
    .from("lancamentos_financeiros")
    .update({ bordero_id: null, status: "PREVISTO", autorizado_por: null, autorizado_em: null })
    .eq("bordero_id", bordero_id)
    .in("status", ["BORDERO", "AUTORIZADO"]);

  await supabase.from("borderos").update({ status: "CANCELADO" }).eq("id", bordero_id);

  return json({ ok: true, status: "CANCELADO" });
}

async function detalheBordero(body: Record<string, unknown>) {
  const { bordero_id } = body;
  if (!bordero_id) throw new Error("bordero_id obrigatório");

  const { data: bordero } = await supabase.from("borderos").select("*").eq("id", bordero_id).single();
  if (!bordero) throw new Error("Borderô não encontrado");

  const { data: lancamentos } = await supabase
    .from("lancamentos_financeiros")
    .select("*")
    .eq("bordero_id", bordero_id)
    .order("data_vencimento", { ascending: true });

  return json({ bordero, lancamentos: lancamentos || [] });
}

// ── Helper ──────────────────────────────────────────────
async function recalcBordero(borderoId: string) {
  const { data: lancs } = await supabase
    .from("lancamentos_financeiros")
    .select("valor")
    .eq("bordero_id", borderoId);

  const total = (lancs || []).reduce((s: number, l: { valor: number }) => s + Number(l.valor), 0);
  const qtd = (lancs || []).length;

  await supabase.from("borderos").update({
    total_valor: total,
    qtd_lancamentos: qtd,
  }).eq("id", borderoId);
}

// ═══════════════════════════════════════════════════════════
// IMPORT ERP → LEDGER
// ═══════════════════════════════════════════════════════════

async function importarErp(body: Record<string, unknown>, userId: string) {
  const { cod_empresa, parcelas } = body;
  if (!cod_empresa) throw new Error("cod_empresa obrigatório");
  if (!Array.isArray(parcelas) || parcelas.length === 0) {
    throw new Error("parcelas deve ser um array não vazio");
  }

  const records = parcelas.map((p: Record<string, unknown>) => ({
    cod_empresa: Number(cod_empresa),
    tipo: p.tipo === "PAGAR" ? "PAGAR" : "RECEBER",
    descricao: String(p.descricao || p.documento || "Parcela ERP"),
    valor: Number(p.valor || 0),
    data_vencimento: String(p.data_vencimento),
    data_emissao: p.data_emissao ? String(p.data_emissao) : null,
    pessoa_nome: p.pessoa_nome ? String(p.pessoa_nome) : null,
    pessoa_documento: p.pessoa_documento ? String(p.pessoa_documento) : null,
    forma_pagamento: p.forma_pagamento ? String(p.forma_pagamento) : null,
    adquirente: p.adquirente ? String(p.adquirente) : null,
    bandeira: p.bandeira ? String(p.bandeira) : null,
    numero_parcela: p.numero_parcela ? Number(p.numero_parcela) : null,
    total_parcelas: p.total_parcelas ? Number(p.total_parcelas) : null,
    natureza: p.natureza ? String(p.natureza) : null,
    categoria: p.categoria ? String(p.categoria) : null,
    origem: "ERP",
    origem_id: p.origem_id ? String(p.origem_id) : null,
    criado_por: userId,
    status: "PREVISTO",
  }));

  let inserted = 0;
  let skipped = 0;

  for (const rec of records) {
    if (rec.origem_id) {
      const { data: existing } = await supabase
        .from("lancamentos_financeiros")
        .select("id")
        .eq("origem", "ERP")
        .eq("origem_id", rec.origem_id)
        .eq("cod_empresa", rec.cod_empresa)
        .limit(1);

      if (existing && existing.length > 0) {
        skipped++;
        continue;
      }
    }

    const { error: insErr } = await supabase
      .from("lancamentos_financeiros")
      .insert(rec);

    if (insErr) {
      console.error("[importar_erp] erro ao inserir:", insErr.message);
      skipped++;
    } else {
      inserted++;
    }
  }

  return json({ ok: true, inserted, skipped, total: records.length });
}

// ═══════════════════════════════════════════════════════════
// CLASSIFICAR LANÇAMENTOS (requer_validacao)
// ═══════════════════════════════════════════════════════════

async function classificar(body: Record<string, unknown>, _userId: string) {
  const { id, categoria, natureza, subcategoria, descricao } = body;
  if (!id) throw new Error("id obrigatório");

  const updates: Record<string, unknown> = { requer_validacao: false };
  if (categoria !== undefined) updates.categoria = categoria;
  if (natureza !== undefined) updates.natureza = natureza;
  if (subcategoria !== undefined) updates.subcategoria = subcategoria;
  if (descricao !== undefined) updates.descricao = descricao;

  const { data, error: updErr } = await supabase
    .from("lancamentos_financeiros")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (updErr) throw new Error(updErr.message);
  return json(data);
}

async function listarPendentesValidacao(body: Record<string, unknown>) {
  const { cod_empresa, limit: lim } = body;

  let query = supabase
    .from("lancamentos_financeiros")
    .select("*")
    .eq("requer_validacao", true)
    .order("created_at", { ascending: false });

  if (cod_empresa) query = query.eq("cod_empresa", cod_empresa);
  if (lim) query = query.limit(Number(lim));

  const { data, error: qErr } = await query;
  if (qErr) throw new Error(qErr.message);
  return json(data);
}

// ═══════════════════════════════════════════════════════════
// RESUMO FINANCEIRO UNIFICADO
// ═══════════════════════════════════════════════════════════

async function resumoFinanceiro(body: Record<string, unknown>) {
  const { cod_empresa, data_inicio, data_fim } = body;
  const codEmp = cod_empresa && Number(cod_empresa) > 0 ? Number(cod_empresa) : null;

  // ── 1. Try lancamentos_financeiros (ledger) ──
  let query = supabase
    .from("lancamentos_financeiros")
    .select("tipo, status, valor, valor_pago, requer_validacao, data_vencimento")
    .not("status", "eq", "CANCELADO");

  if (codEmp) query = query.eq("cod_empresa", codEmp);
  if (data_inicio) query = query.gte("data_vencimento", data_inicio);
  if (data_fim) query = query.lte("data_vencimento", data_fim);

  const { data: lancs, error: lErr } = await query;
  if (lErr) throw new Error(lErr.message);

  const hoje = new Date().toISOString().slice(0, 10);

  let totalReceberAberto = 0;
  let totalPagarAberto = 0;
  let totalBaixadoReceber = 0;
  let totalBaixadoPagar = 0;
  let qtdVencidos = 0;
  let qtdPendentesValidacao = 0;
  let totalLancamentos = 0;

  const useLedger = (lancs || []).length > 0;

  if (useLedger) {
    for (const l of (lancs || [])) {
      totalLancamentos++;
      const val = Number(l.valor || 0);
      const valPago = Number(l.valor_pago || 0);

      if (l.requer_validacao) qtdPendentesValidacao++;

      if (l.status === "BAIXADO") {
        if (l.tipo === "RECEBER") totalBaixadoReceber += valPago || val;
        else totalBaixadoPagar += valPago || val;
      } else {
        if (l.tipo === "RECEBER") totalReceberAberto += val;
        else totalPagarAberto += val;

        if (l.data_vencimento < hoje && l.status === "PREVISTO") {
          qtdVencidos++;
        }
      }
    }
  } else {
    // ── Fallback: parcelas_cache (ERP data) ──
    console.log("[resumo] Ledger vazio, usando parcelas_cache como fallback");
    let cacheQuery = supabase
      .from("parcelas_cache")
      .select("tipo_lancamento, situacao, valor, valor_pago, data_vencimento");

    if (codEmp) cacheQuery = cacheQuery.eq("cod_empresa", codEmp);
    if (data_inicio) cacheQuery = cacheQuery.gte("data_vencimento", data_inicio);
    if (data_fim) cacheQuery = cacheQuery.lte("data_vencimento", data_fim);

    const { data: parcelas, error: pErr } = await cacheQuery;
    if (pErr) throw new Error(pErr.message);

    for (const p of (parcelas || [])) {
      totalLancamentos++;
      const val = Number(p.valor || 0);
      const valPago = Number(p.valor_pago || 0);

      if (p.situacao === "PAGA") {
        if (p.tipo_lancamento === "RECEBER") totalBaixadoReceber += valPago || val;
        else totalBaixadoPagar += valPago || val;
      } else {
        if (p.tipo_lancamento === "RECEBER") totalReceberAberto += val;
        else totalPagarAberto += val;

        if (p.data_vencimento && p.data_vencimento < hoje && p.situacao === "EM ABERTO") {
          qtdVencidos++;
        }
        if (p.situacao === "EM ATRASO") {
          qtdVencidos++;
        }
      }
    }
  }

  // ── Borderôs ──
  let bQuery = supabase
    .from("borderos")
    .select("status, total_valor")
    .in("status", ["MONTAGEM", "APROVADO", "ENVIADO"]);

  if (codEmp) bQuery = bQuery.eq("cod_empresa", codEmp);

  const { data: borderosData } = await bQuery;
  const borderosAbertos = (borderosData || []).length;
  const borderosTotalValor = (borderosData || []).reduce((s: number, b: { total_valor: number }) => s + Number(b.total_valor || 0), 0);

  // ── Recebíveis cartão ──
  let rcQuery = supabase
    .from("recebiveis_cartao")
    .select("status, valor_bruto, valor_liquido, taxa_valor");

  if (codEmp) rcQuery = rcQuery.eq("cod_empresa", codEmp);

  const { data: recebiveis } = await rcQuery;
  const recebiveisPendentes = (recebiveis || []).filter((r: { status: string }) => r.status === "PREVISTO").length;
  const totalTaxasCartao = (recebiveis || []).reduce((s: number, r: { taxa_valor: number | null }) => s + Number(r.taxa_valor || 0), 0);

  return json({
    totalReceberAberto,
    totalPagarAberto,
    saldoAberto: totalReceberAberto - totalPagarAberto,
    totalBaixadoReceber,
    totalBaixadoPagar,
    saldoBaixado: totalBaixadoReceber - totalBaixadoPagar,
    qtdVencidos,
    qtdPendentesValidacao,
    totalLancamentos,
    borderosAbertos,
    borderosTotalValor,
    recebiveisPendentes,
    totalTaxasCartao,
  });
}
