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
    const { cod_empresa, data_inicio, data_fim } = body;

    if (!cod_empresa) throw new Error("cod_empresa é obrigatório");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Default: last 7 days
    const end = data_fim || new Date().toISOString().slice(0, 10);
    const start = data_inicio || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    console.log(`[sync-vendas-cartao] Syncing empresa ${cod_empresa} from ${start} to ${end}`);

    // Call rede-proxy to fetch transactions
    const redeRes = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/rede-proxy`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          action: "consultar_transacoes",
          cod_empresa,
          start_date: start.replace(/-/g, ""),
          end_date: end.replace(/-/g, ""),
          rows: 1000,
        }),
      }
    );

    if (!redeRes.ok) {
      const errText = await redeRes.text();
      throw new Error(`rede-proxy error: ${redeRes.status} ${errText.slice(0, 300)}`);
    }

    const redeData = await redeRes.json();

    // e.Rede returns transactions in different formats; normalize
    const transactions: any[] = Array.isArray(redeData)
      ? redeData
      : redeData?.transactions || redeData?.content || [];

    console.log(`[sync-vendas-cartao] Received ${transactions.length} transactions from Rede`);

    let inserted = 0;
    let skipped = 0;
    let recebiveisCreated = 0;

    for (const tx of transactions) {
      const tid = tx.tid || tx.reference || tx.id;
      if (!tid) { skipped++; continue; }

      // Check if already exists
      const { data: existing } = await supabaseAdmin
        .from("vendas_cartao")
        .select("id")
        .eq("tid", String(tid))
        .eq("cod_empresa", cod_empresa)
        .maybeSingle();

      if (existing) { skipped++; continue; }

      // Map e.Rede fields to vendas_cartao
      const valorBruto = (tx.amount || 0) / 100; // centavos -> reais
      const taxaPercentual = tx.feePercentage || null;
      const taxaValor = tx.feeAmount ? tx.feeAmount / 100 : null;
      const valorLiquido = taxaValor != null ? valorBruto - taxaValor : valorBruto;

      const tipoMap: Record<string, string> = {
        credit: "CREDITO",
        debit: "DEBITO",
        pix: "PIX",
      };

      const statusMap: Record<string, string> = {
        approved: "APROVADA",
        denied: "CANCELADA",
        cancelled: "CANCELADA",
        refunded: "ESTORNADA",
        pending: "APROVADA",
      };

      const record = {
        cod_empresa,
        adquirente: "REDE",
        nsu: tx.nsu ? String(tx.nsu) : null,
        autorizacao: tx.authorizationCode || null,
        tid: String(tid),
        bandeira: tx.brand || tx.cardBin?.brand || null,
        tipo: tipoMap[tx.kind?.toLowerCase()] || "CREDITO",
        parcelas: tx.installments || 1,
        valor_bruto: valorBruto,
        valor_liquido: valorLiquido,
        taxa_percentual: taxaPercentual,
        taxa_valor: taxaValor,
        data_venda: tx.dateTime
          ? new Date(tx.dateTime).toISOString().slice(0, 10)
          : start,
        data_prevista_credito: tx.expectedSettlementDate || null,
        status: statusMap[tx.returnCode?.toLowerCase()] || statusMap[tx.status?.toLowerCase()] || "APROVADA",
        dados_extras: tx,
      };

      const { error: insertErr } = await supabaseAdmin
        .from("vendas_cartao")
        .insert(record);

      if (insertErr) {
        console.error(`[sync-vendas-cartao] Insert error for tid ${tid}:`, insertErr.message);
        skipped++;
        continue;
      }
      inserted++;

      // Create recebivel_cartao entry for credit transactions
      if (record.tipo === "CREDITO" && record.status === "APROVADA" && record.data_prevista_credito) {
        const { error: recErr } = await supabaseAdmin
          .from("recebiveis_cartao")
          .insert({
            cod_empresa,
            adquirente: "REDE",
            adquirente_source: "REDE",
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
      total_api: transactions.length,
      inserted,
      skipped,
      recebiveis_created: recebiveisCreated,
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
