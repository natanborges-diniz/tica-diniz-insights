// supabase/functions/ai-sugestao-cobertura/index.ts
// E0.3: JWT obrigatório + rate limit (authenticated)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authGuard, corsHeaders } from "../_shared/authGuard.ts";

interface DadosAnalise {
  coberturaAtualConfig: number;
  totalSkus: number;
  totalEstoque: number;
  totalVendido: number;
  coberturaMediaGeral: number;
  categorias: Array<{
    tipo: string;
    qtdSkus: number;
    estoqueTotal: number;
    vendaTotal: number;
    coberturaMedia: number;
    percCurvaA: number;
    percCurvaC: number;
  }>;
}

const buildPrompt = (dados: DadosAnalise) => {
  const systemPrompt = `Você é um especialista em gestão de estoque e compras no varejo ótico.
Sua tarefa é analisar métricas de estoque e vendas para sugerir a cobertura ideal (em dias) para cada categoria de produto.

REGRAS DE ANÁLISE:
1. Produtos com alto giro (Curva A > 30%) = cobertura menor (30-45 dias)
2. Produtos com giro médio (Curva A 15-30%) = cobertura média (45-60 dias)  
3. Produtos com baixo giro (Curva A < 15%) = cobertura maior (60-90 dias) para evitar ruptura
4. Se há muito estoque parado (Curva C > 40%), NÃO aumentar cobertura
5. Considerar sazonalidade: varejo ótico tem picos em volta às aulas e fim de ano

RESPONDA SEMPRE no formato JSON:
{
  "resumo": "Análise breve em 2-3 frases explicando a situação geral",
  "coberturaGlobalSugerida": número (30, 45, 60, 75 ou 90),
  "sugestoes": [
    {
      "categoria": "nome da categoria",
      "diasSugeridos": número,
      "justificativa": "motivo breve",
      "confianca": "alta" | "media" | "baixa"
    }
  ],
  "alertas": ["alerta 1", "alerta 2"]
}`;

  let userPrompt = `DADOS DO ESTOQUE ATUAL:
- Total de SKUs: ${dados.totalSkus}
- Estoque Total: ${dados.totalEstoque.toLocaleString('pt-BR')} peças
- Vendas no período: R$ ${dados.totalVendido.toLocaleString('pt-BR')}
- Cobertura média atual: ${dados.coberturaMediaGeral.toFixed(0)} dias
- Cobertura configurada: ${dados.coberturaAtualConfig} dias

POR CATEGORIA:
`;

  dados.categorias.forEach(cat => {
    userPrompt += `
${cat.tipo}:
  - SKUs: ${cat.qtdSkus}
  - Estoque: ${cat.estoqueTotal.toLocaleString('pt-BR')} peças
  - Vendas: R$ ${cat.vendaTotal.toLocaleString('pt-BR')}
  - Cobertura média: ${cat.coberturaMedia.toFixed(0)} dias
  - % Curva A (alto giro): ${cat.percCurvaA.toFixed(1)}%
  - % Curva C (parado): ${cat.percCurvaC.toFixed(1)}%
`;
  });

  userPrompt += `\nCom base nesses dados, qual deveria ser a cobertura ideal para otimizar o capital de giro sem causar ruptura?`;

  return { systemPrompt, userPrompt };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // E0.3: Auth guard — authenticated + rate limit
    await authGuard(req, {
      requiredRole: "authenticated",
      rateLimitFunctionName: "ai-sugestao-cobertura",
    });

    const dados: DadosAnalise = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log('[ai-sugestao-cobertura] Analisando', dados.totalSkus, 'SKUs');

    const { systemPrompt, userPrompt } = buildPrompt(dados);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
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
      console.error("[ai-sugestao-cobertura] AI gateway error:", response.status, errorText);
      throw new Error("Erro ao processar análise de IA");
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error("Resposta vazia da IA");
    }

    let resultado;
    try {
      resultado = JSON.parse(content);
    } catch (parseError) {
      console.error('[ai-sugestao-cobertura] Erro ao parsear JSON:', content);
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        resultado = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Formato de resposta inválido");
      }
    }

    return new Response(JSON.stringify(resultado), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[ai-sugestao-cobertura] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
