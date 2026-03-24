import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TOLERANCE = 0.01; // 1% tolerance on value matching

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action = "conciliar_auto", cod_empresa, data_inicio, data_fim } = body;

    if (!cod_empresa) throw new Error("cod_empresa é obrigatório");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (action === "conciliar_auto") {
      const end = data_fim || new Date().toISOString().slice(0, 10);
      const start = data_inicio || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

      // Fetch unconciliated card transactions
      const { data: vendasCartao } = await supabaseAdmin
        .from("vendas_cartao")
        .select("*")
        .eq("cod_empresa", cod_empresa)
        .eq("status", "APROVADA")
        .gte("data_venda", start)
        .lte("data_venda", end)
        .limit(1000);

      if (!vendasCartao || vendasCartao.length === 0) {
        return new Response(JSON.stringify({ conciliados: 0, divergentes: 0, message: "Nenhuma venda de cartão no período" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get already conciliated card IDs
      const { data: jaConciliados } = await supabaseAdmin
        .from("conciliacao_vendas")
        .select("venda_cartao_id")
        .eq("cod_empresa", cod_empresa)
        .in("status", ["CONCILIADO"]);

      const idsJaConciliados = new Set((jaConciliados || []).map(c => c.venda_cartao_id));
      const pendentes = vendasCartao.filter(v => !idsJaConciliados.has(v.id));

      if (pendentes.length === 0) {
        return new Response(JSON.stringify({ conciliados: 0, divergentes: 0, message: "Todas as vendas já estão conciliadas" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Try matching with ERP sales by NSU, value and date proximity
      // We query lancamentos_financeiros with origem='ERP' or forma_pagamento containing card types
      const { data: lancamentosErp } = await supabaseAdmin
        .from("lancamentos_financeiros")
        .select("id, valor, data_vencimento, descricao, origem_id, forma_pagamento, bandeira")
        .eq("cod_empresa", cod_empresa)
        .eq("tipo", "RECEBER")
        .gte("data_vencimento", start)
        .lte("data_vencimento", end)
        .limit(1000);

      let conciliados = 0;
      let divergentes = 0;

      for (const vc of pendentes) {
        // Try to find matching ERP entry
        const match = (lancamentosErp || []).find(erp => {
          const diff = Math.abs(Number(erp.valor) - Number(vc.valor_bruto));
          const tolerance = Number(vc.valor_bruto) * TOLERANCE;
          return diff <= tolerance;
        });

        if (match) {
          const diferenca = Number(match.valor) - Number(vc.valor_bruto);
          await supabaseAdmin.from("conciliacao_vendas").insert({
            cod_empresa,
            venda_erp_id: match.origem_id || match.id,
            venda_cartao_id: vc.id,
            status: Math.abs(diferenca) < 0.01 ? "CONCILIADO" : "DIVERGENTE",
            diferenca_valor: diferenca,
          });

          if (Math.abs(diferenca) < 0.01) {
            conciliados++;
          } else {
            divergentes++;
          }

          // Generate fee entry in ledger if taxa_valor exists
          if (vc.taxa_valor && Number(vc.taxa_valor) > 0) {
            await supabaseAdmin.from("lancamentos_financeiros").insert({
              cod_empresa,
              tipo: "PAGAR",
              descricao: `Taxa ${vc.adquirente} - ${vc.bandeira || "Cartão"} - TID ${vc.tid}`,
              valor: Number(vc.taxa_valor),
              data_vencimento: vc.data_prevista_credito || vc.data_venda,
              status: "PREVISTO",
              origem: "ADQUIRENTE",
              categoria: "TAXA_ADQUIRENTE",
              adquirente: vc.adquirente,
              bandeira: vc.bandeira,
            });
          }
        } else {
          // No ERP match — mark as pending
          await supabaseAdmin.from("conciliacao_vendas").insert({
            cod_empresa,
            venda_cartao_id: vc.id,
            status: "PENDENTE_ERP",
          });
          divergentes++;
        }
      }

      return new Response(JSON.stringify({ conciliados, divergentes, total_processado: pendentes.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "conciliar_manual") {
      const { venda_cartao_id, venda_erp_id, observacao } = body;
      if (!venda_cartao_id) throw new Error("venda_cartao_id é obrigatório");

      // Get card sale details
      const { data: vc } = await supabaseAdmin
        .from("vendas_cartao")
        .select("*")
        .eq("id", venda_cartao_id)
        .single();

      if (!vc) throw new Error("Venda de cartão não encontrada");

      const { error } = await supabaseAdmin.from("conciliacao_vendas").upsert({
        cod_empresa,
        venda_cartao_id,
        venda_erp_id: venda_erp_id || null,
        status: "CONCILIADO",
        diferenca_valor: 0,
        observacao: observacao || "Conciliação manual",
        conciliado_em: new Date().toISOString(),
      }, { onConflict: "venda_cartao_id" });

      if (error) throw error;

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "listar") {
      const { status: filtroStatus, limit: lim = 500 } = body;
      let query = supabaseAdmin
        .from("conciliacao_vendas")
        .select("*, vendas_cartao(*)")
        .eq("cod_empresa", cod_empresa)
        .order("created_at", { ascending: false })
        .limit(lim);

      if (filtroStatus && filtroStatus !== "todos") {
        query = query.eq("status", filtroStatus);
      }

      const { data, error } = await query;
      if (error) throw error;

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Action '${action}' não suportada`);
  } catch (err) {
    console.error("[conciliar-vendas] Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
