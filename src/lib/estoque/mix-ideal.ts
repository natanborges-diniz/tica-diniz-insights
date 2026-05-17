export type DecisaoMarca = 'REPOR_REFERENCIA' | 'RENOVAR_COLECAO' | 'AVALIAR_DESCONTINUACAO' | 'SEM_HISTORICO';

export interface MixMarca {
  marca: string;
  curvaMarca: 'A' | 'B' | 'C';
  pecasVendidas6m: number;
  faturamento6m: number;
  vendaDiaria: number;
  pecasIdeais: number;
  pecasAtuais: number;
  lacuna: number;
  incluidaNoMix: boolean;
  decisao: DecisaoMarca;
  taxaPerformance: number;
}

export interface MixComparativo {
  chave: string;
  percentualIdeal: number;
  percentualAtual: number;
  gap: number;
}

const COBERTURA_ALVO_PADRAO: Record<'A' | 'B' | 'C', number> = { A: 60, B: 75, C: 90 };

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

export function calcularMixIdealMarcas(
  itens: ReadonlyArray<{
    marca: string;
    qtdVendidos: number;
    totalVendido: number;
    estoqueAtual: number;
  }>,
  opts?: {
    coberturaAlvo?: Record<'A' | 'B' | 'C', number>;
    thresholdPerformance?: number;
    diasPeriodo?: number;
  }
): MixMarca[] {
  if (itens.length === 0) return [];

  const coberturaAlvo = opts?.coberturaAlvo ?? COBERTURA_ALVO_PADRAO;
  const threshold = opts?.thresholdPerformance ?? 0.5;
  const diasPeriodo = opts?.diasPeriodo ?? 180;

  type Agg = { pecasVendidas: number; faturamento: number; pecasAtuais: number; skusComVenda: number; skusAtivos: number };
  const aggByMarca = new Map<string, Agg>();
  itens.forEach(it => {
    const k = it.marca || 'SEM MARCA';
    const a = aggByMarca.get(k) ?? { pecasVendidas: 0, faturamento: 0, pecasAtuais: 0, skusComVenda: 0, skusAtivos: 0 };
    a.pecasVendidas += it.qtdVendidos;
    a.faturamento += it.totalVendido;
    a.pecasAtuais += Math.max(0, it.estoqueAtual);
    if (it.qtdVendidos > 0) a.skusComVenda += 1;
    if (it.estoqueAtual > 0 || it.qtdVendidos > 0) a.skusAtivos += 1;
    aggByMarca.set(k, a);
  });

  const totalFat = Array.from(aggByMarca.values()).reduce((s, a) => s + a.faturamento, 0);
  const ordenadas = Array.from(aggByMarca.entries()).sort((a, b) => b[1].faturamento - a[1].faturamento);
  let acum = 0;
  const curvaPorMarca = new Map<string, 'A' | 'B' | 'C'>();
  ordenadas.forEach(([marca, agg]) => {
    acum += agg.faturamento;
    const pct = totalFat > 0 ? (acum / totalFat) * 100 : 100;
    if (pct <= 80) curvaPorMarca.set(marca, 'A');
    else if (pct <= 95) curvaPorMarca.set(marca, 'B');
    else curvaPorMarca.set(marca, 'C');
  });

  return Array.from(aggByMarca.entries()).map(([marca, agg]) => {
    const curvaMarca = curvaPorMarca.get(marca) ?? 'C';
    const vendaDiaria = diasPeriodo > 0 ? agg.pecasVendidas / diasPeriodo : 0;
    const taxaPerformance = agg.skusAtivos > 0 ? agg.skusComVenda / agg.skusAtivos : 0;

    let decisao: DecisaoMarca;
    let incluidaNoMix: boolean;
    if (agg.skusComVenda === 0) {
      decisao = 'SEM_HISTORICO';
      incluidaNoMix = false;
    } else if (curvaMarca === 'C' && taxaPerformance < threshold) {
      decisao = 'AVALIAR_DESCONTINUACAO';
      incluidaNoMix = false;
    } else {
      decisao = taxaPerformance >= threshold ? 'REPOR_REFERENCIA' : 'RENOVAR_COLECAO';
      incluidaNoMix = true;
    }

    const pecasIdeais = incluidaNoMix ? Math.ceil(vendaDiaria * coberturaAlvo[curvaMarca]) : 0;
    const lacuna = Math.max(0, pecasIdeais - agg.pecasAtuais);

    return {
      marca,
      curvaMarca,
      pecasVendidas6m: agg.pecasVendidas,
      faturamento6m: agg.faturamento,
      vendaDiaria,
      pecasIdeais,
      pecasAtuais: agg.pecasAtuais,
      lacuna,
      incluidaNoMix,
      decisao,
      taxaPerformance,
    };
  }).sort((a, b) => b.faturamento6m - a.faturamento6m);
}
