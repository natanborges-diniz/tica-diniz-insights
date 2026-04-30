import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BRAND_MAP: Record<number, string> = {
  1: "MASTERCARD", 2: "VISA", 3: "AMEX", 4: "ELO",
  5: "HIPERCARD", 6: "HIPER", 14: "BANRICOMPRAS", 33: "JCB", 35: "DINERS",
  36: "CABAL", 37: "BANESCARD", 38: "SOROCRED", 39: "CREDZ",
};

interface AdqConfig {
  cod_empresa: number;
  ambiente: string;
  merchant_id: string | null;
  merchant_id_production: string | null;
  pv_matriz: string | null;
  pv_matriz_production: string | null;
  pvs_matriz_production: string[] | null;
  ativo: boolean;
}

/** Build map: any known PV (filiação ou matriz) → cod_empresa */
function buildPvToEmpresa(configs: AdqConfig[], env: string): Record<string, number> {
  const map: Record<string, number> = {};
  for (const c of configs) {
    if (env === "production") {
      if (c.merchant_id_production) map[c.merchant_id_production] = c.cod_empresa;
      const arr = Array.isArray(c.pvs_matriz_production) ? c.pvs_matriz_production : [];
      for (const pv of arr) {
        if (pv && map[pv] === undefined) map[pv] = c.cod_empresa;
      }
      if (c.pv_matriz_production && map[c.pv_matriz_production] === undefined) {
        map[c.pv_matriz_production] = c.cod_empresa;
      }
    } else {
      if (c.merchant_id) map[c.merchant_id] = c.cod_empresa;
      if (c.pv_matriz && map[c.pv_matriz] === undefined) map[c.pv_matriz] = c.cod_empresa;
    }
  }
  return map;
}

/** Collect distinct PV Matriz Comerciais to query */
function collectMatrizPvs(configs: AdqConfig[], env: string): string[] {
  const set = new Set<string>();
  for (const c of configs) {
    if (env === "production") {
      const arr = Array.isArray(c.pvs_matriz_production) ? c.pvs_matriz_production : [];
      for (const pv of arr) if (pv) set.add(pv);
      if (set.size === 0 && c.pv_matriz_production) set.add(c.pv_matriz_production);
    } else {
      if (c.pv_matriz) set.add(c.pv_matriz);
    }
  }
  return [...set];
}

async function fetchAllPagesForPv(
  supabaseUrl: string,
  serviceKey: string,
  env: string,
  pv: string,
  start: string,
  end: string,
): Promise<{ ok: boolean; transactions: any[]; pages: number; error?: string }> {
  const transactions: any[] = [];
  let page = 0;
  let totalPages = 1;

  while (page < totalPages) {
    const res = await fetch(`${supabaseUrl}/functions/v1/rede-gestao-vendas`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        action: "consultar_vendas",
        ambiente: env,
        parentCompanyNumber: pv,
        startDate: start,
        endDate: end,
        size: "100",
        page: String(page),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, transactions, pages: page, error: `HTTP ${res.status}: ${errText.slice(0, 300)}` };
    }

    const data = await res.json();
    if (data?.error) {
      return { ok: false, transactions, pages: page, error: data.error };
    }

    const txs = data?.content?.transactions || data?.content || [];
    if (Array.isArray(txs)) transactions.push(...txs);

    const pageInfo = data?.content?.page || data?.page;
    totalPages = pageInfo?.totalPages || 1;
    page++;
    if (page > 200) break; // safety guard
  }

  return { ok: true, transactions, pages: page };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { data_inicio, data_fim, ambiente: ambienteOverride } = body || {};

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);

    const end = data_fim || new Date().toISOString().slice(0, 10);
    const start = data_inicio || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    // 1. Fetch all active REDE configs
    const { data: configsRaw, error: cfgErr } = await supabaseAdmin
      .from("adquirentes_config")
      .select("cod_empresa, ambiente, merchant_id, merchant_id_production, pv_matriz, pv_matriz_production, pvs_matriz_production, ativo")
      .eq("adquirente", "REDE")
      .eq("ativo", true);
    if (cfgErr) throw new Error(`Erro ao buscar configs: ${cfgErr.message}`);

    const configs = (configsRaw || []) as AdqConfig[];
    if (configs.length === 0) throw new Error("Nenhuma configuração REDE ativa encontrada.");

    // Default env: prefer production if any active config is production
    const env = ambienteOverride
      || (configs.some(c => c.ambiente === "production") ? "production" : "sandbox");

    const pvsMatriz = collectMatrizPvs(configs, env);
    if (pvsMatriz.length === 0) {
      throw new Error(`Nenhum PV Matriz Comercial cadastrado para ambiente ${env}.`);
    }

    const pvToEmpresa = buildPvToEmpresa(configs, env);

    console.log(`[sync-vendas-cartao] env=${env} period=${start}→${end} matrizPVs=${pvsMatriz.length} (${pvsMatriz.join(",")})`);
    console.log(`[sync-vendas-cartao] PV→Empresa map keys=${Object.keys(pvToEmpresa).length}`);

    // 2. Fan-out: query each Matriz PV, tolerate per-PV failure
    interface PvOutcome {
      pv: string;
      ok: boolean;
      pages: number;
      txs: number;
      error?: string;
    }
    const pvOutcomes: PvOutcome[] = [];
    const allTransactions: Array<{ tx: any; sourcePv: string }> = [];

    for (const pv of pvsMatriz) {
      const r = await fetchAllPagesForPv(SUPABASE_URL, SERVICE_KEY, env, pv, start, end);
      pvOutcomes.push({ pv, ok: r.ok, pages: r.pages, txs: r.transactions.length, error: r.error });
      if (r.ok) {
        for (const tx of r.transactions) allTransactions.push({ tx, sourcePv: pv });
      } else {
        console.error(`[sync-vendas-cartao] PV ${pv} falhou: ${r.error}`);
      }
    }

    console.log(`[sync-vendas-cartao] Total transactions: ${allTransactions.length}`);

    // 3. Process and insert
    let inserted = 0;
    let skipped = 0;
    let recebiveisCreated = 0;
    const unmappedCounts: Record<string, number> = {};

    for (const { tx, sourcePv } of allTransactions) {
      const nsu = tx.nsu ? String(tx.nsu) : null;
      const subsidiaryPv = tx.merchant?.companyNumber
        ? String(tx.merchant.companyNumber)
        : (tx.subsidiaryNumber ? String(tx.subsidiaryNumber)
          : (tx.companyNumber ? String(tx.companyNumber) : null));

      if (!nsu) { skipped++; continue; }

      // Tenta filial → fallback para PV consultado (matriz comercial mapeada para a loja origem)
      const codEmpresa = (subsidiaryPv && pvToEmpresa[subsidiaryPv])
        || pvToEmpresa[sourcePv]
        || null;

      if (!codEmpresa) {
        const key = subsidiaryPv || sourcePv;
        unmappedCounts[key] = (unmappedCounts[key] || 0) + 1;
        skipped++;
        continue;
      }

      // Dedup
      const { data: existing } = await supabaseAdmin
        .from("vendas_cartao")
        .select("id")
        .eq("nsu", nsu)
        .eq("cod_empresa", codEmpresa)
        .maybeSingle();
      if (existing) { skipped++; continue; }

      const modality = tx.modality?.type || tx.modality || "CREDIT";
      const modalityMap: Record<string, string> = { CREDIT: "CREDITO", DEBIT: "DEBITO" };
      const statusMap: Record<string, string> = {
        APPROVED: "APROVADA", CANCELED: "CANCELADA", DENIED: "CANCELADA", REFUNDED: "ESTORNADA",
      };

      const valorBruto = tx.amount || tx.grossAmount || 0;
      const valorLiquido = tx.netAmount || valorBruto;
      const taxaValor = tx.mdrAmount || tx.mdrFeeAmount || (valorBruto - valorLiquido) || null;
      const taxaPercentual = tx.mdrFee || null;
      const brandName = tx.brandCode ? (BRAND_MAP[tx.brandCode] || `BRAND_${tx.brandCode}`) : (tx.brand || null);

      const record = {
        cod_empresa: codEmpresa,
        adquirente: "REDE",
        nsu,
        autorizacao: tx.strAuthorizationCode || tx.authorizationCode || null,
        tid: tx.tid ? String(tx.tid) : nsu,
        bandeira: brandName,
        tipo: modalityMap[modality] || "CREDITO",
        parcelas: tx.installmentQuantity || tx.installments || 1,
        valor_bruto: valorBruto,
        valor_liquido: valorLiquido,
        taxa_percentual: taxaPercentual,
        taxa_valor: taxaValor,
        data_venda: tx.saleDate || start,
        data_prevista_credito: tx.expectedPaymentDate || null,
        status: statusMap[tx.status] || "APROVADA",
        dados_extras: { ...tx, _source_matriz_pv: sourcePv },
      };

      const { error: insertErr } = await supabaseAdmin
        .from("vendas_cartao")
        .insert(record);

      if (insertErr) {
        console.error(`[sync-vendas-cartao] Insert error nsu ${nsu}:`, insertErr.message);
        skipped++;
        continue;
      }
      inserted++;

      if (record.tipo === "CREDITO" && record.status === "APROVADA" && record.data_prevista_credito) {
        const { error: recErr } = await supabaseAdmin
          .from("recebiveis_cartao")
          .insert({
            cod_empresa: codEmpresa,
            adquirente: "REDE",
            adquirente_source: "REDE_GV",
            bandeira: record.bandeira,
            data_vencimento: record.data_prevista_credito,
            valor_bruto: record.valor_bruto,
            valor_liquido: record.valor_liquido,
            taxa_percentual: record.taxa_percentual,
            taxa_valor: record.taxa_valor,
            status: "PREVISTO",
          });
        if (!recErr) recebiveisCreated++;
      }
    }

    const result = {
      periodo: { inicio: start, fim: end },
      ambiente: env,
      pvs_consultados: pvOutcomes.length,
      pvs_com_dados: pvOutcomes.filter(p => p.ok && p.txs > 0).length,
      pvs_com_falha: pvOutcomes.filter(p => !p.ok).length,
      pv_outcomes: pvOutcomes,
      total_api: allTransactions.length,
      inserted,
      skipped,
      recebiveis_created: recebiveisCreated,
      unmapped: unmappedCounts,
    };

    console.log(`[sync-vendas-cartao] Done:`, JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[sync-vendas-cartao] Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
