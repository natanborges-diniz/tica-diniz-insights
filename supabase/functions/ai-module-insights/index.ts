// supabase/functions/ai-module-insights/index.ts
// Edge Function: Gera insights IA por módulo com base no IAContext
// Retorna InsightItem[] em JSON estrito

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authGuard, corsHeaders } from "../_shared/authGuard.ts";

interface IAContext {
  module: string;
  route: string;
  empresaIdsPermitidas: number[];
  period?: { from: string; to: string };
  filters?: Record<string, unknown>;
  selection?: Record<string, unknown>;
  user: { id: string; role: string };
  permissionsSnapshot: { modules: string[]; stores: number[] };
  topN?: number;
}

// Build the system prompt that forces strict JSON output
const buildSystemPrompt = () => `Você é um motor de insights de negócio para uma rede de óticas.

IMPORTANTE: Responda EXCLUSIVAMENTE com um array JSON válido (sem markdown, sem texto extra).

Cada item deve seguir este schema:
{
  "id": "string único (ex: vendas_meta_baixa_1)",
  "severity": "opportunity" | "info" | "warning" | "danger",
  "title": "título curto (máx 60 chars)",
  "summary": "1-2 linhas descritivas",
  "why": "explicação opcional (1-2 linhas)",
  "confidence": 0.0 a 1.0 (opcional),
  "actions": [{ "actionId": "ID_DA_ACAO", "label": "Texto do botão", "payload": {} }]
}

## Ações permitidas por módulo:

VENDAS: APPLY_FILTERS, OPEN_SALES_ROW_DETAIL_SHEET, OPEN_RANKING_STORES, OPEN_RANKING_SELLERS, NAVIGATE_INTELIGENCIA_VENDAS, EXPORT_FILTERED_DATASET
ESTOQUE: APPLY_FILTERS, OPEN_SKU_DETAIL_SHEET, NAVIGATE_OTB, NAVIGATE_ACOES_ESTOQUE, EXPORT_FILTERED_DATASET
FINANCEIRO: APPLY_FILTERS, OPEN_FINANCE_ROW_DETAIL_SHEET, NAVIGATE_DRE, NAVIGATE_FLUXO_CAIXA, EXPORT_FILTERED_DATASET
OS: APPLY_FILTERS, OPEN_OS_DETAIL_SHEET, NAVIGATE_PEDIDO_HOYA, EXPORT_FILTERED_DATASET
ADMIN: NAVIGATE_ADMIN_USUARIOS, NAVIGATE_SYNC, NAVIGATE_HEALTH, NAVIGATE_METAS
CONFIG: NAVIGATE_ADMIN_USUARIOS, NAVIGATE_SYNC, NAVIGATE_HEALTH, NAVIGATE_METAS

Regras:
- Gere entre 3 e 6 insights relevantes para o módulo e dados fornecidos
- Priorize por severidade: danger > warning > opportunity > info
- Use apenas ações do catálogo do módulo correspondente
- Para ações com payload, inclua chaves relevantes (ex: {"loja": "Loja 1"} para APPLY_FILTERS)
- Linguagem brasileira de negócios (faturamento, ticket médio, giro, ruptura)
- Seja direto e pragmático
- Retorne SOMENTE o array JSON, nada mais`;

async function collectModuleData(
  supabaseUrl: string,
  serviceKey: string,
  ctx: IAContext
): Promise<Record<string, unknown>> {
  const client = createClient(supabaseUrl, serviceKey);
  const data: Record<string, unknown> = {
    module: ctx.module,
    period: ctx.period,
    empresas: ctx.empresaIdsPermitidas,
  };

  // Pre-fetch store names
  const nomeLojaMap = new Map<number, string>();
  try {
    const { data: empresas } = await client
      .from("empresa")
      .select("cod_empresa, nome_fantasia")
      .in("cod_empresa", ctx.empresaIdsPermitidas);
    if (empresas) {
      empresas.forEach((e: any) => nomeLojaMap.set(e.cod_empresa, e.nome_fantasia || `Loja ${e.cod_empresa}`));
    }
  } catch {}

  const getNomeLoja = (cod: number) => nomeLojaMap.get(cod) || `Loja ${cod}`;

  try {
    if (ctx.module === "vendas" && ctx.period) {
      // Fetch aggregated sales data
      let query = client
        .from("vendas_agregado_diario")
        .select("*")
        .gte("data", ctx.period.from)
        .lte("data", ctx.period.to);
      
      if (ctx.empresaIdsPermitidas.length > 0 && ctx.empresaIdsPermitidas.length < 20) {
        query = query.in("cod_empresa", ctx.empresaIdsPermitidas);
      }

      const { data: vendas } = await query.limit(500);
      
      if (vendas && vendas.length > 0) {
        // Aggregate by store
        const byStore = new Map<number, { faturamento: number; desconto: number; bruto: number; qtd: number }>();
        let totalFat = 0, totalDesc = 0, totalBruto = 0, totalQtd = 0;

        vendas.forEach((v: any) => {
          if (v.forma_pagamento === 'DEVOLUCAO' || v.forma_pagamento === 'CREDITO') return;
          totalFat += v.total_vendido || 0;
          totalDesc += v.total_desconto || 0;
          totalBruto += v.total_bruto || 0;
          totalQtd += v.qtd_vendas || 0;

          const s = byStore.get(v.cod_empresa) || { faturamento: 0, desconto: 0, bruto: 0, qtd: 0 };
          s.faturamento += v.total_vendido || 0;
          s.desconto += v.total_desconto || 0;
          s.bruto += v.total_bruto || 0;
          s.qtd += v.qtd_vendas || 0;
          byStore.set(v.cod_empresa, s);
        });

        data.vendas = {
          totalFaturamento: totalFat,
          totalDesconto: totalDesc,
          percentualDesconto: totalBruto > 0 ? (totalDesc / totalBruto) * 100 : 0,
          qtdVendas: totalQtd,
          ticketMedio: totalQtd > 0 ? totalFat / totalQtd : 0,
          porLoja: Array.from(byStore.entries()).map(([cod, s]) => ({
            loja: getNomeLoja(cod),
            codEmpresa: cod,
            faturamento: s.faturamento,
            percentualDesconto: s.bruto > 0 ? (s.desconto / s.bruto) * 100 : 0,
            ticketMedio: s.qtd > 0 ? s.faturamento / s.qtd : 0,
            qtdVendas: s.qtd,
          })).sort((a, b) => b.faturamento - a.faturamento),
        };

        // Fetch metas for comparison
        const now = new Date();
        const { data: metas } = await client
          .from("metas_vendas")
          .select("*")
          .eq("tipo", "LOJA")
          .eq("ano", now.getFullYear())
          .eq("mes", now.getMonth() + 1)
          .in("cod_referencia", ctx.empresaIdsPermitidas);
        
        if (metas && metas.length > 0) {
          data.metas = metas.map((m: any) => ({
            loja: getNomeLoja(m.cod_referencia),
            codEmpresa: m.cod_referencia,
            metaFaturamento: m.meta_faturamento,
            metaTicketMedio: m.meta_ticket_medio,
          }));
        }
      }
    }

    if (ctx.module === "financeiro") {
      // Basic counts of overdue items — using simple query
      const hoje = new Date().toISOString().split("T")[0];
      // Note: financeiro data comes from firebird bridge, not supabase directly
      // We provide general context
      data.financeiro = { dataAtual: hoje };
    }

    if (ctx.module === "os") {
      // Fetch OS stats from cache
      const { data: osData, count } = await client
        .from("os_hub_receitas")
        .select("status_atraso, etapa, cod_empresa", { count: "exact" })
        .in("cod_empresa", ctx.empresaIdsPermitidas)
        .limit(1000);

      if (osData) {
        const atrasadas = osData.filter((o: any) => o.status_atraso === "ATRASO").length;
        const semData = osData.filter((o: any) => o.status_atraso === "SEM_DATA").length;
        const etapas = new Map<string, number>();
        osData.forEach((o: any) => {
          const e = o.etapa || "SEM_ETAPA";
          etapas.set(e, (etapas.get(e) || 0) + 1);
        });

        data.os = {
          total: count || osData.length,
          atrasadas,
          semData,
          porEtapa: Object.fromEntries(etapas),
        };
      }
    }

    if (ctx.module === "admin") {
      // Check sync status
      const { data: recentRuns } = await client
        .from("sync_runs")
        .select("status, created_at, error_message, entidades")
        .order("created_at", { ascending: false })
        .limit(5);

      data.syncStatus = recentRuns;

      // Check bridge health
      const { data: healthLogs } = await client
        .from("bridge_health_logs")
        .select("status, checked_at, latency_ms")
        .order("checked_at", { ascending: false })
        .limit(3);

      data.bridgeHealth = healthLogs;
    }

    if (ctx.module === "config") {
      // Check metas coverage
      const now = new Date();
      const { data: metas } = await client
        .from("metas_vendas")
        .select("tipo, cod_referencia, mes")
        .eq("ano", now.getFullYear())
        .eq("mes", now.getMonth() + 1);

      const { data: empresas } = await client
        .from("empresa")
        .select("cod_empresa")
        .eq("ativa", true);

      data.metasCoverage = {
        totalMetas: metas?.length || 0,
        totalEmpresas: empresas?.length || 0,
        empresasComMeta: metas ? new Set(metas.filter((m: any) => m.tipo === "LOJA").map((m: any) => m.cod_referencia)).size : 0,
      };
    }
  } catch (err) {
    console.error("[ai-module-insights] Error collecting data:", err);
  }

  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    await authGuard(req, {
      requiredRole: "authenticated",
      rateLimitFunctionName: "ai-module-insights",
    });

    const ctx: IAContext = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log(`[ai-module-insights] Module: ${ctx.module}, Empresas: ${ctx.empresaIdsPermitidas?.length}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Collect relevant data for the module
    const moduleData = await collectModuleData(supabaseUrl, serviceKey, ctx);

    const systemPrompt = buildSystemPrompt();
    const userPrompt = `Módulo: ${ctx.module.toUpperCase()}
Rota: ${ctx.route}
Empresas: ${ctx.empresaIdsPermitidas.join(", ")}
Período: ${ctx.period ? `${ctx.period.from} a ${ctx.period.to}` : "não especificado"}
TopN: ${ctx.topN || 6}

Dados disponíveis:
${JSON.stringify(moduleData, null, 2)}

Gere os insights mais relevantes para este contexto. Retorne SOMENTE o array JSON.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit excedido", insights: [] }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("[ai-module-insights] AI error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "Erro ao processar IA", insights: [] }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await response.json();
    let content = aiData.choices?.[0]?.message?.content || "[]";

    // Strip markdown code fences if present
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let insights: unknown[];
    try {
      const parsed = JSON.parse(content);
      insights = Array.isArray(parsed) ? parsed : [];
    } catch {
      console.error("[ai-module-insights] Failed to parse JSON:", content.substring(0, 200));
      insights = [];
    }

    return new Response(JSON.stringify({ insights }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[ai-module-insights] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido", insights: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
