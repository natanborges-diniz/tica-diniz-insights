// src/services/estoqueService.ts
// Service para endpoint de estoque

import { apiGet, EmpresaParam, formatEmpresaParam } from './firebirdBridge';

// ============================================
// INTERFACES
// ============================================

interface AnaliseEstoqueAcaoRaw {
  // Campos retornados pela API (snake_case)
  empresa_nome: string;
  fornecedor_cod_pessoa?: number;
  fornecedor_nome: string;
  grife: string;
  codigo_barras: string;
  descricao_item: string;
  quantidade_estoque: number;
  caf?: number | null;
  data_ultima_entrada?: string | null;
  dias_estoque: number | null;
  acao_sugerida: string;
}

export interface AnaliseEstoqueAcao {
  codEmpresa: number;
  empresa: string;
  codProduto: number;
  fornecedor: string;
  marca: string;
  codigoBarra: string;
  descricao: string;
  quantidadeEstoque: number;
  diasEstoque: number;
  acaoSugerida: string;
}

export interface GetAnaliseEstoqueParams {
  empresa: EmpresaParam;
}

export async function getAnaliseEstoqueAcao(
  params: GetAnaliseEstoqueParams
): Promise<AnaliseEstoqueAcao[]> {
  const raw = await apiGet<AnaliseEstoqueAcaoRaw>('/estoque/analise-acao', {
    empresa: formatEmpresaParam(params.empresa),
  });

  console.log('[estoqueService] Raw data sample:', raw[0]);

  const mapped = raw.map((r) => ({
    codEmpresa: 0,
    empresa: r.empresa_nome ?? '',
    codProduto: 0,
    fornecedor: r.fornecedor_nome ?? '',
    marca: r.grife ?? '',
    codigoBarra: r.codigo_barras ?? '',
    descricao: r.descricao_item ?? '',
    quantidadeEstoque: r.quantidade_estoque ?? 0,
    diasEstoque: r.dias_estoque ?? 0,
    acaoSugerida: (r.acao_sugerida ?? '').trim(),
  }));

  console.log('[estoqueService] Mapped data sample:', mapped[0]);
  return mapped;
}
