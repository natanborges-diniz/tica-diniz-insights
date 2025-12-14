// src/services/estoqueService.ts
// Service para endpoint de estoque

import { apiGet, EmpresaParam, formatEmpresaParam } from './firebirdBridge';

// ============================================
// INTERFACES
// ============================================

interface AnaliseEstoqueAcaoRaw {
  COD_EMPRESA?: number;
  EMPRESA: string;
  COD_PRODUTO?: number;
  NOME_FORNECEDOR?: string;
  FORNECEDOR?: string;
  GRIFE?: string;
  MARCA?: string;
  CODIGO_BARRA?: string;
  DESCRICAO_PRODUTO?: string;
  DESCRICAO?: string;
  QUANTIDADE_ESTOQUE?: number;
  ESTOQUE_ATUAL?: number;
  DIAS_ESTOQUE: number;
  ACAO_SUGERIDA: string;
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

  return raw.map((r) => ({
    codEmpresa: r.COD_EMPRESA ?? 0,
    empresa: r.EMPRESA ?? '',
    codProduto: r.COD_PRODUTO ?? 0,
    fornecedor: r.NOME_FORNECEDOR ?? r.FORNECEDOR ?? '',
    marca: r.GRIFE ?? r.MARCA ?? '',
    codigoBarra: r.CODIGO_BARRA ?? '',
    descricao: r.DESCRICAO_PRODUTO ?? r.DESCRICAO ?? '',
    quantidadeEstoque: r.QUANTIDADE_ESTOQUE ?? r.ESTOQUE_ATUAL ?? 0,
    diasEstoque: r.DIAS_ESTOQUE ?? 0,
    acaoSugerida: r.ACAO_SUGERIDA ?? '',
  }));
}
