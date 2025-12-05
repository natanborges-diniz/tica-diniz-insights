// src/services/financeiroService.ts

const FIREBIRD_BRIDGE_BASE_URL =
  import.meta.env.VITE_FIREBIRD_BRIDGE_BASE_URL ||
  'https://firebird-bridge-production.up.railway.app';

export interface FinanceiroParcela {
  codEmpresa: number;
  empresaNome: string;
  codLancamento: number;
  tipoLancamento: "PAGAR" | "RECEBER";
  isPrevisao: boolean;
  documento: string;
  codPessoa: number;
  pessoaNome: string;
  parcelaId: number;
  dataEmissao: Date | null;
  dataVencimento: Date;
  dataPagamento: Date | null;
  dataRecebimento: Date | null;
  valor: number;
  valorOriginal: number;
  valorPago: number;
  situacao: "PAGA" | "EM ABERTO" | "EM ATRASO";
  contaCodigo: number | null;
  contaNumero: string | null;
  contaDescricao: string | null;
  formaPagamentoCodigo: number | null;
  formaPagamentoTipoCodigo: number | null;
  formaPagamentoTipo: string | null;
}

interface ApiParcelaRow {
  COD_EMPRESA: number;
  EMPRESA_NOME: string;
  COD_LANCAMENTO: number;
  LANCAMENTO_PAGAR: "T" | "F";
  LANCAMENTO_PREVISAO: "T" | "F";
  LANCAMENTO_DOCUMENTO: string;
  PESSOA_COD_PESSOA: number;
  PESSOA_NOME: string;
  PARCELA_ID: number;
  PARCELA_DATA_EMISSAO: string | null;
  PARCELA_DATA_VENCIMENTO: string;
  PARCELA_DATA_PAGAMENTO: string | null;
  PARCELA_DATA_RECEBIMENTO: string | null;
  PARCELA_VALOR: number;
  PARCELA_VALOR_ORIGINAL: number;
  PARCELA_VALOR_PAGO: number;
  PARCELA_SITUACAO: "PAGA" | "EM ABERTO" | "EM ATRASO";
  CONTACLA_CODIGO: number | null;
  CONTACLA_NUMERO: string | null;
  CONTACLA_DESCRICAO: string | null;
  FORMAPAGTO_CODIGO: number | null;
  FORMAPAGTO_TIPO_CODIGO: number | null;
  FORMAPAGTO_TIPO_NOME: string | null;
}

interface ApiResponse {
  ok: boolean;
  count: number;
  rows: ApiParcelaRow[];
}

function parseDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function mapRowToParcela(row: ApiParcelaRow): FinanceiroParcela {
  return {
    codEmpresa: row.COD_EMPRESA,
    empresaNome: row.EMPRESA_NOME,
    codLancamento: row.COD_LANCAMENTO,
    tipoLancamento: row.LANCAMENTO_PAGAR === "T" ? "PAGAR" : "RECEBER",
    isPrevisao: row.LANCAMENTO_PREVISAO === "T",
    documento: row.LANCAMENTO_DOCUMENTO || "",
    codPessoa: row.PESSOA_COD_PESSOA,
    pessoaNome: row.PESSOA_NOME || "",
    parcelaId: row.PARCELA_ID,
    dataEmissao: parseDate(row.PARCELA_DATA_EMISSAO),
    dataVencimento: parseDate(row.PARCELA_DATA_VENCIMENTO) || new Date(),
    dataPagamento: parseDate(row.PARCELA_DATA_PAGAMENTO),
    dataRecebimento: parseDate(row.PARCELA_DATA_RECEBIMENTO),
    valor: row.PARCELA_VALOR || 0,
    valorOriginal: row.PARCELA_VALOR_ORIGINAL || 0,
    valorPago: row.PARCELA_VALOR_PAGO || 0,
    situacao: row.PARCELA_SITUACAO || "EM ABERTO",
    contaCodigo: row.CONTACLA_CODIGO,
    contaNumero: row.CONTACLA_NUMERO,
    contaDescricao: row.CONTACLA_DESCRICAO,
    formaPagamentoCodigo: row.FORMAPAGTO_CODIGO,
    formaPagamentoTipoCodigo: row.FORMAPAGTO_TIPO_CODIGO,
    formaPagamentoTipo: row.FORMAPAGTO_TIPO_NOME,
  };
}

export type TipoFilterParam = "TODOS" | "PAGAR" | "RECEBER";
export type SituacaoFilterParam = "TODOS" | "EM ABERTO" | "EM ATRASO" | "PAGA";
export type CampoDataParam = "EMISSAO" | "VENCIMENTO" | "PAGAMENTO";

export interface GetFinanceiroParcelasParams {
  dataIni: string;
  dataFim: string;
  empresa?: number | string;
  tipo?: TipoFilterParam;
  situacao?: SituacaoFilterParam;
  campoData?: CampoDataParam;
}

export async function getFinanceiroParcelas(
  params: GetFinanceiroParcelasParams
): Promise<FinanceiroParcela[]> {
  const queryParams = new URLSearchParams({
    dataIni: params.dataIni,
    dataFim: params.dataFim,
  });

  if (params.empresa !== undefined && params.empresa !== null && params.empresa !== "") {
    queryParams.append("empresa", String(params.empresa));
  }
  if (params.tipo && params.tipo !== "TODOS") {
    queryParams.append("tipo", params.tipo);
  }
  if (params.situacao && params.situacao !== "TODOS") {
    queryParams.append("situacao", params.situacao);
  }
  if (params.campoData) {
    queryParams.append("campoData", params.campoData);
  }

  const url = `${FIREBIRD_BRIDGE_BASE_URL}/api/v1/financeiro/parcelas?${queryParams.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Erro ao buscar parcelas financeiras: ${response.status} ${response.statusText}`);
  }

  const result: ApiResponse = await response.json();

  if (!result.ok) {
    throw new Error("Resposta inválida da API de parcelas financeiras");
  }

  return (result.rows || []).map(mapRowToParcela);
}

export { FIREBIRD_BRIDGE_BASE_URL };
