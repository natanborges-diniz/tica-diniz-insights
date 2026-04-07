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
// Fonte: lancamentos_financeiros
// modo=realizado → apenas BAIXADO (default)
// modo=projetado → BAIXADO + CLASSIFICADO/BORDERO/AUTORIZADO/PROCESSANDO
// ═══════════════════════════════════════════════════════════

interface DreParams {
  cod_empresa?: number | null;
  data_inicio: string;
  data_fim: string;
  modo?: "realizado" | "projetado";
}

async function gerarDre(body: DreParams) {
  const { cod_empresa, data_inicio, data_fim, modo = "realizado" } = body;
  if (!data_inicio || !data_fim) {
    return json({ error: "data_inicio e data_fim obrigatórios" }, 400);
  }

  const statusList = modo === "projetado"
    ? ["BAIXADO", "CLASSIFICADO", "BORDERO", "AUTORIZADO", "PROCESSANDO"]
    : ["BAIXADO"];

  let query = supabase
    .from("lancamentos_financeiros")
    .select("id, cod_empresa, tipo, categoria, subcategoria, natureza, valor, valor_pago, data_pagamento, data_vencimento, data_emissao, descricao, pessoa_nome, status")
    .in("status", statusList)
    .gte("data_emissao", data_inicio)
    .lte("data_emissao", data_fim)
    .order("data_emissao", { ascending: true });

  if (cod_empresa) {
    query = query.eq("cod_empresa", cod_empresa);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const linhas = (data || []).map((l) => {
    const grupo = classificarGrupoDre(l.tipo, l.categoria, l.natureza);
    const competencia = l.data_emissao
      ? l.data_emissao.substring(0, 7)
      : l.data_pagamento
        ? l.data_pagamento.substring(0, 7)
        : "SEM_DATA";

    const isBaixado = l.status === "BAIXADO";

    return {
      COMPETENCIA: competencia,
      COD_EMPRESA: l.cod_empresa,
      CONTACLA_CODIGO: l.id,
      CONTACLA_DESCRICAO: l.descricao,
      VALOR_TOTAL: isBaixado ? (l.valor_pago ?? l.valor) : l.valor,
      GRUPO: grupo,
      SUBGRUPO: l.subcategoria || l.categoria || null,
      REALIZADO: isBaixado,
    };
  });

  return json(linhas);
}

/**
 * Classifica um lançamento em grupo DRE baseado no tipo e categoria.
 */
function classificarGrupoDre(tipo: string, categoria: string | null, natureza: string | null): string {
  const nat = (natureza || "").toUpperCase();
  const cat = (categoria || "").toUpperCase();

  if (nat === "RECEITA_BRUTA") return "RECEITA_BRUTA";
  if (nat === "DEDUCOES") return "DEDUCOES";
  if (nat === "CUSTO_MERCADORIA") return "CUSTO_MERCADORIA";
  if (nat === "DESPESAS_OPERACIONAIS") return "DESPESAS_OPERACIONAIS";
  if (nat === "OUTRAS_DESPESAS") return "OUTRAS_DESPESAS";
  if (nat === "INVESTIMENTOS") return "INVESTIMENTOS";

  if (cat === "TAXA_ADQUIRENTE" || cat === "TAXA" || cat === "TAXAS") return "DEDUCOES";
  if (cat === "IMPOSTO" || cat === "IMPOSTOS" || cat === "TRIBUTO" || cat.includes("IMPOSTO")) return "DEDUCOES";
  if (cat === "COMISSOES") return "DEDUCOES";
  if (cat === "CMV" || cat === "FORNECEDORES_PRODUTO" || cat.includes("CUSTO")) return "CUSTO_MERCADORIA";

  const opCategories = ["PESSOAL", "OCUPACAO", "COMUNICACAO", "MARKETING", "ADMINISTRATIVO",
    "SERVICOS", "MANUTENCAO", "FINANCEIRO_OPERACIONAL", "SEGURANCA", "DEVOLUCOES"];
  if (opCategories.includes(cat)) return "DESPESAS_OPERACIONAIS";

  if (cat === "FINANCEIRO" || cat === "PRO_LABORE") return "OUTRAS_DESPESAS";
  if (cat === "INVESTIMENTOS") return "INVESTIMENTOS";

  if (tipo === "RECEBER") {
    if (cat === "OUTRAS_RECEITAS" || cat === "FINANCEIRA") return "OUTRAS_RECEITAS";
    return "RECEITA_BRUTA";
  }

  if (tipo === "PAGAR") {
    if (cat === "OUTRAS_DESPESAS" || cat === "FINANCEIRA") return "OUTRAS_DESPESAS";
    return "DESPESAS_OPERACIONAIS";
  }

  return "OUTRAS_DESPESAS";
}

// ═══════════════════════════════════════════════════════════
// FLUXO DE CAIXA
// ═══════════════════════════════════════════════════════════

interface FluxoParams {
  cod_empresa?: number | null;
  data_inicio: string;
  data_fim: string;
  apenas_baixado?: boolean;
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

  const linhas = (data || []).map((l) => ({
    id: l.id,
    cod_empresa: l.cod_empresa,
    tipo: l.tipo,
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
