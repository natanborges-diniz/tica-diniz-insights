// src/services/vendasService.ts
// Service para endpoints de vendas

import { apiGet, EmpresaParam, formatEmpresaParam } from './firebirdBridge';

// ============================================
// INTERFACES - RESUMO EMPRESA/VENDEDOR
// ============================================

// Interface RAW - campos UPPERCASE como vêm da API
interface ResumoEmpresaVendedorRaw {
  EMPRESA: string;
  EMPRESA_COD_LOGICO: number;
  EMPRESA_NOME_LOGICO: string;
  VENDEDOR: string;
  QTD_TRANSACAO: number;
  QTD_PRODUTOS: number;
  TOTAL_BRUTO: number;
  TOTAL_VENDIDO: number;
  TOTAL_DESCONTO: number;
  PERC_DESCONTO: number;
  TOTAL_CREDITOS: number;
  TOTAL_VENDIDO_SEM_CREDITOS: number;
}

// Interface normalizada para o frontend (camelCase)
export interface ResumoEmpresaVendedor {
  empresa: string;
  empresaCodLogico: number;
  empresaNomeLogico: string;
  vendedor: string;
  qtdTransacao: number;
  qtdProdutos: number;
  totalBruto: number;
  totalVendido: number;
  totalDesconto: number;
  percentualDesconto: number;
  totalCreditos: number;
  totalVendidoSemCreditos: number;
  // Calculado no frontend
  ticketMedio: number;
}

export interface GetResumoEmpresaVendedorParams {
  empresa: EmpresaParam;
  dataInicio: string;
  dataFim: string;
}

export async function getResumoEmpresaVendedor(
  params: GetResumoEmpresaVendedorParams
): Promise<ResumoEmpresaVendedor[]> {
  const raw = await apiGet<ResumoEmpresaVendedorRaw>('/vendas/resumo-empresa-vendedor', {
    empresa: formatEmpresaParam(params.empresa),
    dataInicio: params.dataInicio,
    dataFim: params.dataFim,
  });

  console.log('[vendasService] Raw data count:', raw.length);
  console.log('[vendasService] Raw data sample:', raw[0]);

  // Mapear campos UPPERCASE da API para camelCase
  const mapped = raw.map((r) => {
    const totalVendidoSemCreditos = r.TOTAL_VENDIDO_SEM_CREDITOS ?? 0;
    const qtdTransacao = r.QTD_TRANSACAO ?? 0;

    return {
      empresa: (r.EMPRESA ?? '').trim(),
      empresaCodLogico: r.EMPRESA_COD_LOGICO ?? 0,
      empresaNomeLogico: (r.EMPRESA_NOME_LOGICO ?? r.EMPRESA ?? '').trim(),
      vendedor: (r.VENDEDOR ?? '').trim(),
      qtdTransacao,
      qtdProdutos: r.QTD_PRODUTOS ?? 0,
      // Valores do backend - NÃO recalcular
      totalBruto: r.TOTAL_BRUTO ?? 0,
      totalVendido: r.TOTAL_VENDIDO ?? 0,
      totalDesconto: r.TOTAL_DESCONTO ?? 0,
      percentualDesconto: r.PERC_DESCONTO ?? 0,
      totalCreditos: r.TOTAL_CREDITOS ?? 0,
      totalVendidoSemCreditos,
      // Ticket médio calculado usando vendas sem créditos
      ticketMedio: qtdTransacao > 0 ? totalVendidoSemCreditos / qtdTransacao : 0,
    };
  });

  return mapped;
}

// ============================================
// INTERFACES - FORMAS DE PAGAMENTO
// ============================================

interface ResumoFormaPagamentoRaw {
  empresa: string;
  empresa_cod_logico: number;
  empresa_nome_logico: string;
  vendedor: string;
  formapagamento: string;
  totalgeral: number;
  qtd_vendas: number;
}

export interface ResumoFormaPagamento {
  codEmpresa: number;
  empresa: string;
  vendedor: string;
  formaPagamento: string;
  totalGeral: number;
  qtdVendas: number;
}

export interface GetResumoFormasPagamentoParams {
  empresa: EmpresaParam;
  dataInicio: string;
  dataFim: string;
}

export async function getResumoFormasPagamento(
  params: GetResumoFormasPagamentoParams
): Promise<ResumoFormaPagamento[]> {
  const raw = await apiGet<ResumoFormaPagamentoRaw>('/vendas/resumo-formas-pagamento', {
    empresa: formatEmpresaParam(params.empresa),
    dataInicio: params.dataInicio,
    dataFim: params.dataFim,
  });

  return raw.map((r) => ({
    codEmpresa: r.empresa_cod_logico ?? 0,
    empresa: r.empresa ?? '',
    vendedor: (r.vendedor ?? '').trim(),
    formaPagamento: r.formapagamento ?? '',
    totalGeral: r.totalgeral ?? 0,
    qtdVendas: r.qtd_vendas ?? 0,
  }));
}

// ============================================
// INTERFACES - ANÁLISE FAMÍLIA/VENDEDOR
// ============================================

interface AnaliseFamiliaVendedorRaw {
  cod_empresa: number;
  empresa: string;
  empresa_cod_logico: number;
  empresa_nome_logico: string;
  cod_vendedor: number;
  vendedor: string;
  familia: string;
  qtd_transacao: number;
  qtd_produtos: number;
  total_vendido: number;
}

export interface AnaliseFamiliaVendedor {
  codEmpresa: number;
  empresa: string;
  codVendedor: number;
  vendedor: string;
  familia: string;
  qtdTransacao: number;
  qtdProdutos: number;
  totalVendido: number;
}

export interface GetAnaliseFamiliaVendedorParams {
  empresa: EmpresaParam;
  dataInicio: string;
  dataFim: string;
  codEmpresaEstoque?: number;
}

export async function getAnaliseFamiliaVendedor(
  params: GetAnaliseFamiliaVendedorParams
): Promise<AnaliseFamiliaVendedor[]> {
  const raw = await apiGet<AnaliseFamiliaVendedorRaw>('/vendas/analise-familia-vendedor', {
    empresa: formatEmpresaParam(params.empresa),
    dataInicio: params.dataInicio,
    dataFim: params.dataFim,
    codEmpresaEstoque: params.codEmpresaEstoque,
  });

  return raw.map((r) => ({
    codEmpresa: r.empresa_cod_logico ?? r.cod_empresa ?? 0,
    empresa: r.empresa ?? '',
    codVendedor: r.cod_vendedor ?? 0,
    vendedor: (r.vendedor ?? '').trim(),
    familia: r.familia ?? '',
    qtdTransacao: r.qtd_transacao ?? 0,
    qtdProdutos: r.qtd_produtos ?? 0,
    totalVendido: r.total_vendido ?? 0,
  }));
}
