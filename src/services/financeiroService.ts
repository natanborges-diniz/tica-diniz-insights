// src/services/financeiroService.ts

import { apiGet } from './firebirdBridge';

// ============================================
// INTERFACES - PARCELAS FINANCEIRAS
// ============================================

// Interface raw da API (snake_case minúsculo)
interface FinanceiroParcelaRaw {
  cod_empresa: number;
  empresa_nome: string;
  lancamento_pagar?: string;
  lancamento_documento?: string;
  pessoa_nome?: string;
  parcela_data_vencimento?: string;
  parcela_data_emissao?: string;
  parcela_data_pagamento?: string;
  parcela_valor?: number;
  parcela_valor_pago?: number;
  parcela_situacao?: string;
  contacla_numero?: string;
  contacla_descricao?: string;
  formapagto_tipo_nome?: string;
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
  empresa: number | string | null;
  tipo?: TipoFilterParam;
  situacao?: SituacaoFilterParam;
  campoData?: CampoDataParam;
}

function mapParcelaRaw(r: FinanceiroParcelaRaw): FinanceiroParcela {
  // Determinar tipo de lançamento a partir de lancamento_pagar
  // 'T' = PAGAR (true), 'F' = RECEBER (false)
  const lancamentoPagar = r.lancamento_pagar?.trim();
  const tipoLancamento = lancamentoPagar === 'T' ? 'PAGAR' : 'RECEBER';
  
  // Normalizar situação (remover espaços extras)
  const situacaoRaw = r.parcela_situacao?.trim() || 'EM ABERTO';
  
  return {
    codEmpresa: r.cod_empresa ?? 0,
    empresaNome: r.empresa_nome ?? '',
    tipoLancamento,
    documento: r.lancamento_documento ?? '',
    pessoaNome: r.pessoa_nome ?? '',
    dataVencimento: r.parcela_data_vencimento ?? null,
    dataEmissao: r.parcela_data_emissao ?? null,
    dataPagamento: r.parcela_data_pagamento ?? null,
    valor: r.parcela_valor ?? 0,
    valorPago: r.parcela_valor_pago ?? 0,
    situacao: situacaoRaw,
    contaNumero: r.contacla_numero ?? null,
    contaDescricao: r.contacla_descricao ?? null,
    formaPagamentoTipo: r.formapagto_tipo_nome?.trim() ?? null,
  };
}

export async function getFinanceiroParcelas(
  params: GetFinanceiroParcelasParams
): Promise<FinanceiroParcela[]> {
  // Montar parâmetros da query
  const queryParams: Record<string, string | number | undefined> = {
    dataInicio: params.dataIni,
    dataFim: params.dataFim,
    campoData: params.campoData,
  };
  
  // Passar empresa apenas se não for null (backend aceita null = todas)
  if (params.empresa !== null && params.empresa !== undefined) {
    queryParams.empresa = params.empresa;
  }
  
  // Filtros opcionais
  if (params.tipo && params.tipo !== 'TODOS') {
    queryParams.tipo = params.tipo;
  }
  if (params.situacao && params.situacao !== 'TODOS') {
    queryParams.situacao = params.situacao;
  }
  
  const raw = await apiGet<FinanceiroParcelaRaw>('/financeiro/parcelas', queryParams);
  
  return raw.map(mapParcelaRaw);
}
