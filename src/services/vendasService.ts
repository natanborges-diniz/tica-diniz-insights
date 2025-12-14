// src/services/vendasService.ts
// Service para endpoints de vendas

import { apiGet, EmpresaParam, formatEmpresaParam } from './firebirdBridge';

// ============================================
// INTERFACES - RESUMO EMPRESA/VENDEDOR
// ============================================

interface ResumoEmpresaVendedorRaw {
  cod_empresa: number;
  empresa: string;
  empresa_cod_logico: number;
  empresa_nome_logico: string;
  cod_vendedor: number;
  vendedor: string;
  qtd_transacao: number;
  qtd_produtos: number;
  total_vendido: number;
  total_devolucao: number;
  qtd_devolucao: number;
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

  console.log('[vendasService] Raw data count:', raw.length);
  console.log('[vendasService] Raw data sample:', raw[0]);
  console.log('[vendasService] Raw data keys:', raw[0] ? Object.keys(raw[0]) : 'N/A');

  const mapped = raw.map((r) => ({
    codEmpresa: r.cod_empresa ?? 0,
    empresa: r.empresa ?? '',
    codVendedor: r.cod_vendedor ?? 0,
    vendedor: (r.vendedor ?? '').trim(),
    totalOriginal: r.total_vendido ?? 0,
    totalVendido: r.total_vendido ?? 0,
    ticketMedio: r.qtd_transacao > 0 ? r.total_vendido / r.qtd_transacao : 0,
    totalDevolucao: r.total_devolucao ?? 0,
    qtdTransacao: r.qtd_transacao ?? 0,
    qtdDevolucao: r.qtd_devolucao ?? 0,
  }));

  console.log('[vendasService] Mapped data sample:', mapped[0]);

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
