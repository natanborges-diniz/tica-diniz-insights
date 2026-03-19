// src/services/financeiroDreService.ts
// Service para DRE derivado do ledger central (lancamentos_financeiros)

import { supabase } from "@/integrations/supabase/client";

// ============================================
// INTERFACES - DRE
// ============================================

interface DreLinhaRaw {
  COMPETENCIA?: string;
  COD_EMPRESA?: number;
  CONTACLA_CODIGO?: string;
  CONTACLA_DESCRICAO?: string;
  VALOR_TOTAL?: number;
  GRUPO?: string;
  SUBGRUPO?: string;
}

export interface DreLinha {
  competencia: string;
  codEmpresa: number;
  empresaNome: string;
  contaclaCodigo: string | null;
  contaclaNumero: string | null;
  contaclaDescricao: string | null;
  valorTotal: number;
  grupo: string;
  subgrupo: string | null;
}

export interface GetDreParams {
  empresa: number | string | null;
  dataInicio: string;
  dataFim: string;
}

// Grupos cuja convenção de sinal deve ser NEGATIVA (saídas)
const GRUPOS_SINAL_NEGATIVO = new Set<string>([
  'DEDUCOES',
  'CUSTO_MERCADORIA',
  'DESPESAS_OPERACIONAIS',
  'OUTRAS_DESPESAS',
]);

/**
 * Normaliza o sinal do valor conforme convenção contábil:
 * - Receitas: sempre positivo
 * - Deduções/Custos/Despesas: sempre negativo
 */
function normalizarSinalDre(valor: number, grupo: string): number {
  if (GRUPOS_SINAL_NEGATIVO.has(grupo)) {
    return valor > 0 ? -valor : valor;
  }
  if (grupo === 'RECEITA_BRUTA' || grupo === 'OUTRAS_RECEITAS') {
    return valor < 0 ? -valor : valor;
  }
  return valor;
}

function mapDreLinhaRaw(r: DreLinhaRaw): DreLinha {
  const grupo = r.GRUPO ?? '';
  const valorBruto = r.VALOR_TOTAL ?? 0;
  return {
    competencia: r.COMPETENCIA ?? '',
    codEmpresa: r.COD_EMPRESA ?? 0,
    empresaNome: '',
    contaclaCodigo: r.CONTACLA_CODIGO ?? null,
    contaclaNumero: null,
    contaclaDescricao: r.CONTACLA_DESCRICAO ?? null,
    valorTotal: normalizarSinalDre(valorBruto, grupo),
    grupo,
    subgrupo: r.SUBGRUPO ?? null,
  };
}

export async function getFinanceiroDre(params: GetDreParams): Promise<DreLinha[]> {
  const codEmpresa = params.empresa === 'ALL' || params.empresa === '' ? null : params.empresa ? Number(params.empresa) : null;

  const { data, error } = await supabase.functions.invoke('financeiro-relatorios', {
    body: {
      action: 'dre',
      cod_empresa: codEmpresa,
      data_inicio: params.dataInicio,
      data_fim: params.dataFim,
    },
  });

  if (error) throw new Error(error.message || 'Erro ao buscar DRE');

  const raw = Array.isArray(data) ? data : [];
  return raw.map(mapDreLinhaRaw);
}

// ============================================
// GRUPOS PADRÃO DO DRE
// ============================================

export const GRUPOS_DRE = {
  RECEITA_BRUTA: 'RECEITA_BRUTA',
  DEDUCOES: 'DEDUCOES',
  CUSTO_MERCADORIA: 'CUSTO_MERCADORIA',
  DESPESAS_OPERACIONAIS: 'DESPESAS_OPERACIONAIS',
  OUTRAS_RECEITAS: 'OUTRAS_RECEITAS',
  OUTRAS_DESPESAS: 'OUTRAS_DESPESAS',
} as const;

// ============================================
// RESUMO DRE
// ============================================

export interface DreResumo {
  receitaBruta: number;
  deducoes: number;
  receitaLiquida: number;
  custoMercadoria: number;
  lucroBruto: number;
  despesasOperacionais: number;
  outrasReceitas: number;
  outrasDespesas: number;
  resultadoLiquido: number;
}

export function calcularResumoDre(linhas: DreLinha[]): DreResumo {
  let receitaBruta = 0;
  let deducoes = 0;
  let custoMercadoria = 0;
  let despesasOperacionais = 0;
  let outrasReceitas = 0;
  let outrasDespesas = 0;

  for (const linha of linhas) {
    const valor = linha.valorTotal;
    switch (linha.grupo) {
      case GRUPOS_DRE.RECEITA_BRUTA:
        receitaBruta += valor;
        break;
      case GRUPOS_DRE.DEDUCOES:
        deducoes += valor;
        break;
      case GRUPOS_DRE.CUSTO_MERCADORIA:
        custoMercadoria += valor;
        break;
      case GRUPOS_DRE.DESPESAS_OPERACIONAIS:
        despesasOperacionais += valor;
        break;
      case GRUPOS_DRE.OUTRAS_RECEITAS:
        outrasReceitas += valor;
        break;
      case GRUPOS_DRE.OUTRAS_DESPESAS:
        outrasDespesas += valor;
        break;
    }
  }

  const receitaLiquida = receitaBruta + deducoes;
  const lucroBruto = receitaLiquida + custoMercadoria;
  const resultadoLiquido = lucroBruto + despesasOperacionais + outrasReceitas + outrasDespesas;

  return {
    receitaBruta,
    deducoes,
    receitaLiquida,
    custoMercadoria,
    lucroBruto,
    despesasOperacionais,
    outrasReceitas,
    outrasDespesas,
    resultadoLiquido,
  };
}
