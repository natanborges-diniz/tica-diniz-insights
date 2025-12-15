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
  total_bruto: number;
  total_desconto: number;
  total_ipi: number;
  total_vendido: number;
  total_devolucao: number;
  qtd_devolucao: number;
}

export interface ResumoEmpresaVendedor {
  codEmpresa: number;
  codEmpresaLogico: number;
  empresa: string;
  empresaNomeLogico: string;
  codVendedor: number;
  vendedor: string;
  qtdTransacao: number;
  qtdProdutos: number;
  totalBruto: number;
  totalDesconto: number;
  totalIpi: number;
  totalVendido: number;
  totalDevolucao: number;
  qtdDevolucao: number;
  // Campos calculados
  percentualDesconto: number;
  totalLiquidoSemDevolucoes: number;
  ticketMedioLiquido: number;
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

  const mapped = raw.map((r) => {
    const totalBruto = r.total_bruto ?? 0;
    const totalDesconto = r.total_desconto ?? 0;
    const totalVendido = r.total_vendido ?? 0;
    const totalDevolucao = r.total_devolucao ?? 0;
    const qtdTransacao = r.qtd_transacao ?? 0;

    return {
      codEmpresa: r.cod_empresa ?? 0,
      codEmpresaLogico: r.empresa_cod_logico ?? r.cod_empresa ?? 0,
      empresa: (r.empresa ?? '').trim(),
      empresaNomeLogico: (r.empresa_nome_logico ?? r.empresa ?? '').trim(),
      codVendedor: r.cod_vendedor ?? 0,
      vendedor: (r.vendedor ?? '').trim(),
      qtdTransacao,
      qtdProdutos: r.qtd_produtos ?? 0,
      totalBruto,
      totalDesconto,
      totalIpi: r.total_ipi ?? 0,
      totalVendido,
      totalDevolucao,
      qtdDevolucao: r.qtd_devolucao ?? 0,
      // Campos calculados
      percentualDesconto: totalBruto > 0 ? (totalDesconto / totalBruto) * 100 : 0,
      totalLiquidoSemDevolucoes: totalVendido - totalDevolucao,
      ticketMedioLiquido: qtdTransacao > 0 ? totalVendido / qtdTransacao : 0,
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
