// supabase/functions/ai-diretrizes/index.ts
// E0.3: JWT obrigatório + rate limit (authenticated)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authGuard, corsHeaders } from "../_shared/authGuard.ts";

interface DadosRanking {
  tipo: 'loja' | 'vendedor';
  dados: any[];
  periodo: string;
  meta?: any;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // E0.3: Auth guard — authenticated + rate limit
    await authGuard(req, {
      requiredRole: "authenticated",
      rateLimitFunctionName: "ai-diretrizes",
    });

    const { tipo, dados, periodo, meta }: DadosRanking = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = tipo === 'loja' 
      ? `Você é um consultor de gestão de varejo ótico especializado em análise de performance de lojas.
Analise os dados de vendas das lojas e forneça:
1. Um resumo executivo de 2-3 linhas sobre a performance geral
2. Identifique a loja campeã e o que ela faz de diferente
3. Identifique a loja que precisa de mais atenção e sugira 2-3 ações específicas
4. Se houver metas, compare o realizado vs meta
5. Destaque anomalias ou tendências importantes

Seja direto, use linguagem de negócios brasileira (faturamento, ticket médio, conversão).
Formate sua resposta em markdown com seções claras.`
      : `Você é um consultor de gestão de varejo ótico especializado em desenvolvimento de equipes de vendas.
Analise os dados de performance dos vendedores e forneça:
1. Um resumo executivo de 2-3 linhas
2. Destaque o vendedor destaque e suas características
3. Identifique vendedores que precisam de coaching e sugira ações específicas
4. Compare ticket médio individual vs média da loja/rede
5. Se houver metas, analise % de atingimento
6. Sugira treinamentos específicos baseados nas lacunas identificadas

Seja direto, use linguagem motivacional mas realista.
Formate sua resposta em markdown com seções claras.`;

    const userPrompt = `Período: ${periodo}

Dados de ${tipo === 'loja' ? 'Lojas' : 'Vendedores'}:
${JSON.stringify(dados, null, 2)}

${meta ? `Metas definidas: ${JSON.stringify(meta, null, 2)}` : 'Sem metas cadastradas para o período.'}

Forneça sua análise e diretrizes estratégicas.`;

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
          { role: "user", content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns minutos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Entre em contato com o administrador." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "Erro ao processar análise de IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const analise = data.choices?.[0]?.message?.content || "Não foi possível gerar análise.";

    return new Response(JSON.stringify({ analise }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Error in ai-diretrizes function:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
