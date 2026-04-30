import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Score multi-critério: valor (40) + data (25) + bandeira (15) + parcelas (10) + forma (10)
function scoreMatch(vc: any, erp: any): number {
  let score = 0;
  const valorVc = Number(vc.valor_bruto || 0);
  const valorErp = Number(erp.valor || 0);
  const diff = Math.abs(valorVc - valorErp);

  if (diff < 0.01) score += 40;
  else if (diff < valorVc * 0.005) score += 30;
  else if (diff < valorVc * 0.02) score += 15;

  const dVc = new Date(vc.data_venda).getTime();
  const dErp = new Date(erp.data_emissao || erp.data_vencimento).getTime();
  const dias = Math.abs((dVc - dErp) / 86400000);
  if (dias === 0) score += 25;
  else if (dias <= 1) score += 20;
  else if (dias <= 2) score += 12;
  else if (dias <= 5) score += 5;

  if (vc.bandeira && erp.bandeira && vc.bandeira.toUpperCase() === erp.bandeira.toUpperCase()) {
    score += 15;
  } else if (!erp.bandeira) {
    score += 5;
  }

  if (vc.parcelas && erp.total_parcelas && vc.parcelas === erp.total_parcelas) score += 10;
  else if (!erp.total_parcelas) score += 3;

  const fp = String(erp.forma_pagamento || "").toUpperCase();
  if (fp.includes("CART") || fp.includes("CARD") || fp.includes("CARNE") === false) {
    if (fp.includes("CART") || fp.includes("CARD")) score += 10;
  }

  return score;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action = "conciliar_auto", cod_empresa, data_inicio, data_fim } = body;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (action === "conciliar_auto") {
      if (!cod_empresa) throw new Error("cod_empresa é obrigatório");
      const end = data_fim || new Date().toISOString().slice(0, 10);
      const start = data_inicio || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

      // Vendas cartão aprovadas
      const { data: vendasCartao } = await supabaseAdmin
        .from("vendas_cartao")
        .select("*")
        .eq("cod_empresa", cod_empresa)
        .eq("status", "APROVADA")
        .gte("data_venda", start)
        .lte("data_venda", end)
        .limit(2000);

      if (!vendasCartao?.length) {
        return new Response(JSON.stringify({ conciliados: 0, divergentes: 0, pendentes: 0, message: "Nenhuma venda no período" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Já conciliados
      const { data: jaConciliados } = await supabaseAdmin
        .from("conciliacao_vendas")
        .select("venda_cartao_id, status")
        .eq("cod_empresa", cod_empresa)
        .in("status", ["CONCILIADO", "DIVERGENTE", "PENDENTE_ERP"]);

      const idsExistentes = new Set((jaConciliados || []).map((c: any) => c.venda_cartao_id));
      const pendentes = vendasCartao.filter((v: any) => !idsExistentes.has(v.id));

      if (!pendentes.length) {
        return new Response(JSON.stringify({ conciliados: 0, divergentes: 0, pendentes: 0, message: "Tudo conciliado" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ERP — janela ampliada
      const startErp = new Date(new Date(start).getTime() - 5 * 86400000).toISOString().slice(0, 10);
      const endErp = new Date(new Date(end).getTime() + 5 * 86400000).toISOString().slice(0, 10);

      const { data: lancamentosErp } = await supabaseAdmin
        .from("lancamentos_financeiros")
        .select("id, valor, data_vencimento, data_emissao, descricao, origem_id, forma_pagamento, bandeira, total_parcelas")
        .eq("cod_empresa", cod_empresa)
        .eq("tipo", "RECEBER")
        .gte("data_emissao", startErp)
        .lte("data_emissao", endErp)
        .or("forma_pagamento.ilike.%CART%,forma_pagamento.ilike.%CARD%")
        .limit(5000);

      const erpDisponiveis = new Map<string, any>();
      (lancamentosErp || []).forEach((e: any) => erpDisponiveis.set(e.id, e));
      const erpUsados = new Set<string>();

      let conciliados = 0;
      let divergentes = 0;
      let pendentesCount = 0;
      let recebiveisGerados = 0;
      let taxasGeradas = 0;

      for (const vc of pendentes) {
        let melhorScore = 0;
        let melhorErp: any = null;

        for (const erp of erpDisponiveis.values()) {
          if (erpUsados.has(erp.id)) continue;
          const s = scoreMatch(vc, erp);
          if (s > melhorScore) {
            melhorScore = s;
            melhorErp = erp;
          }
        }

        let status: string;
        let dif = 0;
        if (melhorErp && melhorScore >= 80) {
          status = "CONCILIADO";
          dif = Number(melhorErp.valor) - Number(vc.valor_bruto);
          erpUsados.add(melhorErp.id);
          conciliados++;
        } else if (melhorErp && melhorScore >= 50) {
          status = "DIVERGENTE";
          dif = Number(melhorErp.valor) - Number(vc.valor_bruto);
          erpUsados.add(melhorErp.id);
          divergentes++;
        } else {
          status = "PENDENTE_ERP";
          melhorErp = null;
          pendentesCount++;
        }

        await supabaseAdmin.from("conciliacao_vendas").insert({
          cod_empresa,
          venda_cartao_id: vc.id,
          venda_erp_id: melhorErp?.origem_id || melhorErp?.id || null,
          status,
          diferenca_valor: dif,
          observacao: melhorErp ? `Score ${melhorScore}` : null,
          conciliado_em: status === "CONCILIADO" ? new Date().toISOString() : null,
        });

        // Gerar lançamentos automáticos APENAS quando match é exato
        if (status === "CONCILIADO" && Math.abs(dif) < 0.01) {
          // Taxa
          if (vc.taxa_valor && Number(vc.taxa_valor) > 0) {
            const { error: taxaErr } = await supabaseAdmin.from("lancamentos_financeiros").insert({
              cod_empresa,
              tipo: "PAGAR",
              descricao: `TAXA ${vc.adquirente} ${vc.bandeira || ""} - NSU ${vc.nsu}`.toUpperCase(),
              valor: Number(vc.taxa_valor),
              data_vencimento: vc.data_prevista_credito || vc.data_venda,
              data_emissao: vc.data_venda,
              status: "PREVISTO",
              origem: "ADQUIRENTE",
              categoria: "TAXA_ADQUIRENTE",
              adquirente: vc.adquirente,
              bandeira: vc.bandeira,
              recebivel_cartao_id: null,
            });
            if (!taxaErr) taxasGeradas++;
          }
          recebiveisGerados++;
        }
      }

      return new Response(JSON.stringify({
        total_processado: pendentes.length,
        conciliados,
        divergentes,
        pendentes: pendentesCount,
        taxas_geradas: taxasGeradas,
        recebiveis_gerados: recebiveisGerados,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "conciliar_manual") {
      const { venda_cartao_id, venda_erp_id, observacao } = body;
      if (!venda_cartao_id) throw new Error("venda_cartao_id é obrigatório");
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

    if (action === "candidatos_erp") {
      const { venda_cartao_id } = body;
      if (!venda_cartao_id) throw new Error("venda_cartao_id é obrigatório");
      const { data: vc } = await supabaseAdmin.from("vendas_cartao").select("*").eq("id", venda_cartao_id).single();
      if (!vc) throw new Error("Venda não encontrada");
      const startErp = new Date(new Date(vc.data_venda).getTime() - 7 * 86400000).toISOString().slice(0, 10);
      const endErp = new Date(new Date(vc.data_venda).getTime() + 7 * 86400000).toISOString().slice(0, 10);
      const { data: erp } = await supabaseAdmin
        .from("lancamentos_financeiros")
        .select("id, valor, data_vencimento, data_emissao, descricao, forma_pagamento, bandeira, total_parcelas, pessoa_nome")
        .eq("cod_empresa", vc.cod_empresa)
        .eq("tipo", "RECEBER")
        .gte("data_emissao", startErp)
        .lte("data_emissao", endErp)
        .limit(200);
      const ranked = (erp || []).map((e: any) => ({ ...e, _score: scoreMatch(vc, e) }))
        .sort((a, b) => b._score - a._score)
        .slice(0, 20);
      return new Response(JSON.stringify({ venda_cartao: vc, candidatos: ranked }), {
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
