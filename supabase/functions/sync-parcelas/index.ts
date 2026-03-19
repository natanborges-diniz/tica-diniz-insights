// supabase/functions/sync-parcelas/index.ts
// Sync parcelas financeiras do Firebird para parcelas_cache

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authGuard, corsHeaders } from "../_shared/authGuard.ts";

const FIREBIRD_BASE_URL = (Deno.env.get("FIREBIRD_API_BASE_URL") || "https://firebird-bridge-production.up.railway.app").replace(/\/+$/, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth guard — admin or service_role (cron)
    await authGuard(req, { requiredRole: "admin" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") || "incremental";
    const codEmpresa = url.searchParams.get("codEmpresa") || "ALL";

    // Define date range based on mode
    const now = new Date();
    const dataFim = now.toISOString().slice(0, 10);
    let dataInicio: string;

    if (mode === "backfill") {
      const start = new Date(now);
      start.setMonth(start.getMonth() - 6);
      dataInicio = start.toISOString().slice(0, 10);
    } else {
      // Incremental: last 45 days to capture any late changes
      const start = new Date(now);
      start.setDate(start.getDate() - 45);
      dataInicio = start.toISOString().slice(0, 10);
    }

    // Also fetch future parcelas (next 90 days)
    const futureEnd = new Date(now);
    futureEnd.setDate(futureEnd.getDate() + 90);
    const dataFimExtended = futureEnd.toISOString().slice(0, 10);

    console.log(`[sync-parcelas] Mode: ${mode}, Period: ${dataInicio} to ${dataFimExtended}, Empresa: ${codEmpresa}`);

    const empresaParam = codEmpresa === "ALL" ? "TODAS" : codEmpresa;
    const fbUrl = `${FIREBIRD_BASE_URL}/api/v1/financeiro/parcelas?dataInicio=${dataInicio}&dataFim=${dataFimExtended}&empresa=${empresaParam}&campoData=VENCIMENTO`;
    console.log(`[sync-parcelas] Firebird URL: ${fbUrl}`);
    const fbResponse = await fetch(fbUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!fbResponse.ok) throw new Error(`Firebird API error: ${fbResponse.status}`);

    const fbResult = await fbResponse.json();
    const records = fbResult.data ?? fbResult.rows ?? (Array.isArray(fbResult) ? fbResult : []);

    console.log(`[sync-parcelas] Fetched ${records.length} records from Firebird`);

    if (records.length === 0) {
      return new Response(JSON.stringify({ ok: true, synced: 0, mode }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Delete existing records in the date range for the empresa(s) being synced
    // to handle removed/changed parcelas
    if (codEmpresa === "ALL") {
      await supabase
        .from("parcelas_cache")
        .delete()
        .gte("data_vencimento", dataInicio)
        .lte("data_vencimento", dataFimExtended);
    } else {
      await supabase
        .from("parcelas_cache")
        .delete()
        .eq("cod_empresa", parseInt(codEmpresa))
        .gte("data_vencimento", dataInicio)
        .lte("data_vencimento", dataFimExtended);
    }

    const batchSize = 200;
    let totalInserted = 0;
    const loadedAt = new Date().toISOString();

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize).map((r: Record<string, unknown>) => {
        const lancamentoPagar = ((r.lancamento_pagar as string) ?? "").trim();
        const tipoLancamento = lancamentoPagar === "T" ? "PAGAR" : "RECEBER";

        return {
          cod_empresa: r.cod_empresa ?? 0,
          empresa_nome: ((r.empresa_nome as string) ?? "").trim(),
          tipo_lancamento: tipoLancamento,
          documento: ((r.lancamento_documento as string) ?? "").trim(),
          pessoa_nome: ((r.pessoa_nome as string) ?? "").trim(),
          data_vencimento: r.parcela_data_vencimento ?? null,
          data_emissao: r.parcela_data_emissao ?? null,
          data_pagamento: r.parcela_data_pagamento ?? null,
          valor: r.parcela_valor ?? 0,
          valor_pago: r.parcela_valor_pago ?? 0,
          situacao: ((r.parcela_situacao as string) ?? "EM ABERTO").trim(),
          conta_numero: ((r.contacla_numero as string) ?? "").trim() || null,
          conta_descricao: ((r.contacla_descricao as string) ?? "").trim() || null,
          forma_pagamento_tipo: ((r.formapagto_tipo_nome as string) ?? "").trim() || null,
          cache_loaded_at: loadedAt,
        };
      });

      const { error } = await supabase.from("parcelas_cache").insert(batch);
      if (!error) {
        totalInserted += batch.length;
      } else {
        console.error(`[sync-parcelas] Insert error batch ${i}:`, error.message);
      }
    }

    console.log(`[sync-parcelas] Synced ${totalInserted} parcelas`);

    return new Response(
      JSON.stringify({ ok: true, synced: totalInserted, mode, period: { dataInicio, dataFim: dataFimExtended } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[sync-parcelas] Error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
