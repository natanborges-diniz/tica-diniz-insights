export interface MixComparativo {
  chave: string;
  percentualIdeal: number;
  percentualAtual: number;
  gap: number;
}

export function calcularMixIdealCategoria(
  itens: ReadonlyArray<{ chave: string; estoqueAtual: number; qtdVendidos: number }>
): MixComparativo[] {
  const comEstoque = itens.filter(i => i.estoqueAtual > 0);
  const totalEstoque = comEstoque.reduce((acc, i) => acc + i.estoqueAtual, 0);
  const totalVendas = itens.reduce((acc, i) => acc + i.qtdVendidos, 0);
  if (totalEstoque === 0 && totalVendas === 0) return [];

  const chaves = new Set(itens.map(i => i.chave));
  return Array.from(chaves)
    .map(chave => {
      const vendasChave = itens.filter(i => i.chave === chave).reduce((acc, i) => acc + i.qtdVendidos, 0);
      const estoqueChave = comEstoque.filter(i => i.chave === chave).reduce((acc, i) => acc + i.estoqueAtual, 0);
      const percentualIdeal = totalVendas > 0 ? (vendasChave / totalVendas) * 100 : 0;
      const percentualAtual = totalEstoque > 0 ? (estoqueChave / totalEstoque) * 100 : 0;
      return { chave, percentualIdeal, percentualAtual, gap: percentualIdeal - percentualAtual };
    })
    .filter(m => m.percentualIdeal > 0 || m.percentualAtual > 0);
}
