// src/services/vendasService.ts
// Service para endpoints de vendas

import { apiGet, EmpresaParam, formatEmpresaParam } from './firebirdBridge';

// ============================================
// INTERFACES - RESUMO EMPRESA/VENDEDOR
// ============================================

interface ResumoEmpresaVendedorRaw {
  EMPRESA: string;
  COD_EMPRESA: number;
  VENDEDOR: string;
  COD_VENDEDOR: number;
  TOTALORIGINAL: number;
  TOTALVENDIDO: number;
  TICKETMEDIO: number;
  TOTALDEVOLUCAO: number;
  QTDTRANSACAO: number;
  QTDDEVOLUCAO: number;
}

export interface ResumoEmpresaVendedor {
  codEmpresa: number;
  empresa: string;
  codVendedor: number;
  vendedor: string;
  totalOriginal: number;
  totalVendido: number;
  ticketMedio: number;
  totalDevolucao: number;
  qtdTransacao: number;
  qtdDevolucao: number;
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

  return raw.map((r) => ({
    codEmpresa: r.COD_EMPRESA ?? 0,
    empresa: r.EMPRESA ?? '',
    codVendedor: r.COD_VENDEDOR ?? 0,
    vendedor: r.VENDEDOR ?? '',
    totalOriginal: r.TOTALORIGINAL ?? 0,
    totalVendido: r.TOTALVENDIDO ?? 0,
    ticketMedio: r.TICKETMEDIO ?? 0,
    totalDevolucao: r.TOTALDEVOLUCAO ?? 0,
    qtdTransacao: r.QTDTRANSACAO ?? 0,
    qtdDevolucao: r.QTDDEVOLUCAO ?? 0,
  }));
}

// ============================================
// INTERFACES - FORMAS DE PAGAMENTO
// ============================================

interface ResumoFormaPagamentoRaw {
  COD_EMPRESA: number;
  EMPRESA: string;
  VENDEDOR?: string;
  FORMA_PAGAMENTO?: string;
  FORMAPAGAMENTO?: string;
  TOTAL?: number;
  TOTALGERAL?: number;
  QTD_TRANSACOES?: number;
  QTD_VENDAS?: number;
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
    codEmpresa: r.COD_EMPRESA ?? 0,
    empresa: r.EMPRESA ?? '',
    vendedor: r.VENDEDOR ?? '',
    formaPagamento: r.FORMA_PAGAMENTO ?? r.FORMAPAGAMENTO ?? '',
    totalGeral: r.TOTAL ?? r.TOTALGERAL ?? 0,
    qtdVendas: r.QTD_TRANSACOES ?? r.QTD_VENDAS ?? 0,
  }));
}

// ============================================
// INTERFACES - ANÁLISE FAMÍLIA/VENDEDOR
// ============================================

interface AnaliseFamiliaVendedorRaw {
  COD_EMPRESA: number;
  EMPRESA: string;
  COD_VENDEDOR: number;
  VENDEDOR: string;
  FAMILIA: string;
  QTD_TRANSACAO: number;
  QTD_PRODUTOS: number;
  TOTAL_VENDIDO: number;
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
    codEmpresa: r.COD_EMPRESA ?? 0,
    empresa: r.EMPRESA ?? '',
    codVendedor: r.COD_VENDEDOR ?? 0,
    vendedor: r.VENDEDOR ?? '',
    familia: r.FAMILIA ?? '',
    qtdTransacao: r.QTD_TRANSACAO ?? 0,
    qtdProdutos: r.QTD_PRODUTOS ?? 0,
    totalVendido: r.TOTAL_VENDIDO ?? 0,
  }));
}
