// src/services/financeiroService.ts

import { apiGet } from './firebirdBridge';

// ============================================
// INTERFACES - PARCELAS FINANCEIRAS
// ============================================

interface FinanceiroParcelaRaw {
  COD_EMPRESA: number;
  EMPRESA_NOME: string;
  TIPO_LANCAMENTO?: string;
  LANCAMENTO_PAGAR?: 'T' | 'F';
  DOCUMENTO?: string;
  LANCAMENTO_DOCUMENTO?: string;
  PESSOA_NOME?: string;
  DATA_VENCIMENTO?: string;
  PARCELA_DATA_VENCIMENTO?: string;
  DATA_EMISSAO?: string;
  PARCELA_DATA_EMISSAO?: string;
  DATA_PAGAMENTO?: string;
  PARCELA_DATA_PAGAMENTO?: string;
  VALOR?: number;
  PARCELA_VALOR?: number;
  VALOR_PAGO?: number;
  PARCELA_VALOR_PAGO?: number;
  SITUACAO?: string;
  PARCELA_SITUACAO?: string;
  CONTA_NUMERO?: string;
  CONTACLA_NUMERO?: string;
  CONTA_DESCRICAO?: string;
  CONTACLA_DESCRICAO?: string;
  FORMAPAGTO_TIPO_NOME?: string;
}

export interface FinanceiroParcela {
  codEmpresa: number;
  empresaNome: string;
  tipoLancamento: string;
  documento: string;
  pessoaNome: string;
  dataVencimento: string | null;
  dataEmissao: string | null;
  dataPagamento: string | null;
  valor: number;
  valorPago: number;
  situacao: string;
  contaNumero: string | null;
  contaDescricao: string | null;
  formaPagamentoTipo: string | null;
}

export type TipoFilterParam = 'TODOS' | 'PAGAR' | 'RECEBER';
export type SituacaoFilterParam = 'TODOS' | 'EM ABERTO' | 'EM ATRASO' | 'PAGA';
export type CampoDataParam = 'EMISSAO' | 'VENCIMENTO' | 'PAGAMENTO';

export interface GetFinanceiroParcelasParams {
  dataIni: string;
  dataFim: string;
  empresa: number | string;
  tipo?: TipoFilterParam;
  situacao?: SituacaoFilterParam;
  campoData?: CampoDataParam;
}

function mapParcelaRaw(r: FinanceiroParcelaRaw): FinanceiroParcela {
  // Determinar tipo de lançamento
  let tipoLancamento = r.TIPO_LANCAMENTO ?? '';
  if (!tipoLancamento && r.LANCAMENTO_PAGAR !== undefined) {
    tipoLancamento = r.LANCAMENTO_PAGAR === 'T' ? 'PAGAR' : 'RECEBER';
  }
  
  return {
    codEmpresa: r.COD_EMPRESA ?? 0,
    empresaNome: r.EMPRESA_NOME ?? '',
    tipoLancamento,
    documento: r.DOCUMENTO ?? r.LANCAMENTO_DOCUMENTO ?? '',
    pessoaNome: r.PESSOA_NOME ?? '',
    dataVencimento: r.DATA_VENCIMENTO ?? r.PARCELA_DATA_VENCIMENTO ?? null,
    dataEmissao: r.DATA_EMISSAO ?? r.PARCELA_DATA_EMISSAO ?? null,
    dataPagamento: r.DATA_PAGAMENTO ?? r.PARCELA_DATA_PAGAMENTO ?? null,
    valor: r.VALOR ?? r.PARCELA_VALOR ?? 0,
    valorPago: r.VALOR_PAGO ?? r.PARCELA_VALOR_PAGO ?? 0,
    situacao: r.SITUACAO ?? r.PARCELA_SITUACAO ?? 'EM ABERTO',
    contaNumero: r.CONTA_NUMERO ?? r.CONTACLA_NUMERO ?? null,
    contaDescricao: r.CONTA_DESCRICAO ?? r.CONTACLA_DESCRICAO ?? null,
    formaPagamentoTipo: r.FORMAPAGTO_TIPO_NOME ?? null,
  };
}

export async function getFinanceiroParcelas(
  params: GetFinanceiroParcelasParams
): Promise<FinanceiroParcela[]> {
  const raw = await apiGet<FinanceiroParcelaRaw>('/financeiro/parcelas', {
    dataInicio: params.dataIni,
    dataFim: params.dataFim,
    empresa: params.empresa,
    tipo: params.tipo !== 'TODOS' ? params.tipo : undefined,
    situacao: params.situacao !== 'TODOS' ? params.situacao : undefined,
    campoData: params.campoData,
  });
  
  return raw.map(mapParcelaRaw);
}
