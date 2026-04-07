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
      case "reabrir":
        return await reabrir(body, auth.userId);
      case "cancelar":
        return await cancelar(body);
      case "importar_erp":
        return await importarErp(body, auth.userId);
      case "importar_erp_auto":
        return await importarErpAuto(body, auth.userId);
      case "classificar":
        return await classificar(body, auth.userId);
      case "classificar_lote":
        return await classificarLote(body, auth.userId);
      case "cancelar_lote":
        return await cancelarLote(body);
      case "listar_pendentes_validacao":
        return await listarPendentesValidacao(body);
      case "resumo_financeiro":
        return await resumoFinanceiro(body);
      case "confirmar_processamento":
        return await confirmarProcessamento(body, auth.userId);

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
  const { cod_empresa, tipo, status, natureza, origem, data_inicio, data_fim, campo_data, requer_validacao, limit: lim } = body;

  const dateColumn = campo_data === "EMISSAO" ? "data_emissao" : "data_vencimento";

  let query = supabase
    .from("lancamentos_financeiros")
    .select("*")
    .order("data_vencimento", { ascending: true });

  if (cod_empresa) query = query.eq("cod_empresa", cod_empresa);
  if (tipo) query = query.eq("tipo", tipo);
  if (status) query = query.eq("status", status);
  if (natureza) query = query.eq("natureza", natureza);
  if (origem) query = query.eq("origem", origem);
  if (data_inicio) query = query.gte(dateColumn, data_inicio);
  if (data_fim) query = query.lte(dateColumn, data_fim);
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
    dados_extras: body.dados_extras || {},
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

  // Allow editing natureza/categoria/observacao on any non-CANCELADO status
  // Full edit only on PREVISTO
  const allowedFieldsAnyStatus = ["natureza", "categoria", "subcategoria", "observacao", "dados_extras"];
  delete fields.action;

  if (existing.status !== "PREVISTO") {
    const editKeys = Object.keys(fields);
    const disallowed = editKeys.filter(k => !allowedFieldsAnyStatus.includes(k));
    if (disallowed.length > 0) {
      throw new Error(`Lançamento com status ${existing.status}: só é possível editar classificação (natureza, categoria). Campos bloqueados: ${disallowed.join(", ")}`);
    }
  }

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

async function reabrir(body: Record<string, unknown>, userId: string) {
  const { id } = body;
  if (!id) throw new Error("id obrigatório");
  await requireAdmin(userId);

  const { data: existing } = await supabase
    .from("lancamentos_financeiros")
    .select("status")
    .eq("id", id)
    .single();

  if (!existing) throw new Error("Lançamento não encontrado");
  if (!["BAIXADO", "AUTORIZADO"].includes(existing.status)) {
    throw new Error("Apenas lançamentos BAIXADOS ou AUTORIZADOS podem ser reabertos");
  }

  const { data, error } = await supabase
    .from("lancamentos_financeiros")
    .update({
      status: "PREVISTO",
      valor_pago: null,
      data_pagamento: null,
      data_baixa: null,
      baixado_por: null,
      baixado_em: null,
      bordero_id: null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
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

  if (ids.length > 0) {
    const { error: uErr } = await supabase
      .from("lancamentos_financeiros")
      .update({ bordero_id: bordero.id, status: "BORDERO" })
      .in("id", ids)
      .in("status", ["PREVISTO", "CLASSIFICADO"])
      .eq("tipo", "PAGAR");

    if (uErr) throw new Error(uErr.message);
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

  const { data: bordero } = await supabase.from("borderos").select("status").eq("id", bordero_id).single();
  if (!bordero) throw new Error("Borderô não encontrado");
  if (bordero.status !== "MONTAGEM") throw new Error("Borderô não está em montagem");

  const { error } = await supabase
    .from("lancamentos_financeiros")
    .update({ bordero_id: String(bordero_id), status: "BORDERO" })
    .in("id", ids)
    .in("status", ["PREVISTO", "CLASSIFICADO"])
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
    .update({ bordero_id: null, status: "PREVISTO", autorizado_por: null, autorizado_em: null })
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

  const { error: bErr } = await supabase
    .from("borderos")
    .update({
      status: "APROVADO",
      aprovado_por: userId,
      aprovado_em: new Date().toISOString(),
    })
    .eq("id", bordero_id);

  if (bErr) throw new Error(bErr.message);

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

  // Fetch lancamentos for this borderô
  const { data: lancamentos } = await supabase
    .from("lancamentos_financeiros")
    .select("*")
    .eq("bordero_id", bordero_id)
    .eq("status", "AUTORIZADO");

  if (isSandbox) {
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

  // 2. Add each payment to the batch — auto-detect type from dados_extras
  for (const lanc of (lancamentos || [])) {
    const dados = (lanc.dados_extras || {}) as Record<string, unknown>;
    
    // Auto-detect payment type: DDA-linked → BANKSLIP, otherwise use configured type
    let paymentType = String(dados.btg_payment_type || "PIX_KEY");
    const paymentDetails: Record<string, unknown> = {};

    if (lanc.btg_dda_id && dados.linha_digitavel) {
      // DDA-linked: force BANKSLIP with barcode
      paymentType = "BANKSLIP";
      paymentDetails.barcode = String(dados.linha_digitavel);
    } else if (dados.btg_details) {
      Object.assign(paymentDetails, dados.btg_details as Record<string, unknown>);
    }

    const paymentPayload: Record<string, unknown> = {
      type: paymentType,
      amount: Number(lanc.valor),
      details: paymentDetails,
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

  // 3. Process the batch
  await fetch(`${apiBase}/${cnpj}/banking/batch-payments/${batchId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "PROCESS" }),
  });

  // 4. Update local records
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
// IMPORT ERP → LEDGER (manual, receives parcelas array)
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
// IMPORT ERP AUTO — reads from parcelas_cache + DDA cross-match
// ═══════════════════════════════════════════════════════════

async function importarErpAuto(body: Record<string, unknown>, userId: string) {
  const { cod_empresa, data_inicio, data_fim, tipo_filtro } = body;
  if (!cod_empresa) throw new Error("cod_empresa obrigatório");

  const codEmp = Number(cod_empresa);

  // Default: current month
  const hoje = new Date();
  const defaultIni = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const defaultFim = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${lastDay}`;

  const dtIni = String(data_inicio || defaultIni);
  const dtFim = String(data_fim || defaultFim);
  const tipoFiltro = String(tipo_filtro || "TODOS"); // TODOS | PAGAR | RECEBER

  // 1. Fetch parcelas from cache
  let cacheQuery = supabase
    .from("parcelas_cache")
    .select("*")
    .eq("cod_empresa", codEmp)
    .gte("data_vencimento", dtIni)
    .lte("data_vencimento", dtFim);

  if (tipoFiltro !== "TODOS") {
    cacheQuery = cacheQuery.eq("tipo_lancamento", tipoFiltro);
  }

  const { data: parcelas, error: pErr } = await cacheQuery;
  if (pErr) throw new Error(`Erro ao buscar parcelas_cache: ${pErr.message}`);
  if (!parcelas || parcelas.length === 0) {
    return json({ ok: true, inserted: 0, skipped: 0, dda_vinculados: 0, dda_orfaos: 0, total: 0, message: "Nenhuma parcela encontrada no cache para o período." });
  }

  // 2. Fetch DDA titles for cross-match (only PAGAR parcelas)
  const { data: ddaTitulos } = await supabase
    .from("btg_dda_titulos")
    .select("*")
    .eq("cod_empresa", codEmp)
    .eq("status", "PENDENTE")
    .gte("data_vencimento", dtIni)
    .lte("data_vencimento", dtFim);

  const ddaList = ddaTitulos || [];
  const ddaUsed = new Set<string>();

  // Load dre_plano_contas mapping table
  const { data: planoContas } = await supabase
    .from("dre_plano_contas")
    .select("conta_numero, conta_descricao, grupo_dre, categoria")
    .eq("ativo", true);

  const planoMap = new Map<string, { grupo_dre: string; categoria: string }>();
  for (const pc of (planoContas || [])) {
    planoMap.set(pc.conta_numero, { grupo_dre: pc.grupo_dre, categoria: pc.categoria });
  }

  // Helper: auto-classify using dre_plano_contas table with prefix fallback
  function autoClassify(
    tipo: string,
    contaNumero?: string | null,
    contaDescricao?: string | null,
    forma?: string | null
  ): { natureza: string; categoria: string; subcategoria: string | null } {
    // 1. Try exact match from plano de contas
    if (contaNumero && planoMap.has(contaNumero)) {
      const match = planoMap.get(contaNumero)!;
      return { natureza: match.grupo_dre, categoria: match.categoria, subcategoria: contaDescricao || null };
    }

    // 2. Try prefix fallback (e.g. "3.4.28" → "3.4" → "3")
    if (contaNumero) {
      const parts = contaNumero.split(".");
      while (parts.length > 1) {
        parts.pop();
        const prefix = parts.join(".");
        if (planoMap.has(prefix)) {
          const match = planoMap.get(prefix)!;
          return { natureza: match.grupo_dre, categoria: match.categoria, subcategoria: contaDescricao || null };
        }
      }
      // Try first character
      const firstChar = contaNumero.charAt(0);
      if (planoMap.has(firstChar)) {
        const match = planoMap.get(firstChar)!;
        return { natureza: match.grupo_dre, categoria: match.categoria, subcategoria: contaDescricao || null };
      }
    }

    // 3. Generic fallback
    if (tipo === "RECEBER") {
      return { natureza: "RECEITA_BRUTA", categoria: "VENDAS", subcategoria: contaDescricao || null };
    }
    if (forma) {
      const fp = forma.toUpperCase();
      if (fp.includes("CARTAO") || fp.includes("CREDITO") || fp.includes("DEBITO")) {
        return { natureza: "DEDUCOES", categoria: "TAXAS", subcategoria: contaDescricao || "Taxas Adquirentes" };
      }
    }
    return { natureza: "DESPESAS_OPERACIONAIS", categoria: "OUTROS", subcategoria: contaDescricao || null };
  }

  // 3. Process parcelas
  let inserted = 0;
  let skipped = 0;
  let ddaVinculados = 0;

  for (const p of parcelas) {
    const origemId = `ERP-${codEmp}-${p.documento || p.id}`;

    // Check duplicates
    const { data: existing } = await supabase
      .from("lancamentos_financeiros")
      .select("id")
      .eq("origem", "ERP")
      .eq("origem_id", origemId)
      .eq("cod_empresa", codEmp)
      .limit(1);

    if (existing && existing.length > 0) {
      skipped++;
      continue;
    }

    const tipo = p.tipo_lancamento === "PAGAR" ? "PAGAR" : "RECEBER";
    const classification = autoClassify(tipo, p.conta_numero, p.conta_descricao, p.forma_pagamento_tipo);

    const record: Record<string, unknown> = {
      cod_empresa: codEmp,
      tipo,
      descricao: p.pessoa_nome ? `${p.pessoa_nome} - ${p.documento || 'Parcela ERP'}` : (p.documento || "Parcela ERP"),
      valor: Number(p.valor || 0),
      data_vencimento: p.data_vencimento,
      data_emissao: p.data_emissao || null,
      pessoa_nome: p.pessoa_nome || null,
      forma_pagamento: p.forma_pagamento_tipo || null,
      natureza: classification.natureza,
      categoria: classification.categoria,
      subcategoria: classification.subcategoria,
      origem: "ERP",
      origem_id: origemId,
      criado_por: userId,
      status: "PREVISTO",
      dados_extras: {
        conta_numero: p.conta_numero || null,
        conta_descricao: p.conta_descricao || null,
      },
    };

    // Cross-match with DDA (only for PAGAR)
    if (tipo === "PAGAR" && ddaList.length > 0) {
      const matchedDda = ddaList.find(d => {
        if (ddaUsed.has(d.id)) return false;
        // Match by value + due date (precise enough for most cases)
        const sameValor = Math.abs(Number(d.valor) - Number(p.valor)) < 0.01;
        const sameVenc = d.data_vencimento === p.data_vencimento;
        if (!sameValor || !sameVenc) return false;
        // Bonus: CNPJ match if available
        if (d.documento_emissor && p.pessoa_nome) {
          // documento_emissor is CNPJ of the issuer — loose check
          return true;
        }
        return true;
      });

      if (matchedDda) {
        ddaUsed.add(matchedDda.id);
        record.btg_dda_id = matchedDda.id;
        (record.dados_extras as Record<string, unknown>).linha_digitavel = matchedDda.linha_digitavel;
        (record.dados_extras as Record<string, unknown>).dda_emissor = matchedDda.emissor;
        (record.dados_extras as Record<string, unknown>).dda_banco = matchedDda.banco_emissor;
        (record.dados_extras as Record<string, unknown>).btg_payment_type = "BANKSLIP";
        ddaVinculados++;
      }
    }

    const { error: insErr } = await supabase
      .from("lancamentos_financeiros")
      .insert(record);

    if (insErr) {
      console.error("[importar_erp_auto] erro:", insErr.message);
      skipped++;
    } else {
      inserted++;
    }
  }

  // 4. Create orphan DDA entries (DDA titles without ERP match)
  let ddaOrfaos = 0;
  for (const dda of ddaList) {
    if (ddaUsed.has(dda.id)) continue;

    // Check if already imported as DDA orphan
    const { data: existingDda } = await supabase
      .from("lancamentos_financeiros")
      .select("id")
      .eq("btg_dda_id", dda.id)
      .eq("cod_empresa", codEmp)
      .limit(1);

    if (existingDda && existingDda.length > 0) continue;

    const { error: ddaInsErr } = await supabase
      .from("lancamentos_financeiros")
      .insert({
        cod_empresa: codEmp,
        tipo: "PAGAR",
        descricao: `DDA: ${dda.emissor || dda.documento_emissor || 'Título sem identificação'}`,
        valor: Number(dda.valor),
        data_vencimento: dda.data_vencimento,
        pessoa_nome: dda.emissor || null,
        pessoa_documento: dda.documento_emissor || null,
        natureza: "DESPESAS_OPERACIONAIS",
        categoria: "FORNECEDORES",
        origem: "DDA",
        origem_id: `DDA-${dda.id}`,
        btg_dda_id: dda.id,
        requer_validacao: true,
        criado_por: userId,
        status: "PREVISTO",
        dados_extras: {
          linha_digitavel: dda.linha_digitavel,
          dda_emissor: dda.emissor,
          dda_banco: dda.banco_emissor,
          btg_payment_type: "BANKSLIP",
        },
      });

    if (!ddaInsErr) ddaOrfaos++;
  }

  return json({
    ok: true,
    inserted,
    skipped,
    dda_vinculados: ddaVinculados,
    dda_orfaos: ddaOrfaos,
    total: parcelas.length,
  });
}

// ═══════════════════════════════════════════════════════════
// CONFIRMAR PROCESSAMENTO (baixar lotes pós-banco)
// ═══════════════════════════════════════════════════════════

async function confirmarProcessamento(body: Record<string, unknown>, userId: string) {
  const { bordero_id } = body;
  if (!bordero_id) throw new Error("bordero_id obrigatório");
  await requireAdmin(userId);

  const { data: bordero } = await supabase.from("borderos").select("*").eq("id", bordero_id).single();
  if (!bordero) throw new Error("Borderô não encontrado");
  if (bordero.status !== "ENVIADO") throw new Error("Borderô precisa estar ENVIADO para confirmação");

  const hoje = new Date().toISOString().slice(0, 10);
  const agora = new Date().toISOString();

  // Baixar todos os lançamentos do borderô
  const { data: lancamentos, error: qErr } = await supabase
    .from("lancamentos_financeiros")
    .select("id, valor")
    .eq("bordero_id", bordero_id)
    .eq("status", "PROCESSANDO");

  if (qErr) throw new Error(qErr.message);

  let baixados = 0;
  for (const l of (lancamentos || [])) {
    const { error: uErr } = await supabase
      .from("lancamentos_financeiros")
      .update({
        status: "BAIXADO",
        valor_pago: l.valor,
        data_pagamento: hoje,
        data_baixa: hoje,
        baixado_por: userId,
        baixado_em: agora,
      })
      .eq("id", l.id);

    if (!uErr) baixados++;
  }

  // Update borderô status
  await supabase.from("borderos").update({ status: "PROCESSADO" }).eq("id", bordero_id);

  return json({ ok: true, baixados, status: "PROCESSADO" });
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

// ═══════════════════════════════════════════════════════════
// CLASSIFICAR EM LOTE
// ═══════════════════════════════════════════════════════════

async function classificarLote(body: Record<string, unknown>, _userId: string) {
  const { ids, natureza, categoria, subcategoria } = body;
  if (!Array.isArray(ids) || ids.length === 0) throw new Error("ids obrigatório (array)");
  if (!subcategoria) throw new Error("subcategoria obrigatório");

  const { data, error } = await supabase
    .from("lancamentos_financeiros")
    .update({
      natureza: natureza || null,
      categoria: categoria || null,
      subcategoria: subcategoria,
      requer_validacao: false,
      status: "CLASSIFICADO",
    })
    .in("id", ids as string[])
    .in("status", ["PREVISTO"])
    .select("id");

  if (error) throw new Error(error.message);
  return json({ ok: true, classificados: (data || []).length });
}

// ═══════════════════════════════════════════════════════════
// CANCELAR EM LOTE
// ═══════════════════════════════════════════════════════════

async function cancelarLote(body: Record<string, unknown>) {
  const { ids } = body;
  if (!Array.isArray(ids) || ids.length === 0) throw new Error("ids obrigatório (array)");

  const { data, error } = await supabase
    .from("lancamentos_financeiros")
    .update({ status: "CANCELADO" })
    .in("id", ids as string[])
    .in("status", ["PREVISTO"])
    .select("id");

  if (error) throw new Error(error.message);
  return json({ ok: true, cancelados: (data || []).length });
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

  let bQuery = supabase
    .from("borderos")
    .select("status, total_valor")
    .in("status", ["MONTAGEM", "APROVADO", "ENVIADO"]);

  if (codEmp) bQuery = bQuery.eq("cod_empresa", codEmp);

  const { data: borderosData } = await bQuery;
  const borderosAbertos = (borderosData || []).length;
  const borderosTotalValor = (borderosData || []).reduce((s: number, b: { total_valor: number }) => s + Number(b.total_valor || 0), 0);

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
