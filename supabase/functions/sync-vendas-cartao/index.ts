import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { data_inicio, data_fim, ambiente } = body;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Default: last 7 days
    const end = data_fim || new Date().toISOString().slice(0, 10);
    const start = data_inicio || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    // 1. Find the config with pv_matriz set
    const { data: configs, error: cfgErr } = await supabaseAdmin
      .from("adquirentes_config")
      .select("*")
      .eq("adquirente", "REDE")
      .eq("ativo", true)
      .not("pv_matriz", "is", null);

    if (cfgErr) throw new Error(`Erro ao buscar config: ${cfgErr.message}`);

    // Get the first config with pv_matriz (should be unique per CNPJ)
    const matrizConfig = configs?.find((c: any) => c.pv_matriz);
    if (!matrizConfig) {
      throw new Error("Nenhuma configuração com PV Matriz encontrada em adquirentes_config. Configure o PV Matriz na tela de Adquirentes.");
    }

    const pvMatriz = matrizConfig.pv_matriz;
    const env = ambiente || matrizConfig.ambiente || "sandbox";

    console.log(`[sync-vendas-cartao] Using PV Matriz ${pvMatriz}, ambiente ${env}, period ${start} to ${end}`);

    // 2. Build merchant_id → cod_empresa lookup from all REDE configs
    const { data: allConfigs } = await supabaseAdmin
      .from("adquirentes_config")
      .select("cod_empresa, merchant_id")
      .eq("adquirente", "REDE")
      .eq("ativo", true);

    const pvToEmpresa: Record<string, number> = {};
    for (const c of allConfigs || []) {
      if (c.merchant_id) {
        pvToEmpresa[c.merchant_id] = c.cod_empresa;
      }
    }
    // Also map pv_matriz itself
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

      // API returns { content: [...], page: { number, totalPages, size, totalElements } }
      const content = gvData?.content || [];
      allTransactions = allTransactions.concat(content);

      if (gvData?.page) {
        totalPages = gvData.page.totalPages || 1;
      }

      console.log(`[sync-vendas-cartao] Page ${page + 1}/${totalPages}, got ${content.length} records`);
      page++;
    }

    console.log(`[sync-vendas-cartao] Total transactions from API: ${allTransactions.length}`);

    // 4. Process and insert
    let inserted = 0;
    let skipped = 0;
    let recebiveisCreated = 0;
    let unmappedPvs = new Set<string>();

    for (const tx of allTransactions) {
      const nsu = tx.nsu ? String(tx.nsu) : null;
      const subsidiaryPv = tx.subsidiaryNumber ? String(tx.subsidiaryNumber) : null;

      if (!nsu) { skipped++; continue; }

      // Map subsidiary PV to cod_empresa
      const codEmpresa = subsidiaryPv ? pvToEmpresa[subsidiaryPv] : null;
      if (!codEmpresa) {
        if (subsidiaryPv) unmappedPvs.add(subsidiaryPv);
        skipped++;
        continue;
      }

      // Dedup by nsu + cod_empresa
      const { data: existing } = await supabaseAdmin
        .from("vendas_cartao")
        .select("id")
        .eq("nsu", nsu)
        .eq("cod_empresa", codEmpresa)
        .maybeSingle();

      if (existing) { skipped++; continue; }

      // Map GV API fields to vendas_cartao
      const modalityMap: Record<string, string> = {
        CREDIT: "CREDITO",
        DEBIT: "DEBITO",
      };

      const statusMap: Record<string, string> = {
        APPROVED: "APROVADA",
        CANCELED: "CANCELADA",
        DENIED: "CANCELADA",
        REFUNDED: "ESTORNADA",
      };

      const valorBruto = tx.grossAmount || 0;
      const valorLiquido = tx.netAmount || valorBruto;
      const taxaValor = tx.mdrFeeAmount || (valorBruto - valorLiquido) || null;
      const taxaPercentual = tx.mdrFee || null;

      const record = {
        cod_empresa: codEmpresa,
        adquirente: "REDE",
        nsu,
        autorizacao: tx.authorizationCode || null,
        tid: tx.tid ? String(tx.tid) : nsu,
        bandeira: tx.brand || null,
        tipo: modalityMap[tx.modality] || "CREDITO",
        parcelas: tx.installments || 1,
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
        console.error(`[sync-vendas-cartao] Insert error for nsu ${nsu}:`, insertErr.message);
        skipped++;
        continue;
      }
      inserted++;

      // Create recebivel for credit transactions
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
