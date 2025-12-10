// src/services/financeiroDreService.ts

const FIREBIRD_BRIDGE_BASE_URL =
  import.meta.env.VITE_FIREBIRD_BRIDGE_BASE_URL ||
  'https://firebird-bridge-production.up.railway.app';

// Interface para linha retornada pelo novo backend
export interface DreLinha {
  grupo: string;
  subgrupo: string | null;
  competencia: string;
  valor: number;
  // Campos adicionais do novo backend (se existirem)
  contaclaCodigo?: number | null;
  contaclaNumero?: string | null;
  contaclaDescricao?: string | null;
  valorTotal?: number;
}

// Interface para resposta legada
interface DreResponseLegacy {
  ok: boolean;
  empresa?: number;
  dataIni?: string;
  dataFim?: string;
  modo?: string;
  linhas?: DreLinha[];
}

// Interface para novo envelope de resposta
interface ApiEnvelopeResponse<T> {
  ok: boolean;
  data: T[] | null;
  error?: {
    code?: string;
    message?: string;
    details?: string;
  } | null;
}

// Interface para linha bruta do novo backend
interface ApiDreRow {
  COMPETENCIA?: string;
  GRUPO?: string;
  SUBGRUPO?: string | null;
  VALOR?: number;
  VALOR_TOTAL?: number;
  CONTACLA_CODIGO?: number | null;
  CONTACLA_NUMERO?: string | null;
  CONTACLA_DESCRICAO?: string | null;
  // campos em lowercase (caso backend normalize)
  competencia?: string;
  grupo?: string;
  subgrupo?: string | null;
  valor?: number;
  valor_total?: number;
  contacla_codigo?: number | null;
  contacla_numero?: string | null;
  contacla_descricao?: string | null;
}

export interface GetDreParams {
  dataIni: string;
  dataFim: string;
  empresa: number | string;
}

function mapApiRowToDreLinha(row: ApiDreRow): DreLinha {
  return {
    grupo: row.GRUPO || row.grupo || "",
    subgrupo: row.SUBGRUPO ?? row.subgrupo ?? null,
    competencia: row.COMPETENCIA || row.competencia || "",
    valor: row.VALOR ?? row.valor ?? row.VALOR_TOTAL ?? row.valor_total ?? 0,
    contaclaCodigo: row.CONTACLA_CODIGO ?? row.contacla_codigo ?? null,
    contaclaNumero: row.CONTACLA_NUMERO ?? row.contacla_numero ?? null,
    contaclaDescricao: row.CONTACLA_DESCRICAO ?? row.contacla_descricao ?? null,
    valorTotal: row.VALOR_TOTAL ?? row.valor_total ?? row.VALOR ?? row.valor ?? 0,
  };
}

export async function getFinanceiroDre(params: GetDreParams): Promise<DreLinha[]> {
  const queryParams = new URLSearchParams();
  
  // Novo backend usa dataInicio/dataFim
  queryParams.append("dataInicio", params.dataIni);
  queryParams.append("dataFim", params.dataFim);
  queryParams.append("empresa", String(params.empresa));

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

  const result = await response.json();

  // Novo formato: { ok, data, error }
  if ('data' in result) {
    const envelope = result as ApiEnvelopeResponse<ApiDreRow>;
    if (!envelope.ok || envelope.error) {
      const errorMsg = envelope.error?.message || "Resposta inválida da API de DRE";
      throw new Error(errorMsg);
    }
    return (envelope.data || []).map(mapApiRowToDreLinha);
  }

  // Formato legado: { ok, linhas }
  const legacyResult = result as DreResponseLegacy;
  if (!legacyResult.ok) {
    throw new Error("Resposta inválida da API de DRE");
  }
  return legacyResult.linhas || [];
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
