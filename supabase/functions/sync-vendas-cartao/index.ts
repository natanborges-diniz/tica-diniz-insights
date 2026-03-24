import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BRAND_MAP: Record<number, string> = {
  1: "MASTERCARD", 2: "VISA", 3: "AMEX", 4: "ELO",
  5: "HIPERCARD", 6: "HIPER", 33: "JCB", 35: "DINERS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { data_inicio, data_fim, ambiente: ambienteOverride } = body;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const end = data_fim || new Date().toISOString().slice(0, 10);
    const start = data_inicio || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    // 1. Find config with pv_matriz
    const { data: configs, error: cfgErr } = await supabaseAdmin
      .from("adquirentes_config")
      .select("*")
      .eq("adquirente", "REDE")
      .eq("ativo", true);

    if (cfgErr) throw new Error(`Erro ao buscar config: ${cfgErr.message}`);

    const matrizConfig = configs?.find((c: any) => c.pv_matriz || c.pv_matriz_production);
    if (!matrizConfig) {
      throw new Error("Nenhuma configuração com PV Matriz encontrada. Configure na tela de Adquirentes.");
    }

    // Resolve environment and credentials
    const env = ambienteOverride || matrizConfig.ambiente || "sandbox";
    const pvMatriz = env === "production"
      ? (matrizConfig.pv_matriz_production || matrizConfig.pv_matriz)
      : matrizConfig.pv_matriz;

    if (!pvMatriz) {
      throw new Error(`PV Matriz não configurado para ambiente ${env}`);
    }

    console.log(`[sync-vendas-cartao] PV Matriz ${pvMatriz}, ambiente ${env}, period ${start}→${end}`);

    // 2. Build merchant_id → cod_empresa lookup
    const { data: allConfigs } = await supabaseAdmin
      .from("adquirentes_config")
      .select("cod_empresa, merchant_id, merchant_id_production, ambiente")
      .eq("adquirente", "REDE")
      .eq("ativo", true);

    const pvToEmpresa: Record<string, number> = {};
    for (const c of allConfigs || []) {
      // Map both sandbox and production PVs
      if (c.merchant_id) pvToEmpresa[c.merchant_id] = c.cod_empresa;
      if (c.merchant_id_production) pvToEmpresa[c.merchant_id_production] = c.cod_empresa;
    }
    if (!pvToEmpresa[pvMatriz]) {
      pvToEmpresa[pvMatriz] = matrizConfig.cod_empresa;
    }

    console.log(`[sync-vendas-cartao] PV→Empresa map:`, pvToEmpresa);

    // 3. Fetch all pages from Gestão de Vendas API
    let allTransactions: any[] = [];
    let page = 0;
    let totalPages = 1;

    while (page < totalPages) {
      const gvRes = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/rede-gestao-vendas`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            action: "consultar_vendas",
            ambiente: env,
            parentCompanyNumber: pvMatriz,
            subsidiaries: Object.keys(pvToEmpresa).join(","),
            startDate: start,
            endDate: end,
            size: "20",
            page: String(page),
          }),
        }
      );

      if (!gvRes.ok) {
        const errText = await gvRes.text();
        throw new Error(`rede-gestao-vendas error: ${gvRes.status} ${errText.slice(0, 300)}`);
      }

      const gvData = await gvRes.json();

      // Real API: { content: { transactions: [...], page: { number, totalPages, ... } } }
      const transactions = gvData?.content?.transactions || gvData?.content || [];
      allTransactions = allTransactions.concat(Array.isArray(transactions) ? transactions : []);

      const pageInfo = gvData?.content?.page || gvData?.page;
      if (pageInfo) {
        totalPages = pageInfo.totalPages || 1;
      }

      console.log(`[sync-vendas-cartao] Page ${page + 1}/${totalPages}, got ${Array.isArray(transactions) ? transactions.length : 0} records`);
      page++;
    }

    console.log(`[sync-vendas-cartao] Total transactions: ${allTransactions.length}`);

    // 4. Process and insert
    let inserted = 0;
    let skipped = 0;
    let recebiveisCreated = 0;
    const unmappedPvs = new Set<string>();

    for (const tx of allTransactions) {
      const nsu = tx.nsu ? String(tx.nsu) : null;
      // Real API uses tx.merchant.companyNumber for subsidiary
      const subsidiaryPv = tx.merchant?.companyNumber
        ? String(tx.merchant.companyNumber)
        : (tx.subsidiaryNumber ? String(tx.subsidiaryNumber) : null);

      if (!nsu) { skipped++; continue; }

      const codEmpresa = subsidiaryPv ? pvToEmpresa[subsidiaryPv] : null;
      if (!codEmpresa) {
        if (subsidiaryPv) unmappedPvs.add(subsidiaryPv);
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

      // Map fields (real API structure)
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
        dados_extras: tx,
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

      // Create recebivel for credit
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
      pv_matriz: pvMatriz,
      ambiente: env,
      total_api: allTransactions.length,
      pages_fetched: page,
      inserted,
      skipped,
      recebiveis_created: recebiveisCreated,
      unmapped_pvs: [...unmappedPvs],
    };

    console.log(`[sync-vendas-cartao] Done:`, result);

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
