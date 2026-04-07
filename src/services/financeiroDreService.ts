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
  REALIZADO?: boolean;
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
  realizado: boolean;
}

export interface GetDreParams {
  empresa: number | string | null;
  dataInicio: string;
  dataFim: string;
  modo?: "realizado" | "projetado";
}

// ============================================
// SINAL DINÂMICO DO BANCO
// ============================================

let sinaisCache: Map<string, string> | null = null;
let sinaisCacheTs = 0;

async function getSinaisMap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (sinaisCache && now - sinaisCacheTs < 5 * 60_000) return sinaisCache;

  const { data } = await supabase
    .from("dre_plano_contas")
    .select("grupo_dre, sinal")
    .eq("ativo", true);

  const map = new Map<string, string>();
  if (data) {
    for (const row of data) {
      if (!map.has(row.grupo_dre)) {
        map.set(row.grupo_dre, row.sinal);
      }
    }
  }

  sinaisCache = map;
  sinaisCacheTs = now;
  return map;
}

function normalizarSinalDre(valor: number, grupo: string, sinais: Map<string, string>): number {
  const sinal = sinais.get(grupo);
  if (sinal === '-') return valor > 0 ? -valor : valor;
  if (sinal === '+') return valor < 0 ? -valor : valor;
  return valor;
}

function mapDreLinhaRaw(r: DreLinhaRaw, sinais: Map<string, string>): DreLinha {
  const grupo = r.GRUPO ?? '';
  const valorBruto = r.VALOR_TOTAL ?? 0;
  return {
    competencia: r.COMPETENCIA ?? '',
    codEmpresa: r.COD_EMPRESA ?? 0,
    empresaNome: '',
    contaclaCodigo: r.CONTACLA_CODIGO ?? null,
    contaclaNumero: null,
    contaclaDescricao: r.CONTACLA_DESCRICAO ?? null,
    valorTotal: normalizarSinalDre(valorBruto, grupo, sinais),
    grupo,
    subgrupo: r.SUBGRUPO ?? null,
    realizado: r.REALIZADO ?? true,
  };
}

export async function getFinanceiroDre(params: GetDreParams): Promise<DreLinha[]> {
  const codEmpresa = params.empresa === 'ALL' || params.empresa === '' ? null : params.empresa ? Number(params.empresa) : null;

  const [{ data, error }, sinais] = await Promise.all([
    supabase.functions.invoke('financeiro-relatorios', {
      body: {
        action: 'dre',
        cod_empresa: codEmpresa,
        data_inicio: params.dataInicio,
        data_fim: params.dataFim,
        modo: params.modo || 'realizado',
      },
    }),
    getSinaisMap(),
  ]);

  if (error) throw new Error(error.message || 'Erro ao buscar DRE');

  const raw = Array.isArray(data) ? data : [];
  return raw.map(r => mapDreLinhaRaw(r, sinais));
}

// ============================================
// GRUPOS PADRÃO DO DRE
// ============================================

export const GRUPOS_DRE = {
  RECEITA_BRUTA: 'RECEITA_BRUTA',
  DEDUCOES: 'DEDUCOES',
  CUSTO_MERCADORIA: 'CUSTO_MERCADORIA',
  DESPESAS_OPERACIONAIS: 'DESPESAS_OPERACIONAIS',
  RESULTADO_FINANCEIRO: 'RESULTADO_FINANCEIRO',
  OUTRAS_RECEITAS_DESPESAS: 'OUTRAS_RECEITAS_DESPESAS',
  OUTRAS_RECEITAS: 'OUTRAS_RECEITAS',
  OUTRAS_DESPESAS: 'OUTRAS_DESPESAS',
  INVESTIMENTOS: 'INVESTIMENTOS',
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
  resultadoFinanceiro: number;
  outrasReceitasDespesas: number;
  resultadoLiquido: number;
}

export function calcularResumoDre(linhas: DreLinha[]): DreResumo {
  let receitaBruta = 0;
  let deducoes = 0;
  let custoMercadoria = 0;
  let despesasOperacionais = 0;
  let resultadoFinanceiro = 0;
  let outrasReceitasDespesas = 0;

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
      case GRUPOS_DRE.RESULTADO_FINANCEIRO:
        resultadoFinanceiro += valor;
        break;
      case GRUPOS_DRE.OUTRAS_RECEITAS_DESPESAS:
      case GRUPOS_DRE.OUTRAS_RECEITAS:
      case GRUPOS_DRE.OUTRAS_DESPESAS:
        outrasReceitasDespesas += valor;
        break;
    }
  }

  const receitaLiquida = receitaBruta + deducoes;
  const lucroBruto = receitaLiquida + custoMercadoria;
  const resultadoLiquido = lucroBruto + despesasOperacionais + resultadoFinanceiro + outrasReceitasDespesas;

  return {
    receitaBruta,
    deducoes,
    receitaLiquida,
    custoMercadoria,
    lucroBruto,
    despesasOperacionais,
    resultadoFinanceiro,
    outrasReceitasDespesas,
    resultadoLiquido,
  };
}
