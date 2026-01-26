// supabase/functions/ai-central/index.ts
// Central de IA - Análise multi-dimensional consolidada
// Analisa: Vendas, Formas de Pagamento, Produtos/Famílias, Estoque e Orientação de Compras

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DadosCentralIA {
  periodo: string;
  empresa?: string;
  
  // Dados de Vendas (agregados)
  vendas?: {
    totalFaturamento: number;
    totalDesconto: number;
    percentualDesconto: number;
    qtdVendas: number;
    ticketMedio: number;
    porLoja?: Array<{
      loja: string;
      faturamento: number;
      percentualDesconto: number;
      ticketMedio: number;
      qtdVendas: number;
    }>;
    porVendedor?: Array<{
      vendedor: string;
      loja: string;
      faturamento: number;
      percentualDesconto: number;
      ticketMedio: number;
    }>;
  };
  
  // Dados de Formas de Pagamento
  formasPagamento?: Array<{
    formaPagamento: string;
    totalGeral: number;
    qtdVendas: number;
    percentualMix: number;
  }>;
  
  // Dados de Famílias de Produtos
  familias?: Array<{
    familia: string;
    totalVendido: number;
    qtdProdutos: number;
    percentualMix: number;
  }>;
  
  // Dados de Estoque
  estoque?: {
    totalItens: number;
    itensSemGiro: number;
    itensGiroLento: number;
    itensGiroNormal: number;
    itensGiroRapido: number;
    itensParaCompra: number;
    porFornecedor?: Array<{
      fornecedor: string;
      qtdItens: number;
      itensSemGiro: number;
      itensParaCompra: number;
    }>;
  };
  
  // Dados de Fornecedores/Marcas (análise SKU)
  fornecedoresMarcas?: Array<{
    fornecedor: string;
    marca: string;
    tipo: string;
    qtdSkus: number;
    estoqueTotal: number;
    qtdVendidos: number;
    totalVendido: number;
    margemMediaBruta: number;
    diasMedioDesdeVenda: number;
    skusSemGiro: number;
    skusGiroRapido: number;
    recomendacaoCompra: 'PRIORIZAR' | 'MANTER' | 'EVITAR';
  }>;
  
  // Metas cadastradas
  metas?: any;
}

const buildSystemPrompt = () => `Você é um consultor executivo de gestão de varejo ótico, especializado em análise integrada de performance.

Seu papel é analisar dados de múltiplas dimensões do negócio e fornecer diretrizes estratégicas e táticas acionáveis.

## Áreas de Análise:

### 1. VENDAS E FATURAMENTO
- Performance por loja e vendedor
- Atingimento de metas
- Tendências de crescimento/queda
- Ticket médio e oportunidades de aumento

### 2. POLÍTICA DE DESCONTO
- Percentual médio de desconto por loja/vendedor
- Identificar excessos ou anomalias
- Comparar com margem aceitável (ideal < 15%)
- Sugerir políticas de controle

### 3. MIX DE PAGAMENTOS
- Distribuição entre dinheiro, cartão crédito, débito, carnê
- Parcelamento médio e impacto no fluxo de caixa
- Estratégias para reduzir inadimplência (carnê)
- Incentivos para pagamento à vista

### 4. PRODUTOS E FAMÍLIAS
- Famílias mais vendidas (Armações, Lentes, Acessórios)
- Oportunidades de cross-selling
- Produtos parados vs. produtos em alta
- Sugestões de promoções por família

### 5. GESTÃO DE ESTOQUE E COMPRAS
- Itens sem giro (parados há mais de 180 dias)
- Itens com giro lento que precisam de ação
- Itens para reposição urgente
- **Orientação de compra de armações** baseada em:
  - Vendas recentes por marca/fornecedor
  - Tempo médio de giro por fornecedor
  - Estoque atual vs. demanda projetada
  - Fornecedores com melhor e pior performance

## Diretrizes de Resposta:

1. **Resumo Executivo** (3-4 linhas): Visão geral do estado do negócio
2. **Destaques Positivos**: O que está funcionando bem
3. **Pontos de Atenção**: Problemas identificados com severidade
4. **Plano de Ação Tático**: 4-6 ações específicas, priorizadas, com responsável sugerido
5. **Orientação de Compras** (se dados de estoque disponíveis): Fornecedores para priorizar/evitar

Use linguagem de negócios brasileira (faturamento, ticket médio, giro, ruptura).
Seja direto e pragmático. Evite generalidades.
Formate em markdown com seções claras usando ## e ###.`;

const buildUserPrompt = (dados: DadosCentralIA) => {
  let prompt = `# Análise do Período: ${dados.periodo}\n`;
  
  if (dados.empresa && dados.empresa !== 'ALL') {
    prompt += `Empresa selecionada: ${dados.empresa}\n\n`;
  } else {
    prompt += `Visão consolidada de todas as lojas\n\n`;
  }
  
  // Vendas
  if (dados.vendas) {
    prompt += `## 📊 DADOS DE VENDAS\n`;
    prompt += `- Faturamento Total: R$ ${dados.vendas.totalFaturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
    prompt += `- Desconto Total: R$ ${dados.vendas.totalDesconto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${dados.vendas.percentualDesconto.toFixed(1)}%)\n`;
    prompt += `- Quantidade de Vendas: ${dados.vendas.qtdVendas}\n`;
    prompt += `- Ticket Médio: R$ ${dados.vendas.ticketMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n\n`;
    
    if (dados.vendas.porLoja && dados.vendas.porLoja.length > 0) {
      prompt += `### Por Loja:\n`;
      prompt += `| Loja | Faturamento | Desconto% | Ticket Médio | Qtd Vendas |\n`;
      prompt += `|------|-------------|-----------|--------------|------------|\n`;
      dados.vendas.porLoja.slice(0, 15).forEach(l => {
        prompt += `| ${l.loja} | R$ ${l.faturamento.toLocaleString('pt-BR')} | ${l.percentualDesconto.toFixed(1)}% | R$ ${l.ticketMedio.toFixed(0)} | ${l.qtdVendas} |\n`;
      });
      prompt += `\n`;
    }
    
    if (dados.vendas.porVendedor && dados.vendas.porVendedor.length > 0) {
      prompt += `### Top 10 Vendedores:\n`;
      prompt += `| Vendedor | Loja | Faturamento | Desconto% | Ticket Médio |\n`;
      prompt += `|----------|------|-------------|-----------|-------------|\n`;
      dados.vendas.porVendedor.slice(0, 10).forEach(v => {
        prompt += `| ${v.vendedor} | ${v.loja} | R$ ${v.faturamento.toLocaleString('pt-BR')} | ${v.percentualDesconto.toFixed(1)}% | R$ ${v.ticketMedio.toFixed(0)} |\n`;
      });
      prompt += `\n`;
    }
  }
  
  // Formas de Pagamento
  if (dados.formasPagamento && dados.formasPagamento.length > 0) {
    prompt += `## 💳 MIX DE PAGAMENTOS\n`;
    prompt += `| Forma | Total | Qtd Vendas | % do Mix |\n`;
    prompt += `|-------|-------|------------|----------|\n`;
    dados.formasPagamento.forEach(f => {
      prompt += `| ${f.formaPagamento} | R$ ${f.totalGeral.toLocaleString('pt-BR')} | ${f.qtdVendas} | ${f.percentualMix.toFixed(1)}% |\n`;
    });
    prompt += `\n`;
  }
  
  // Famílias de Produtos
  if (dados.familias && dados.familias.length > 0) {
    prompt += `## 📦 FAMÍLIAS DE PRODUTOS\n`;
    prompt += `| Família | Total Vendido | Qtd Produtos | % do Mix |\n`;
    prompt += `|---------|---------------|--------------|----------|\n`;
    dados.familias.slice(0, 10).forEach(f => {
      prompt += `| ${f.familia} | R$ ${f.totalVendido.toLocaleString('pt-BR')} | ${f.qtdProdutos} | ${f.percentualMix.toFixed(1)}% |\n`;
    });
    prompt += `\n`;
  }
  
  // Estoque
  if (dados.estoque) {
    prompt += `## 📋 SITUAÇÃO DO ESTOQUE\n`;
    prompt += `- Total de Itens: ${dados.estoque.totalItens}\n`;
    prompt += `- 🔴 Sem Giro (>180 dias): ${dados.estoque.itensSemGiro} itens\n`;
    prompt += `- 🟡 Giro Lento (90-180 dias): ${dados.estoque.itensGiroLento} itens\n`;
    prompt += `- 🟢 Giro Normal (30-90 dias): ${dados.estoque.itensGiroNormal} itens\n`;
    prompt += `- 🔵 Giro Rápido (<30 dias): ${dados.estoque.itensGiroRapido} itens\n`;
    prompt += `- ⚠️ Itens para Compra/Reposição: ${dados.estoque.itensParaCompra} itens\n\n`;
    
    if (dados.estoque.porFornecedor && dados.estoque.porFornecedor.length > 0) {
      prompt += `### Por Fornecedor (Top 10):\n`;
      prompt += `| Fornecedor | Qtd Itens | Sem Giro | Para Comprar |\n`;
      prompt += `|------------|-----------|----------|-------------|\n`;
      dados.estoque.porFornecedor.slice(0, 10).forEach(f => {
        prompt += `| ${f.fornecedor} | ${f.qtdItens} | ${f.itensSemGiro} | ${f.itensParaCompra} |\n`;
      });
      prompt += `\n`;
    }
  }
  
  // Análise de Fornecedores/Marcas (novo endpoint analise-sku)
  if (dados.fornecedoresMarcas && dados.fornecedoresMarcas.length > 0) {
    prompt += `## 🏭 ANÁLISE DE FORNECEDORES E MARCAS\n`;
    prompt += `> Dados baseados em vendas do período com análise de giro e margem\n\n`;
    
    // Separar por recomendação
    const priorizar = dados.fornecedoresMarcas.filter(f => f.recomendacaoCompra === 'PRIORIZAR');
    const manter = dados.fornecedoresMarcas.filter(f => f.recomendacaoCompra === 'MANTER');
    const evitar = dados.fornecedoresMarcas.filter(f => f.recomendacaoCompra === 'EVITAR');
    
    if (priorizar.length > 0) {
      prompt += `### ✅ PRIORIZAR COMPRAS (${priorizar.length} combinações)\n`;
      prompt += `| Fornecedor | Marca | Tipo | SKUs | Vendido | Margem | Giro Rápido |\n`;
      prompt += `|------------|-------|------|------|---------|--------|-------------|\n`;
      priorizar.slice(0, 10).forEach(f => {
        const percGiroRapido = f.qtdSkus > 0 ? ((f.skusGiroRapido / f.qtdSkus) * 100).toFixed(0) : '0';
        prompt += `| ${f.fornecedor} | ${f.marca} | ${f.tipo} | ${f.qtdSkus} | R$ ${f.totalVendido.toLocaleString('pt-BR')} | ${f.margemMediaBruta.toFixed(0)}% | ${percGiroRapido}% |\n`;
      });
      prompt += `\n`;
    }
    
    if (evitar.length > 0) {
      prompt += `### ❌ EVITAR/REDUZIR COMPRAS (${evitar.length} combinações)\n`;
      prompt += `| Fornecedor | Marca | Tipo | SKUs | Estoque | Dias s/ Venda | Sem Giro |\n`;
      prompt += `|------------|-------|------|------|---------|---------------|----------|\n`;
      evitar.slice(0, 10).forEach(f => {
        const percSemGiro = f.qtdSkus > 0 ? ((f.skusSemGiro / f.qtdSkus) * 100).toFixed(0) : '0';
        prompt += `| ${f.fornecedor} | ${f.marca} | ${f.tipo} | ${f.qtdSkus} | ${f.estoqueTotal} | ${f.diasMedioDesdeVenda.toFixed(0)} | ${percSemGiro}% |\n`;
      });
      prompt += `\n`;
    }
    
    if (manter.length > 0) {
      prompt += `### ➡️ MANTER PADRÃO (${manter.length} combinações)\n`;
      prompt += `Top 5 por faturamento:\n`;
      prompt += `| Fornecedor | Marca | Vendido | Margem |\n`;
      prompt += `|------------|-------|---------|--------|\n`;
      manter.slice(0, 5).forEach(f => {
        prompt += `| ${f.fornecedor} | ${f.marca} | R$ ${f.totalVendido.toLocaleString('pt-BR')} | ${f.margemMediaBruta.toFixed(0)}% |\n`;
      });
      prompt += `\n`;
    }
    
    // Resumo
    const totalVendidoGeral = dados.fornecedoresMarcas.reduce((acc, f) => acc + f.totalVendido, 0);
    const totalSkus = dados.fornecedoresMarcas.reduce((acc, f) => acc + f.qtdSkus, 0);
    prompt += `**Resumo OTB:** ${totalSkus} SKUs analisados, R$ ${totalVendidoGeral.toLocaleString('pt-BR')} em vendas. `;
    prompt += `${priorizar.length} para priorizar, ${evitar.length} para evitar.\n\n`;
  }
  
  // Metas
  if (dados.metas) {
    prompt += `## 🎯 METAS CADASTRADAS\n`;
    prompt += `${JSON.stringify(dados.metas, null, 2)}\n\n`;
  }
  
  prompt += `---\n\n`;
  prompt += `Com base nesses dados, forneça sua análise completa com diretrizes estratégicas e táticas.`;
  prompt += `\n\nFoco especial em: **Orientação de compra de armações** (quais fornecedores/marcas priorizar baseado em giro e margem), políticas de desconto, e oportunidades de cross-selling entre famílias.`;
  
  return prompt;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const dados: DadosCentralIA = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log('[ai-central] Processando análise para período:', dados.periodo);
    console.log('[ai-central] Dados recebidos:', {
      temVendas: !!dados.vendas,
      temFormasPagamento: dados.formasPagamento?.length || 0,
      temFamilias: dados.familias?.length || 0,
      temEstoque: !!dados.estoque,
    });

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(dados);

    console.log('[ai-central] Enviando para Lovable AI...');
    
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
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Entre em contato com o administrador." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("[ai-central] AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "Erro ao processar análise de IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const analise = data.choices?.[0]?.message?.content || "Não foi possível gerar análise.";

    console.log('[ai-central] Análise gerada com sucesso');

    return new Response(JSON.stringify({ analise }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[ai-central] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
