// src/services/financeiroService.ts
// Service para endpoints financeiros — agora lê do cache (parcelas_cache)

import { supabase } from "@/integrations/supabase/client";
import { apiGet, EmpresaParam, formatEmpresaParam } from './firebirdBridge';

// ============================================
// INTERFACES - PARCELAS FINANCEIRAS
// ============================================

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
  empresa: EmpresaParam;
  dataInicio: string;
  dataFim: string;
  tipo?: TipoFilterParam;
  situacao?: SituacaoFilterParam;
  campoData?: CampoDataParam;
}

function mapParcelaRaw(r: FinanceiroParcelaRaw): FinanceiroParcela {
  const lancamentoPagar = r.lancamento_pagar?.trim();
  const tipoLancamento = lancamentoPagar === 'T' ? 'PAGAR' : 'RECEBER';
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

// ── Cache-based query (primary) ──
export async function getFinanceiroParcelasFromCache(
  params: GetFinanceiroParcelasParams
): Promise<FinanceiroParcela[]> {
  const campoData = params.campoData || 'VENCIMENTO';
  const dateColumn = campoData === 'EMISSAO' ? 'data_emissao'
    : campoData === 'PAGAMENTO' ? 'data_pagamento'
    : 'data_vencimento';

  let query = supabase
    .from('parcelas_cache')
    .select('*')
    .gte(dateColumn, params.dataInicio)
    .lte(dateColumn, params.dataFim)
    .order(dateColumn, { ascending: true });

  // Filter by empresa
  const emp = params.empresa;
  if (emp && emp !== 'ALL' && emp !== '') {
    query = query.eq('cod_empresa', Number(emp));
  }

  // Filter by tipo
  if (params.tipo && params.tipo !== 'TODOS') {
    query = query.eq('tipo_lancamento', params.tipo);
  }

  // Filter by situacao
  if (params.situacao && params.situacao !== 'TODOS') {
    query = query.eq('situacao', params.situacao);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    codEmpresa: r.cod_empresa ?? 0,
    empresaNome: r.empresa_nome ?? '',
    tipoLancamento: r.tipo_lancamento ?? 'RECEBER',
    documento: r.documento ?? '',
    pessoaNome: r.pessoa_nome ?? '',
    dataVencimento: r.data_vencimento ?? null,
    dataEmissao: r.data_emissao ?? null,
    dataPagamento: r.data_pagamento ?? null,
    valor: Number(r.valor) || 0,
    valorPago: Number(r.valor_pago) || 0,
    situacao: r.situacao ?? 'EM ABERTO',
    contaNumero: r.conta_numero ?? null,
    contaDescricao: r.conta_descricao ?? null,
    formaPagamentoTipo: r.forma_pagamento_tipo ?? null,
  }));
}

// ── Firebird live query (fallback) ──
export async function getFinanceiroParcelas(
  params: GetFinanceiroParcelasParams
): Promise<FinanceiroParcela[]> {
  const queryParams: Record<string, string | number | undefined> = {
    empresa: formatEmpresaParam(params.empresa),
    dataInicio: params.dataInicio,
    dataFim: params.dataFim,
    campoData: params.campoData,
  };

  if (params.tipo && params.tipo !== 'TODOS') {
    queryParams.tipo = params.tipo;
  }
  if (params.situacao && params.situacao !== 'TODOS') {
    queryParams.situacao = params.situacao;
  }

  const raw = await apiGet<FinanceiroParcelaRaw>('/financeiro/parcelas', queryParams);

  return raw.map(mapParcelaRaw);
}
