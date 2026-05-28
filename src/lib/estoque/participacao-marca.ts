// src/lib/estoque/participacao-marca.ts
// Módulo PURO — sem React, sem Supabase.
// Calcula a participação de cada marca no mix de Armações.
//
// Princípio #6: participação = 60% peças + 40% faturamento

import { PESO_PECAS, PESO_FATURAMENTO } from './constants';

export interface ParticipacaoMarca {
  marca: string;
  pctPecas: number;          // 0-1
  pctFaturamento: number;    // 0-1
  participacao: number;      // 0-1 (weighted sum)
  pecasVendidas: number;
  faturamento: number;
}

/**
 * Calcula a participação proporcional de cada marca nas vendas de Armações.
 *
 * @param itens  Itens de estoque/vendas — apenas categoria ARMACOES é considerada.
 *               qtdVendidos e totalVendido devem ser líquidos (vendas - devoluções).
 * @returns Map<marca, ParticipacaoMarca>. Soma das participações = 1 (100%).
 *          Marcas sem vendas retornam participacao = 0.
 */
export function calcularParticipacaoMarca(
  itens: ReadonlyArray<{
    marca: string;
    qtdVendidos: number;
    totalVendido: number;
    categoria?: string;
  }>
): Map<string, ParticipacaoMarca> {
  // Filtrar apenas Armações (categoria undefined = assume Armações, para compatibilidade)
  const armacoes = itens.filter(
    i => i.categoria === undefined || i.categoria === 'ARMACOES'
  );

  const totalPecas = armacoes.reduce((s, i) => s + Math.max(0, i.qtdVendidos), 0);
  const totalFat = armacoes.reduce((s, i) => s + Math.max(0, i.totalVendido), 0);

  // Agregar por marca
  const byMarca = new Map<string, { pecas: number; faturamento: number }>();
  for (const item of armacoes) {
    const k = (item.marca || 'SEM MARCA').trim();
    const v = byMarca.get(k) ?? { pecas: 0, faturamento: 0 };
    v.pecas += Math.max(0, item.qtdVendidos);
    v.faturamento += Math.max(0, item.totalVendido);
    byMarca.set(k, v);
  }

  const result = new Map<string, ParticipacaoMarca>();
  for (const [marca, agg] of byMarca) {
    const pctPecas = totalPecas > 0 ? agg.pecas / totalPecas : 0;
    const pctFat = totalFat > 0 ? agg.faturamento / totalFat : 0;
    const participacao = PESO_PECAS * pctPecas + PESO_FATURAMENTO * pctFat;
    result.set(marca, {
      marca,
      pctPecas,
      pctFaturamento: pctFat,
      participacao,
      pecasVendidas: agg.pecas,
      faturamento: agg.faturamento,
    });
  }

  return result;
}
