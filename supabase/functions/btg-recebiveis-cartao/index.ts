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
      case "importar_agenda":
        return await importarAgenda(body, auth.userId);
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
    return json({ error: err.message || "Erro interno" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fetchBtgReceivables(url: string, accessToken: string, cnpj: string) {
  console.log("[btg-recebiveis] Calling:", url);

  const res = await fetch(url, {
    headers: {
      "Authorization": accessToken,
      "x-identification": cnpj,
      "x-client-channel": "THIRD_PARTY",
    },
  });

  console.log("[btg-recebiveis] Status:", res.status);
  const rawBody = await res.text();
  console.log("[btg-recebiveis] Response body (first 2000 chars):", rawBody.slice(0, 2000));

  if (!res.ok) {
    throw new Error(`BTG receivables API failed: ${res.status} ${rawBody}`);
  }

  const apiData = JSON.parse(rawBody);
  // OData response: { value: [...] } or direct array
  const items = Array.isArray(apiData)
    ? apiData
    : apiData.value || apiData.items || apiData.data || [];

  console.log("[btg-recebiveis] Top-level keys:", Object.keys(apiData));
  console.log("[btg-recebiveis] Items count:", Array.isArray(items) ? items.length : "NOT_ARRAY");
  if (Array.isArray(items) && items.length > 0) {
    console.log("[btg-recebiveis] First item keys:", Object.keys(items[0]));
    console.log("[btg-recebiveis] First item:", JSON.stringify(items[0]).slice(0, 1000));
  }

  return Array.isArray(items) ? items : [];
}

// ═══════════════════════════════════════════════════════════
// LISTAR recebíveis com parcelas vinculadas
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
// IMPORTAR AGENDA BTG (ou sandbox mock)
// ═══════════════════════════════════════════════════════════
async function importarAgenda(body: Record<string, unknown>, _userId: string) {
  const { cod_empresa, data_inicio, data_fim } = body;
  if (!cod_empresa) throw new Error("cod_empresa obrigatório");

  // Resolve ambiente from fornecedor_configuracao (source of truth)
  const { data: configRow } = await supabase
    .from("fornecedor_configuracao")
    .select("ambiente")
    .eq("fornecedor", "btg")
    .eq("ativo", true)
    .single();
  const isSandbox = (configRow?.ambiente || "sandbox") !== "production";

  let recebiveis: Array<Record<string, unknown>> = [];

  if (isSandbox) {
    // Generate mock receivables for sandbox
    const start = new Date(String(data_inicio || new Date().toISOString().slice(0, 10)));
    const end = new Date(String(data_fim || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)));
    const adquirentes = ["CIELO", "STONE", "GETNET"];
    const bandeiras = ["VISA", "MASTERCARD", "ELO"];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 3)) {
      const adq = adquirentes[Math.floor(Math.random() * adquirentes.length)];
      const band = bandeiras[Math.floor(Math.random() * bandeiras.length)];
      const bruto = Math.round((500 + Math.random() * 4500) * 100) / 100;
      const taxaPct = 1.5 + Math.random() * 2;
      const taxaVal = Math.round(bruto * taxaPct / 100 * 100) / 100;
      const liquido = Math.round((bruto - taxaVal) * 100) / 100;

      recebiveis.push({
        cod_empresa: Number(cod_empresa),
        adquirente: adq,
        bandeira: band,
        data_vencimento: d.toISOString().slice(0, 10),
        valor_bruto: bruto,
        valor_liquido: liquido,
        taxa_percentual: Math.round(taxaPct * 100) / 100,
        taxa_valor: taxaVal,
        status: "PREVISTO",
        btg_receivable_id: `sandbox-${adq}-${d.toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 8)}`,
      });
    }
  } else {
    // Production: BTG Credit Card Receivables API
    const { data: tokenData } = await supabase
      .from("btg_tokens")
      .select("access_token, expires_at")
      .eq("cod_empresa", cod_empresa)
      .single();

    if (!tokenData) throw new Error("Token BTG não encontrado");
    if (new Date(tokenData.expires_at) < new Date()) throw new Error("Token BTG expirado");

    const { data: conta } = await supabase
      .from("btg_contas_bancarias")
      .select("cnpj")
      .eq("cod_empresa", cod_empresa)
      .eq("ativa", true)
      .single();

    const cnpj = conta?.cnpj?.replace(/\D/g, "");
    if (!cnpj) throw new Error("CNPJ não encontrado");

    // BTG Receivables OData API
    const apiBase = "https://api-recebiveis.btgpactualbusiness.com/odata/V1CreditCardReceivablesCedenteOData";
    
    // Build OData filter for date range
    const filters: string[] = [];
    if (data_inicio) filters.push(`dataVencimento ge ${data_inicio}`);
    if (data_fim) filters.push(`dataVencimento le ${data_fim}`);
    
    let url = apiBase;
    if (filters.length > 0) {
      url += `?$filter=${encodeURIComponent(filters.join(" and "))}`;
    }

    const allItems = await fetchBtgReceivables(url, tokenData.access_token, cnpj);

    console.log("[btg-recebiveis] Total items fetched:", allItems.length);

    // Map OData fields to our schema
    // Common OData fields: dataVencimento, valorBruto/maturityAmount, valorLiquido,
    // sacadoCnpj (adquirente CNPJ), bandeira/scheme, diasCorridos, diasUteis
    recebiveis = allItems.map((item: Record<string, unknown>) => {
      const bruto = Number(item.valorBruto || item.maturityAmount || item.valor || 0);
      const liquido = Number(item.valorLiquido || item.maximumDisbursementAmount || bruto);
      const taxaValor = Math.round((bruto - liquido) * 100) / 100;
      const taxaPct = bruto > 0 ? Math.round((taxaValor / bruto) * 10000) / 100 : 0;

      return {
        cod_empresa: Number(cod_empresa),
        adquirente: String(item.sacadoCnpj || item.sacadoNome || item.adquirente || item.payerId || "DESCONHECIDO"),
        bandeira: String(item.bandeira || item.scheme || "DESCONHECIDA"),
        data_vencimento: String(item.dataVencimento || item.maturityDate || ""),
        valor_bruto: bruto,
        valor_liquido: liquido,
        taxa_percentual: taxaPct,
        taxa_valor: taxaValor,
        status: "PREVISTO",
        btg_receivable_id: item.id != null ? String(item.id) : null,
      };
    });
  }

  // Upsert: skip duplicates by btg_receivable_id
  const incomingIds = recebiveis
    .map((r) => r.btg_receivable_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const existingIds = new Set<string>();
  if (incomingIds.length > 0) {
    const { data: existingRows } = await supabase
      .from("recebiveis_cartao")
      .select("btg_receivable_id")
      .in("btg_receivable_id", incomingIds);

    for (const row of existingRows || []) {
      if (row.btg_receivable_id) existingIds.add(row.btg_receivable_id);
    }
  }

  const novosRecebiveis = recebiveis.filter((r) => {
    if (!r.btg_receivable_id) return true;
    return !existingIds.has(String(r.btg_receivable_id));
  });

  let inserted = 0;
  for (const r of novosRecebiveis) {
    const { error } = await supabase.from("recebiveis_cartao").insert(r);
    if (!error) inserted++;
  }

  let totalNoPeriodoQuery = supabase
    .from("recebiveis_cartao")
    .select("id", { count: "exact", head: true })
    .eq("cod_empresa", Number(cod_empresa));
  if (data_inicio) totalNoPeriodoQuery = totalNoPeriodoQuery.gte("data_vencimento", String(data_inicio));
  if (data_fim) totalNoPeriodoQuery = totalNoPeriodoQuery.lte("data_vencimento", String(data_fim));

  let sandboxNoPeriodoQuery = supabase
    .from("recebiveis_cartao")
    .select("id", { count: "exact", head: true })
    .eq("cod_empresa", Number(cod_empresa))
    .like("btg_receivable_id", "sandbox-%");
  if (data_inicio) sandboxNoPeriodoQuery = sandboxNoPeriodoQuery.gte("data_vencimento", String(data_inicio));
  if (data_fim) sandboxNoPeriodoQuery = sandboxNoPeriodoQuery.lte("data_vencimento", String(data_fim));

  const [{ count: totalNoPeriodo }, { count: sandboxNoPeriodo }] = await Promise.all([
    totalNoPeriodoQuery,
    sandboxNoPeriodoQuery,
  ]);

  return json({
    ok: true,
    total: recebiveis.length,
    inserted,
    skipped_duplicates: Math.max(recebiveis.length - novosRecebiveis.length, 0),
    total_no_periodo: totalNoPeriodo || 0,
    sandbox_no_periodo: sandboxNoPeriodo || 0,
    sandbox: isSandbox,
  });
}

// ═══════════════════════════════════════════════════════════
// CONCILIAÇÃO AUTOMÁTICA
// ═══════════════════════════════════════════════════════════
async function conciliarAuto(body: Record<string, unknown>, userId: string) {
  const { cod_empresa } = body;
  if (!cod_empresa) throw new Error("cod_empresa obrigatório");

  // 1. Get all PREVISTO receivables
  const { data: recebiveis, error: rErr } = await supabase
    .from("recebiveis_cartao")
    .select("*")
    .eq("cod_empresa", cod_empresa)
    .eq("status", "PREVISTO");

  if (rErr) throw new Error(rErr.message);
  if (!recebiveis || recebiveis.length === 0) return json({ conciliados: 0, taxas_geradas: 0 });

  // 2. Get ERP card receivable lancamentos (RECEBER + card payment)
  const { data: lancamentos, error: lErr } = await supabase
    .from("lancamentos_financeiros")
    .select("*")
    .eq("cod_empresa", cod_empresa)
    .eq("tipo", "RECEBER")
    .eq("status", "PREVISTO")
    .in("forma_pagamento", ["CARTAO_CREDITO", "CARTAO_DEBITO"]);

  if (lErr) throw new Error(lErr.message);

  // 3. Group lancamentos by adquirente + bandeira + data_vencimento
  const groups: Record<string, Array<{ id: string; valor: number; numero_parcela: number | null }>> = {};
  for (const l of (lancamentos || [])) {
    const key = `${(l.adquirente || "").toUpperCase()}|${(l.bandeira || "").toUpperCase()}|${l.data_vencimento}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push({ id: l.id, valor: Number(l.valor), numero_parcela: l.numero_parcela });
  }

  let conciliados = 0;
  let taxasGeradas = 0;

  // 4. Match receivables with grouped lancamentos
  for (const rec of recebiveis) {
    const key = `${(rec.adquirente || "").toUpperCase()}|${(rec.bandeira || "").toUpperCase()}|${rec.data_vencimento}`;
    const group = groups[key];
    if (!group || group.length === 0) continue;

    const somaGrupo = group.reduce((s, g) => s + g.valor, 0);
    const tolerance = Math.abs(somaGrupo - Number(rec.valor_bruto));

    // Match if within 1% tolerance
    if (tolerance > somaGrupo * 0.01 && tolerance > 1) continue;

    // Link parcelas to recebivel
    for (const item of group) {
      await supabase.from("recebiveis_cartao_parcelas").insert({
        recebivel_id: rec.id,
        lancamento_id: item.id,
        valor_parcela: item.valor,
        numero_parcela: item.numero_parcela,
      });
    }

    // Update receivable status
    await supabase.from("recebiveis_cartao").update({ status: "CONCILIADO" }).eq("id", rec.id);

    // Update linked lancamentos status
    const ids = group.map(g => g.id);
    await supabase
      .from("lancamentos_financeiros")
      .update({
        status: "CONCILIADO_CARTAO",
        recebivel_cartao_id: rec.id,
      })
      .in("id", ids);

    conciliados++;

    // Generate TAXA_ADQUIRENTE lancamento if there's a fee
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

    // Remove matched group
    delete groups[key];
  }

  return json({ conciliados, taxas_geradas: taxasGeradas });
}

// ═══════════════════════════════════════════════════════════
// CONCILIAÇÃO MANUAL
// ═══════════════════════════════════════════════════════════
async function conciliarManual(body: Record<string, unknown>, userId: string) {
  const { recebivel_id, lancamento_ids } = body;
  if (!recebivel_id) throw new Error("recebivel_id obrigatório");
  const ids = (lancamento_ids as string[]) || [];
  if (ids.length === 0) throw new Error("lancamento_ids obrigatório");

  const { data: rec } = await supabase.from("recebiveis_cartao").select("*").eq("id", recebivel_id).single();
  if (!rec) throw new Error("Recebível não encontrado");

  // Link parcelas
  const { data: lancs } = await supabase
    .from("lancamentos_financeiros")
    .select("id, valor, numero_parcela")
    .in("id", ids);

  for (const l of (lancs || [])) {
    await supabase.from("recebiveis_cartao_parcelas").insert({
      recebivel_id: String(recebivel_id),
      lancamento_id: l.id,
      valor_parcela: l.valor,
      numero_parcela: l.numero_parcela,
    });
  }

  // Update status
  await supabase.from("recebiveis_cartao").update({ status: "CONCILIADO" }).eq("id", recebivel_id);
  await supabase
    .from("lancamentos_financeiros")
    .update({ status: "CONCILIADO_CARTAO", recebivel_cartao_id: String(recebivel_id) })
    .in("id", ids);

  // Generate fee lancamento
  const taxaValor = Number(rec.taxa_valor || 0);
  if (taxaValor > 0) {
    await supabase.from("lancamentos_financeiros").insert({
      cod_empresa: rec.cod_empresa,
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
  }

  return json({ ok: true });
}

// ═══════════════════════════════════════════════════════════
// MARCAR DIVERGENTE
// ═══════════════════════════════════════════════════════════
async function marcarDivergente(body: Record<string, unknown>) {
  const { recebivel_id } = body;
  if (!recebivel_id) throw new Error("recebivel_id obrigatório");

  const { error } = await supabase
    .from("recebiveis_cartao")
    .update({ status: "DIVERGENTE" })
    .eq("id", recebivel_id);

  if (error) throw new Error(error.message);
  return json({ ok: true });
}

// ═══════════════════════════════════════════════════════════
// DETALHE (recebível + parcelas + lançamentos)
// ═══════════════════════════════════════════════════════════
async function detalhe(body: Record<string, unknown>) {
  const { recebivel_id } = body;
  if (!recebivel_id) throw new Error("recebivel_id obrigatório");

  const { data: rec } = await supabase
    .from("recebiveis_cartao")
    .select("*, recebiveis_cartao_parcelas(id, lancamento_id, valor_parcela, numero_parcela)")
    .eq("id", recebivel_id)
    .single();

  if (!rec) throw new Error("Recebível não encontrado");

  // Fetch linked lancamentos
  const parcelaIds = (rec.recebiveis_cartao_parcelas || []).map((p: { lancamento_id: string }) => p.lancamento_id);
  let lancamentos: unknown[] = [];
  if (parcelaIds.length > 0) {
    const { data } = await supabase
      .from("lancamentos_financeiros")
      .select("id, descricao, valor, data_vencimento, pessoa_nome, status")
      .in("id", parcelaIds);
    lancamentos = data || [];
  }

  return json({ recebivel: rec, lancamentos });
}
