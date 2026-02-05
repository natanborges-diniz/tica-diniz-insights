import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FIREBIRD_BASE_URL = Deno.env.get("FIREBIRD_API_BASE_URL") || "https://firebird-bridge-production.up.railway.app";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Determine sync window: last 2 days for incremental, or custom range
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") || "incremental"; // incremental | backfill
    const codEmpresa = url.searchParams.get("codEmpresa") || "ALL";

    let dataInicio: string;
    let dataFim: string;
    const now = new Date();
    dataFim = now.toISOString().slice(0, 10);

    if (mode === "backfill") {
      // 3 months backfill
      const start = new Date(now);
      start.setMonth(start.getMonth() - 3);
      dataInicio = start.toISOString().slice(0, 10);
    } else {
      // Incremental: last 2 days
      const start = new Date(now);
      start.setDate(start.getDate() - 2);
      dataInicio = start.toISOString().slice(0, 10);
    }

    console.log(`[sync-os-hub] Mode: ${mode}, Period: ${dataInicio} to ${dataFim}, Empresa: ${codEmpresa}`);

    // Fetch from Firebird Bridge
    const fbUrl = `${FIREBIRD_BASE_URL}/api/v1/os/hub-receitas?dataInicio=${dataInicio}&dataFim=${dataFim}&codEmpresa=${codEmpresa}`;
    console.log(`[sync-os-hub] Fetching from Firebird: ${fbUrl}`);

    const fbResponse = await fetch(fbUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!fbResponse.ok) {
      throw new Error(`Firebird API error: ${fbResponse.status} ${fbResponse.statusText}`);
    }

    const fbResult = await fbResponse.json();
    const records = fbResult.data ?? fbResult.rows ?? (Array.isArray(fbResult) ? fbResult : []);
    console.log(`[sync-os-hub] Firebird returned ${records.length} records`);

    if (records.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, synced: 0, mode }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Map and upsert to cache in batches
    const batchSize = 100;
    let totalUpserted = 0;

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize).map((r: Record<string, unknown>) => ({
        cod_os: r.cod_os ?? 0,
        numero_os: String(r.numero_os ?? r.os ?? ""),
        cod_empresa: r.codempresa ?? r.cod_empresa ?? 0,
        empresa: ((r.empresa as string) ?? "").trim(),
        cliente: ((r.cliente as string) ?? "").trim(),
        cod_cliente: r.cod_cliente ?? null,
        telefone: ((r.telefone as string) ?? "").trim() || null,
        etapa: ((r.etapa as string) ?? "").trim(),
        status_atraso: ((r.status_atraso as string) ?? "SEM_DATA").trim().toUpperCase(),
        atraso_dias: r.atraso_dias ?? 0,
        data_emissao: r.dataemissao ?? r.data_emissao ?? null,
        data_previsao: r.dataprevisao ?? r.data_previsao ?? null,
        data_entrada: r.datahoraentrada ?? r.data_entrada ?? null,
        data_saida: r.datahorasaida ?? r.data_saida ?? null,
        total: r.total ?? 0,
        usuario: ((r.usuario as string) ?? "").trim(),
        od_longe_esf: r.od_longe_esf ?? null,
        od_longe_cil: r.od_longe_cil ?? null,
        od_longe_eixo: r.od_longe_eixo ?? null,
        od_perto_esf: r.od_perto_esf ?? null,
        od_perto_cil: r.od_perto_cil ?? null,
        od_perto_eixo: r.od_perto_eixo ?? null,
        od_adicao: r.od_adicao ?? null,
        od_dnp: r.od_dnp ?? null,
        od_altura: r.od_altura ?? null,
        oe_longe_esf: r.oe_longe_esf ?? null,
        oe_longe_cil: r.oe_longe_cil ?? null,
        oe_longe_eixo: r.oe_longe_eixo ?? null,
        oe_perto_esf: r.oe_perto_esf ?? null,
        oe_perto_cil: r.oe_perto_cil ?? null,
        oe_perto_eixo: r.oe_perto_eixo ?? null,
        oe_adicao: r.oe_adicao ?? null,
        oe_dnp: r.oe_dnp ?? null,
        oe_altura: r.oe_altura ?? null,
        prisma: ((r.prisma as string) ?? "").trim() || null,
        prisma1: ((r.prisma1 as string) ?? "").trim() || null,
        imagem_receita: ((r.imagem_receita as string) ?? "").trim() || null,
        url_imagem_receita: ((r.url_imagem_receita as string) ?? "").trim() || null,
        imagem_armacao: ((r.imagem_armacao as string) ?? "").trim() || null,
        url_imagem_armacao: ((r.url_imagem_armacao as string) ?? "").trim() || null,
        imagem_tracer: ((r.imagem_tracer as string) ?? "").trim() || null,
        observacao_os: ((r.observacao_os as string) ?? "").trim() || null,
        observacao_lente: ((r.observacao_lente as string) ?? "").trim() || null,
        observacao_pendencia: ((r.observacao_pendencia as string) ?? "").trim() || null,
        cache_loaded_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from("os_hub_receitas")
        .upsert(batch, { onConflict: "cod_os" });

      if (error) {
        console.error(`[sync-os-hub] Upsert error batch ${i}:`, error.message);
      } else {
        totalUpserted += batch.length;
      }
    }

    console.log(`[sync-os-hub] Done. Upserted ${totalUpserted} records.`);

    return new Response(
      JSON.stringify({ ok: true, synced: totalUpserted, mode, period: { dataInicio, dataFim } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[sync-os-hub] Error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
