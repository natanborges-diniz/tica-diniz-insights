// src/services/estoqueService.ts
// Service para endpoint de estoque - usa o mesmo endpoint /vendas/analise-sku do OTB
// para garantir consistência nos valores de estoque

import { apiGet, EmpresaParam, formatEmpresaParam } from './firebirdBridge';

// ============================================
// INTERFACES
// ============================================

// Campos retornados pela API /vendas/analise-sku (snake_case)
interface AnaliseSkuRaw {
  cod_sku: number;
  descricao_item: string;
  marca: string;
  fornecedor: string;
  tipo: string;
  estoque_atual: number;
  qtd_produtos: number;
  total_vendido: number;
  caf?: number | null;
  dias_estoque?: number | null;
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
  dataInicio?: string;
  dataFim?: string;
}

export async function getAnaliseEstoqueAcao(
  params: GetAnaliseEstoqueParams
): Promise<AnaliseEstoqueAcao[]> {
  // Usa o mesmo endpoint do OTB para garantir consistência
  // IMPORTANTE: Usa os mesmos parâmetros de data que o OTB (180 dias)
  const hoje = new Date();
  const dataFim = params.dataFim || hoje.toISOString().split('T')[0];
  const dataInicio = params.dataInicio || new Date(hoje.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const raw = await apiGet<AnaliseSkuRaw>('/vendas/analise-sku', {
    empresa: formatEmpresaParam(params.empresa),
    dataInicio,
    dataFim,
  });

  console.log('[estoqueService] Raw data from /vendas/analise-sku:', raw.length, 'items, period:', dataInicio, 'to', dataFim);

  // Calcula ação sugerida baseado em dias de estoque e vendas
  const mapped = raw
    .filter((r) => (r.estoque_atual ?? 0) > 0) // Apenas itens com estoque
    .map((r) => {
      const diasEstoque = r.dias_estoque ?? 999;
      const qtdVendida = r.qtd_produtos ?? 0;
      
      // Lógica de ação: sem vendas ou parado > 90 dias = LIQUIDAR
      let acaoSugerida = 'COMPRAR';
      if (qtdVendida === 0 || diasEstoque > 90) {
        acaoSugerida = 'LIQUIDAR';
      } else if (diasEstoque > 30) {
        acaoSugerida = 'MANTER';
      }

      return {
        codEmpresa: 0,
        empresa: '',
        codProduto: r.cod_sku ?? 0,
        fornecedor: r.fornecedor ?? '',
        marca: r.marca ?? '',
        codigoBarra: String(r.cod_sku ?? ''),
        descricao: r.descricao_item ?? '',
        quantidadeEstoque: r.estoque_atual ?? 0,
        diasEstoque,
        acaoSugerida,
      };
    });

  console.log('[estoqueService] Mapped data:', mapped.length, 'items with stock');
  return mapped;
}
