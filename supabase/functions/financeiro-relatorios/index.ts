import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, authGuard } from "../_shared/authGuard.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    await authGuard(req, { requiredRole: "authenticated" });
    const body = await req.json();
    const action = body.action;

    switch (action) {
      case "dre":
        return await gerarDre(body);
      case "fluxo_caixa":
        return await gerarFluxoCaixa(body);
      default:
        return json({ error: `Action desconhecida: ${action}` }, 400);
    }
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[financeiro-relatorios]", err);
    return json({ error: err.message || "Erro interno" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ═══════════════════════════════════════════════════════════
// DRE - Demonstrativo de Resultado do Exercício
// Fonte: lancamentos_financeiros com status BAIXADO
// ═══════════════════════════════════════════════════════════

interface DreParams {
  cod_empresa?: number | null;
  data_inicio: string;
  data_fim: string;
}

async function gerarDre(body: DreParams) {
  const { cod_empresa, data_inicio, data_fim } = body;
  if (!data_inicio || !data_fim) {
    return json({ error: "data_inicio e data_fim obrigatórios" }, 400);
  }

  // Query BAIXADO entries within the date range
  let query = supabase
    .from("lancamentos_financeiros")
    .select("id, cod_empresa, tipo, categoria, subcategoria, natureza, valor, valor_pago, data_pagamento, data_vencimento, descricao, pessoa_nome")
    .eq("status", "BAIXADO")
    .gte("data_pagamento", data_inicio)
    .lte("data_pagamento", data_fim)
    .order("data_pagamento", { ascending: true });

  if (cod_empresa) {
    query = query.eq("cod_empresa", cod_empresa);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  // Map lancamentos to DRE groups based on tipo + categoria
  const linhas = (data || []).map((l) => {
    const grupo = classificarGrupoDre(l.tipo, l.categoria, l.natureza);
    const competencia = l.data_pagamento
      ? l.data_pagamento.substring(0, 7) // YYYY-MM
      : "SEM_DATA";

    return {
      COMPETENCIA: competencia,
      COD_EMPRESA: l.cod_empresa,
      CONTACLA_CODIGO: l.id,
      CONTACLA_DESCRICAO: l.descricao,
      VALOR_TOTAL: l.valor_pago ?? l.valor,
      GRUPO: grupo,
      SUBGRUPO: l.subcategoria || l.categoria || null,
    };
  });

  return json(linhas);
}

/**
 * Classifica um lançamento em grupo DRE baseado no tipo e categoria.
 * 
 * Convenção:
 * - RECEBER → RECEITA_BRUTA (default) ou OUTRAS_RECEITAS
 * - PAGAR → CUSTO_MERCADORIA, DESPESAS_OPERACIONAIS, DEDUCOES, ou OUTRAS_DESPESAS
 * - Categorias especiais mapeiam para grupos específicos
 */
function classificarGrupoDre(tipo: string, categoria: string | null, natureza: string | null): string {
  const cat = (categoria || "").toUpperCase();
  const nat = (natureza || "").toUpperCase();

  // Taxa de adquirente → Deduções
  if (cat === "TAXA_ADQUIRENTE" || cat === "TAXA") return "DEDUCOES";

  // Impostos → Deduções
  if (cat === "IMPOSTO" || cat === "TRIBUTO" || cat.includes("IMPOSTO")) return "DEDUCOES";

  // CMV / Custo de mercadoria
  if (cat === "CMV" || cat === "CUSTO_MERCADORIA" || cat === "FORNECEDOR" || cat.includes("CUSTO")) return "CUSTO_MERCADORIA";

  // Receita
  if (tipo === "RECEBER") {
    if (cat === "OUTRAS_RECEITAS" || cat === "FINANCEIRA" || nat === "FINANCEIRA") return "OUTRAS_RECEITAS";
    return "RECEITA_BRUTA";
  }

  // Despesas
  if (tipo === "PAGAR") {
    if (cat === "OUTRAS_DESPESAS" || cat === "FINANCEIRA" || nat === "FINANCEIRA") return "OUTRAS_DESPESAS";
    return "DESPESAS_OPERACIONAIS";
  }

  return "OUTRAS_DESPESAS";
}

// ═══════════════════════════════════════════════════════════
// FLUXO DE CAIXA
// Fonte: lancamentos_financeiros (BAIXADO = realizado, PREVISTO/AUTORIZADO = projetado)
// ═══════════════════════════════════════════════════════════

interface FluxoParams {
  cod_empresa?: number | null;
  data_inicio: string;
  data_fim: string;
  apenas_baixado?: boolean; // true = só realizado, false = inclui projetado
}

async function gerarFluxoCaixa(body: FluxoParams) {
  const { cod_empresa, data_inicio, data_fim, apenas_baixado } = body;
  if (!data_inicio || !data_fim) {
    return json({ error: "data_inicio e data_fim obrigatórios" }, 400);
  }

  let query = supabase
    .from("lancamentos_financeiros")
    .select("id, cod_empresa, tipo, valor, valor_pago, data_vencimento, data_pagamento, status, descricao, pessoa_nome, categoria, forma_pagamento")
    .gte("data_vencimento", data_inicio)
    .lte("data_vencimento", data_fim)
    .not("status", "eq", "CANCELADO")
    .order("data_vencimento", { ascending: true });

  if (cod_empresa) {
    query = query.eq("cod_empresa", cod_empresa);
  }

  if (apenas_baixado) {
    query = query.eq("status", "BAIXADO");
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  // Map to a fluxo-friendly format
  const linhas = (data || []).map((l) => ({
    id: l.id,
    cod_empresa: l.cod_empresa,
    tipo: l.tipo, // RECEBER or PAGAR
    valor: l.status === "BAIXADO" ? (l.valor_pago ?? l.valor) : l.valor,
    data_referencia: l.status === "BAIXADO" ? (l.data_pagamento ?? l.data_vencimento) : l.data_vencimento,
    status: l.status,
    descricao: l.descricao,
    pessoa_nome: l.pessoa_nome,
    categoria: l.categoria,
    forma_pagamento: l.forma_pagamento,
    realizado: l.status === "BAIXADO",
  }));

  return json(linhas);
}
