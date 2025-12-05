// src/services/financeiroDreService.ts

const FIREBIRD_BRIDGE_BASE_URL =
  import.meta.env.VITE_FIREBIRD_BRIDGE_BASE_URL ||
  'https://firebird-bridge-production.up.railway.app';

export interface DreLinha {
  grupo: string;
  subgrupo: string | null;
  competencia: string;
  valor: number;
}

export interface DreResponse {
  ok: boolean;
  empresa: number;
  dataIni: string;
  dataFim: string;
  modo: string;
  linhas: DreLinha[];
}

export interface GetDreParams {
  dataIni: string;
  dataFim: string;
  empresa: number | string;
}

export async function getFinanceiroDre(params: GetDreParams): Promise<DreLinha[]> {
  const queryParams = new URLSearchParams({
    dataIni: params.dataIni,
    dataFim: params.dataFim,
    empresa: String(params.empresa),
  });

  const url = `${FIREBIRD_BRIDGE_BASE_URL}/api/v1/financeiro/dre?${queryParams.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Erro ao buscar DRE: ${response.status} ${response.statusText}`);
  }

  const result: DreResponse = await response.json();

  if (!result.ok) {
    throw new Error("Resposta inválida da API de DRE");
  }

  return result.linhas || [];
}

// Grupos padrão do DRE para cálculos
export const GRUPOS_DRE = {
  RECEITA_BRUTA: "RECEITA_BRUTA",
  DEDUCOES: "DEDUCOES",
  CUSTO_MERCADORIA: "CUSTO_MERCADORIA",
  DESPESAS_OPERACIONAIS: "DESPESAS_OPERACIONAIS",
  OUTRAS_RECEITAS: "OUTRAS_RECEITAS",
  OUTRAS_DESPESAS: "OUTRAS_DESPESAS",
} as const;

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
    switch (linha.grupo) {
      case GRUPOS_DRE.RECEITA_BRUTA:
        receitaBruta += linha.valor;
        break;
      case GRUPOS_DRE.DEDUCOES:
        deducoes += linha.valor;
        break;
      case GRUPOS_DRE.CUSTO_MERCADORIA:
        custoMercadoria += linha.valor;
        break;
      case GRUPOS_DRE.DESPESAS_OPERACIONAIS:
        despesasOperacionais += linha.valor;
        break;
      case GRUPOS_DRE.OUTRAS_RECEITAS:
        outrasReceitas += linha.valor;
        break;
      case GRUPOS_DRE.OUTRAS_DESPESAS:
        outrasDespesas += linha.valor;
        break;
    }
  }

  const receitaLiquida = receitaBruta + deducoes; // deducoes já vem negativo
  const lucroBruto = receitaLiquida + custoMercadoria; // CMV já vem negativo
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
