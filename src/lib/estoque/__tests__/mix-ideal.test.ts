import { describe, it, expect } from 'vitest';
import {
  calcularMixIdealCategoria,
  calcularMixIdealMarcas,
  type MixComparativo,
  type MixMarca,
  type DecisaoMarca,
} from '../mix-ideal';

// ─── Dataset fixo — 3 marcas, 2 categorias ───────────────────────────────────
//
// Marcas por faturamento total:
//   RAYBAN:   qtd=20, fat=4000, estoque=8,  skusCom=2, skusAtivos=2
//   OAKLEY:   qtd=10, fat=2000, estoque=5,  skusCom=1, skusAtivos=2 (1 sem venda)
//   GENÉRICA: qtd=2,  fat=200,  estoque=10, skusCom=0, skusAtivos=1 (só estoque)
//
// ABC por faturamento (total=6200):
//   RAYBAN  cumul=4000 (64.5%) → A
//   OAKLEY  cumul=6000 (96.8%) → C  (mas taxaPerf=0.5 → não descontinua)
//   GENÉRICA cumul=6200 (100%) → C  (skusComVenda=0 → SEM_HISTORICO)

const MOCK_ITENS = [
  // RAYBAN — 2 SKUs com venda, estoque bom
  { marca: 'RAYBAN', qtdVendidos: 12, totalVendido: 2400, estoqueAtual: 5 },
  { marca: 'RAYBAN', qtdVendidos: 8,  totalVendido: 1600, estoqueAtual: 3 },
  // OAKLEY — 1 SKU com venda, 1 sem venda
  { marca: 'OAKLEY', qtdVendidos: 10, totalVendido: 2000, estoqueAtual: 3 },
  { marca: 'OAKLEY', qtdVendidos: 0,  totalVendido: 0,    estoqueAtual: 2 },
  // GENÉRICA — só estoque, nenhuma venda
  { marca: 'GENÉRICA', qtdVendidos: 0, totalVendido: 200, estoqueAtual: 10 },
] as const;

// Dataset para calcularMixIdealCategoria
const MOCK_CATS = [
  { chave: 'Armações RX',  estoqueAtual: 6, qtdVendidos: 15 },
  { chave: 'Armações RX',  estoqueAtual: 4, qtdVendidos: 10 },
  { chave: 'Solar / OC',   estoqueAtual: 3, qtdVendidos: 5  },
  { chave: 'Solar / OC',   estoqueAtual: 0, qtdVendidos: 2  }, // sem estoque
  { chave: 'Acessórios',   estoqueAtual: 2, qtdVendidos: 0  }, // sem venda
] as const;

// ─── calcularMixIdealCategoria ─────────────────────────────────────────────
describe('calcularMixIdealCategoria', () => {
  it('computa percentuais corretos', () => {
    const result = calcularMixIdealCategoria(MOCK_CATS);
    // totalEstoque = 6+4+3+0+2 = 15 (comEstoque apenas)
    // totalVendas  = 15+10+5+2+0 = 32

    const rx = result.find(m => m.chave === 'Armações RX')!;
    expect(rx).toBeDefined();
    // vendasRX = 15+10=25, estRX = 6+4=10
    expect(rx.percentualIdeal).toBeCloseTo((25 / 32) * 100, 5);
    expect(rx.percentualAtual).toBeCloseTo((10 / 15) * 100, 5);
    expect(rx.gap).toBeCloseTo(rx.percentualIdeal - rx.percentualAtual, 10);
  });

  it('exclui chave onde percentualIdeal=0 e percentualAtual=0', () => {
    const result = calcularMixIdealCategoria([
      { chave: 'A', estoqueAtual: 5, qtdVendidos: 10 },
      { chave: 'B', estoqueAtual: 0, qtdVendidos: 0 },
    ]);
    expect(result.some(m => m.chave === 'B')).toBe(false);
  });

  it('inclui chave com só estoque (percentualIdeal=0 mas percentualAtual>0)', () => {
    const result = calcularMixIdealCategoria(MOCK_CATS);
    const acess = result.find(m => m.chave === 'Acessórios');
    expect(acess).toBeDefined();
    expect(acess!.percentualIdeal).toBe(0);
    expect(acess!.percentualAtual).toBeGreaterThan(0);
  });

  it('retorna [] se todos zeros', () => {
    expect(calcularMixIdealCategoria([
      { chave: 'A', estoqueAtual: 0, qtdVendidos: 0 },
    ])).toEqual([]);
  });

  it('snapshot', () => {
    expect(calcularMixIdealCategoria(MOCK_CATS)).toMatchSnapshot();
  });
});

// ─── calcularMixIdealMarcas ────────────────────────────────────────────────
describe('calcularMixIdealMarcas', () => {
  it('retorna [] para input vazio', () => {
    expect(calcularMixIdealMarcas([])).toEqual([]);
  });

  it('classifica curva ABC por faturamento', () => {
    const result = calcularMixIdealMarcas(MOCK_ITENS);
    const rayban = result.find(m => m.marca === 'RAYBAN')!;
    const oakley = result.find(m => m.marca === 'OAKLEY')!;
    const generica = result.find(m => m.marca === 'GENÉRICA')!;

    // RAYBAN: 4000/6200 = 64.5% ≤ 80 → A
    expect(rayban.curvaMarca).toBe('A');
    // OAKLEY: acum=6000/6200 = 96.8% > 95 → C
    expect(oakley.curvaMarca).toBe('C');
    // GENÉRICA: acum=6200/6200 = 100% > 95 → C
    expect(generica.curvaMarca).toBe('C');
  });

  it('decisão REPOR_REFERENCIA: curvaMarca≠C ou taxaPerf≥threshold', () => {
    const result = calcularMixIdealMarcas(MOCK_ITENS);
    const rayban = result.find(m => m.marca === 'RAYBAN')!;
    // curvaMarca=A, taxaPerformance=2/2=1.0 ≥ 0.5
    expect(rayban.decisao).toBe('REPOR_REFERENCIA');
    expect(rayban.incluidaNoMix).toBe(true);
  });

  it('decisão RENOVAR_COLECAO: incluidaNoMix e taxaPerf < threshold', () => {
    // OAKLEY: curvaMarca=C, taxaPerf=1/2=0.5. threshold=0.5 → taxaPerf >= threshold → REPOR_REFERENCIA
    // Para testar RENOVAR precisamos de curvaMarca≠C com taxaPerf < 0.5
    const itens = [
      { marca: 'X', qtdVendidos: 10, totalVendido: 5000, estoqueAtual: 5 }, // curva A
      { marca: 'X', qtdVendidos: 0,  totalVendido: 0,    estoqueAtual: 2 }, // sem venda
      { marca: 'X', qtdVendidos: 0,  totalVendido: 0,    estoqueAtual: 3 }, // sem venda
      // skusAtivos=3, skusComVenda=1 → taxaPerf=1/3 ≈ 0.33 < 0.5 → RENOVAR
      // curvaMarca: único → 100% → C... hmm, C + taxaPerf<0.5 → AVALIAR_DESCONTINUACAO
    ];
    // Vamos criar um caso com curvaMarca=A mas taxaPerf < 0.5
    const itensRenovar = [
      // Marca Y: curva A (alto faturamento), mas só 1 de 3 SKUs vende
      { marca: 'Y', qtdVendidos: 50,  totalVendido: 8000, estoqueAtual: 5 },
      { marca: 'Y', qtdVendidos: 0,   totalVendido: 0,    estoqueAtual: 3 },
      { marca: 'Y', qtdVendidos: 0,   totalVendido: 0,    estoqueAtual: 2 },
      // Marca Z: curva C
      { marca: 'Z', qtdVendidos: 2,   totalVendido: 500,  estoqueAtual: 1 },
    ];
    const r = calcularMixIdealMarcas(itensRenovar);
    const y = r.find(m => m.marca === 'Y')!;
    // Y: faturamento=8000/(8000+500)=94% ≤ 95 → B (acum at B)
    // taxaPerf=1/3 ≈ 0.33 < 0.5 → incluidaNoMix=true, decisao=RENOVAR_COLECAO
    expect(y.incluidaNoMix).toBe(true);
    expect(y.decisao).toBe('RENOVAR_COLECAO');
  });

  it('decisão AVALIAR_DESCONTINUACAO: curvaMarca=C e taxaPerf < threshold', () => {
    const itensAvaliar = [
      { marca: 'TOP', qtdVendidos: 100, totalVendido: 9000, estoqueAtual: 20 },
      // RUIM: C e taxaPerf < 0.5
      { marca: 'RUIM', qtdVendidos: 1, totalVendido: 50, estoqueAtual: 5 },
      { marca: 'RUIM', qtdVendidos: 0, totalVendido: 0,  estoqueAtual: 3 },
      { marca: 'RUIM', qtdVendidos: 0, totalVendido: 0,  estoqueAtual: 2 },
    ];
    const r = calcularMixIdealMarcas(itensAvaliar);
    const ruim = r.find(m => m.marca === 'RUIM')!;
    // TOP: 9000/9050=99.4% → C, mas skusComVenda=1, skusAtivos=1 → taxaPerf=1 → REPOR
    // RUIM: C, taxaPerf=1/3 < 0.5 → AVALIAR_DESCONTINUACAO
    expect(ruim.curvaMarca).toBe('C');
    expect(ruim.taxaPerformance).toBeCloseTo(1 / 3, 5);
    expect(ruim.decisao).toBe('AVALIAR_DESCONTINUACAO');
    expect(ruim.incluidaNoMix).toBe(false);
    expect(ruim.pecasIdeais).toBe(0);
    expect(ruim.lacuna).toBe(0);
  });

  it('decisão SEM_HISTORICO: skusComVenda = 0', () => {
    const result = calcularMixIdealMarcas(MOCK_ITENS);
    const generica = result.find(m => m.marca === 'GENÉRICA')!;
    expect(generica.decisao).toBe('SEM_HISTORICO');
    expect(generica.incluidaNoMix).toBe(false);
  });

  it('pecasIdeais = ceil(vendaDiaria × coberturaAlvo[curva])', () => {
    const result = calcularMixIdealMarcas(MOCK_ITENS);
    const rayban = result.find(m => m.marca === 'RAYBAN')!;
    // vendaDiaria = 20 / 180 ≈ 0.1111
    // curvaMarca = A → coberturaAlvo = 60
    // pecasIdeais = ceil(0.1111 * 60) = ceil(6.667) = 7
    expect(rayban.vendaDiaria).toBeCloseTo(20 / 180, 5);
    expect(rayban.pecasIdeais).toBe(Math.ceil((20 / 180) * 60));
  });

  it('lacuna = max(0, pecasIdeais - pecasAtuais)', () => {
    const result = calcularMixIdealMarcas(MOCK_ITENS);
    result.forEach(m => {
      expect(m.lacuna).toBe(Math.max(0, m.pecasIdeais - m.pecasAtuais));
    });
  });

  it('respeita opts.coberturaAlvo customizado', () => {
    const coberturaAlvo = { A: 30, B: 45, C: 60 };
    const result = calcularMixIdealMarcas(MOCK_ITENS, { coberturaAlvo });
    const rayban = result.find(m => m.marca === 'RAYBAN')!;
    expect(rayban.pecasIdeais).toBe(Math.ceil((20 / 180) * 30));
  });

  it('respeita opts.diasPeriodo customizado', () => {
    const result90 = calcularMixIdealMarcas(MOCK_ITENS, { diasPeriodo: 90 });
    const rayban = result90.find(m => m.marca === 'RAYBAN')!;
    // vendaDiaria = 20/90
    expect(rayban.vendaDiaria).toBeCloseTo(20 / 90, 5);
  });

  it('respeita opts.thresholdPerformance customizado', () => {
    // OAKLEY: taxaPerf=0.5 — com threshold=0.51 seria RENOVAR, com 0.5 seria REPOR
    const resultBaixo = calcularMixIdealMarcas(MOCK_ITENS, { thresholdPerformance: 0.4 });
    const oakleyBaixo = resultBaixo.find(m => m.marca === 'OAKLEY')!;
    // curvaMarca=C, taxaPerf=0.5 ≥ 0.4 → REPOR_REFERENCIA (não descontinua pq taxaPerf≥threshold)
    expect(oakleyBaixo.decisao).toBe('REPOR_REFERENCIA');

    const resultAlto = calcularMixIdealMarcas(MOCK_ITENS, { thresholdPerformance: 0.6 });
    const oakleyAlto = resultAlto.find(m => m.marca === 'OAKLEY')!;
    // curvaMarca=C, taxaPerf=0.5 < 0.6 → AVALIAR_DESCONTINUACAO
    expect(oakleyAlto.decisao).toBe('AVALIAR_DESCONTINUACAO');
  });

  it('ordena por faturamento decrescente', () => {
    const result = calcularMixIdealMarcas(MOCK_ITENS);
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i].faturamento6m).toBeGreaterThanOrEqual(result[i + 1].faturamento6m);
    }
  });

  it('não muta input', () => {
    const copia = [...MOCK_ITENS];
    calcularMixIdealMarcas(MOCK_ITENS);
    expect(MOCK_ITENS[0]).toEqual(copia[0]);
  });

  it('marca vazia → agrupada como SEM MARCA', () => {
    const itens = [
      { marca: '',   qtdVendidos: 5, totalVendido: 500, estoqueAtual: 3 },
      { marca: 'A',  qtdVendidos: 1, totalVendido: 100, estoqueAtual: 1 },
    ];
    const r = calcularMixIdealMarcas(itens);
    const semMarca = r.find(m => m.marca === 'SEM MARCA');
    expect(semMarca).toBeDefined();
    expect(semMarca!.pecasVendidas6m).toBe(5);
  });

  it('snapshot com dados fixos', () => {
    expect(calcularMixIdealMarcas(MOCK_ITENS)).toMatchSnapshot();
  });
});

// ─── Regressão OLD vs NEW ─────────────────────────────────────────────────────
// Replica a lógica inline do hook e compara resultado campo a campo

function oldMixIdealMarcas(itens: ReadonlyArray<{
  marca: string; qtdVendidos: number; totalVendido: number; estoqueAtual: number;
}>): MixMarca[] {
  if (itens.length === 0) return [];

  const DIAS = 180;
  const COBERTURA: Record<'A' | 'B' | 'C', number> = { A: 60, B: 75, C: 90 };
  const THRESHOLD = 0.5;

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
    const vendaDiaria = agg.pecasVendidas / DIAS;
    const taxaPerformance = agg.skusAtivos > 0 ? agg.skusComVenda / agg.skusAtivos : 0;
    let decisao: DecisaoMarca;
    let incluidaNoMix: boolean;
    if (agg.skusComVenda === 0) {
      decisao = 'SEM_HISTORICO'; incluidaNoMix = false;
    } else if (curvaMarca === 'C' && taxaPerformance < THRESHOLD) {
      decisao = 'AVALIAR_DESCONTINUACAO'; incluidaNoMix = false;
    } else {
      decisao = taxaPerformance >= THRESHOLD ? 'REPOR_REFERENCIA' : 'RENOVAR_COLECAO';
      incluidaNoMix = true;
    }
    const pecasIdeais = incluidaNoMix ? Math.ceil(vendaDiaria * COBERTURA[curvaMarca]) : 0;
    const lacuna = Math.max(0, pecasIdeais - agg.pecasAtuais);
    return { marca, curvaMarca, pecasVendidas6m: agg.pecasVendidas, faturamento6m: agg.faturamento, vendaDiaria, pecasIdeais, pecasAtuais: agg.pecasAtuais, lacuna, incluidaNoMix, decisao, taxaPerformance };
  }).sort((a, b) => b.faturamento6m - a.faturamento6m);
}

describe('regressão OLD vs NEW — calcularMixIdealMarcas', () => {
  it('NEW produz resultado idêntico ao OLD para cada marca', () => {
    const old = oldMixIdealMarcas(MOCK_ITENS);
    const novo = calcularMixIdealMarcas(MOCK_ITENS);
    expect(novo.length).toBe(old.length);
    old.forEach((oldMarca, i) => {
      const newMarca = novo[i];
      expect(newMarca.marca).toBe(oldMarca.marca);
      expect(newMarca.curvaMarca).toBe(oldMarca.curvaMarca);
      expect(newMarca.pecasVendidas6m).toBe(oldMarca.pecasVendidas6m);
      expect(newMarca.faturamento6m).toBe(oldMarca.faturamento6m);
      expect(newMarca.vendaDiaria).toBeCloseTo(oldMarca.vendaDiaria, 10);
      expect(newMarca.pecasIdeais).toBe(oldMarca.pecasIdeais);
      expect(newMarca.pecasAtuais).toBe(oldMarca.pecasAtuais);
      expect(newMarca.lacuna).toBe(oldMarca.lacuna);
      expect(newMarca.incluidaNoMix).toBe(oldMarca.incluidaNoMix);
      expect(newMarca.decisao).toBe(oldMarca.decisao);
      expect(newMarca.taxaPerformance).toBeCloseTo(oldMarca.taxaPerformance, 10);
    });
  });

  it('snapshot de regressão', () => {
    expect(calcularMixIdealMarcas(MOCK_ITENS)).toMatchSnapshot();
  });
});
