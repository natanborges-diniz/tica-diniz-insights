// src/lib/estoque/fornecedor-plano.ts
// Módulo PURO — sem React, sem Supabase.
// Cascata de resolução marca→fornecedor e agrupamento do mix por fornecedor.

import type { MixMarcaV2 } from './mix-ideal-v2';

export const SEM_FORNECEDOR_LABEL = 'SEM FORNECEDOR';

/**
 * Resolve o fornecedor de uma marca aplicando a cascata:
 *   1. Bridge (fornecedor_nome já vindo do Firebird via estoqueCompletoService)
 *   2. Fallback Supabase (tabela fornecedor_marca, carregada globalmente)
 *   3. SEM_FORNECEDOR_LABEL
 */
export function resolverFornecedor(
  marca: string,
  fornecedorBridge: string | null | undefined,
  mapeamentoSupabase: ReadonlyMap<string, string>
): string {
  const bridge = (fornecedorBridge ?? '').trim();
  if (bridge && bridge !== SEM_FORNECEDOR_LABEL && bridge !== 'N/D' && bridge !== 'NULL') {
    return bridge;
  }
  return mapeamentoSupabase.get(marca.toUpperCase()) ?? SEM_FORNECEDOR_LABEL;
}

export interface FornecedorGrupo {
  fornecedor: string;
  isSemFornecedor: boolean;
  marcas: MixMarcaV2[];
  totalMixIdeal: number;
  totalLacuna: number;
}

/**
 * Agrupa as marcas do mix por fornecedor.
 * Fornecedores não mapeados (SEM_FORNECEDOR_LABEL) ficam ao final.
 * Dentro de cada grupo, a ordem de marcas é preservada (participação DESC, vinda de calcularMixIdealV2).
 */
export function agruparPorFornecedor(
  mixMarcas: ReadonlyArray<MixMarcaV2>,
  fornecedorPorMarca: ReadonlyMap<string, string>
): FornecedorGrupo[] {
  const byFornecedor = new Map<string, MixMarcaV2[]>();

  for (const m of mixMarcas) {
    const forn = fornecedorPorMarca.get(m.marca) ?? SEM_FORNECEDOR_LABEL;
    const lista = byFornecedor.get(forn) ?? [];
    lista.push(m);
    byFornecedor.set(forn, lista);
  }

  return Array.from(byFornecedor.entries())
    .map(([forn, marcas]) => ({
      fornecedor: forn,
      isSemFornecedor: forn === SEM_FORNECEDOR_LABEL,
      marcas,
      totalMixIdeal: marcas.reduce((s, m) => s + m.mixTotal, 0),
      totalLacuna: marcas.reduce((s, m) => s + m.lacuna, 0),
    }))
    .sort((a, b) => {
      if (a.isSemFornecedor) return 1;
      if (b.isSemFornecedor) return -1;
      return a.fornecedor.localeCompare(b.fornecedor, 'pt-BR');
    });
}
