// src/services/financeiroDreService.ts

import { apiGet } from './firebirdBridge';

// ============================================
// INTERFACES - DRE
// ============================================

interface DreLinhaRaw {
  COMPETENCIA?: string;
  COD_EMPRESA?: number;
  EMPRESA_NOME?: string;
  CONTACLA_CODIGO?: string;
  CONTACLA_NUMERO?: string;
  CONTACLA_DESCRICAO?: string;
  VALOR_TOTAL?: number;
  GRUPO?: string;
  SUBGRUPO?: string;
  VALOR?: number;
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
  dataIni: string;
  dataFim: string;
  empresa: number | string;
}

function mapDreLinhaRaw(r: DreLinhaRaw): DreLinha {
  return {
    competencia: r.COMPETENCIA ?? '',
    codEmpresa: r.COD_EMPRESA ?? 0,
    empresaNome: r.EMPRESA_NOME ?? '',
    contaclaCodigo: r.CONTACLA_CODIGO ?? null,
    contaclaNumero: r.CONTACLA_NUMERO ?? null,
    contaclaDescricao: r.CONTACLA_DESCRICAO ?? null,
    valorTotal: r.VALOR_TOTAL ?? r.VALOR ?? 0,
    grupo: r.GRUPO ?? '',
    subgrupo: r.SUBGRUPO ?? null,
  };
}

export async function getFinanceiroDre(params: GetDreParams): Promise<DreLinha[]> {
  const raw = await apiGet<DreLinhaRaw>('/financeiro/dre', {
    dataInicio: params.dataIni,
    dataFim: params.dataFim,
    empresa: params.empresa,
  });
  
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
