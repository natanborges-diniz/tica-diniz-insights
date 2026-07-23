/**
 * Testes — mix-multi-loja
 *
 * Motor puro que roda o mix ideal para várias lojas de uma vez.
 * Cenários: coerência com V2 loja a loja, agregadores por marca e por loja,
 *           minimoLoja distinto por loja, marca só em uma loja, empty.
 */
import { describe, it, expect } from 'vitest';
import {
  calcularMixIdealMultiLoja,
  agregarPorMarca,
  agregarPorLoja,
  type LojaInput,
} from '../mix-multi-loja';
import { calcularMixIdealV2, type ItemMixV2 } from '../mix-ideal-v2';
import { MIX_MINIMO_MARCA } from '../constants';

// ─── Dataset base — 2 lojas com perfis diferentes ─────────────────────────────
// Loja 1 (BARUERI, cap=200): RAYBAN domina
//   RAYBAN     70 peças, R$7000
//   OAKLEY     20 peças, R$3000
//   SILHOUETTE  5 peças, R$1000
// Loja 2 (PRIMITIVA, cap=150): mix mais equilibrado, SILHOUETTE relevante
//   RAYBAN     30 peças, R$3000
//   OAKLEY     30 peças, R$3500
//   SILHOUETTE 40 peças, R$8000

const COD_BARUERI = 1;
const COD_PRIMITIVA = 2;

const itensBarueri: ItemMixV2[] = [
  { marca: 'RAYBAN',     qtdVendidos: 70, totalVendido: 7000, estoqueAtual: 60, isDeadStock: false, categoria: 'ARMACOES', codSku: 1, descricao: 'RB', diasGiroUltimaPeca: 10, subcategoria: 'AR_RX' },
  { marca: 'OAKLEY',     qtdVendidos: 20, totalVendido: 3000, estoqueAtual: 20, isDeadStock: false, categoria: 'ARMACOES', codSku: 2, descricao: 'OAK', diasGiroUltimaPeca: 15, subcategoria: 'AR_RX' },
  { marca: 'SILHOUETTE', qtdVendidos:  5, totalVendido: 1000, estoqueAtual: 10, isDeadStock: false, categoria: 'ARMACOES', codSku: 3, descricao: 'SIL', diasGiroUltimaPeca: 30, subcategoria: 'AR_RX' },
];

const itensPrimitiva: ItemMixV2[] = [
  { marca: 'RAYBAN',     qtdVendidos: 30, totalVendido: 3000, estoqueAtual: 25, isDeadStock: false, categoria: 'ARMACOES', codSku: 1, descricao: 'RB', diasGiroUltimaPeca: 10, subcategoria: 'AR_RX' },
  { marca: 'OAKLEY',     qtdVendidos: 30, totalVendido: 3500, estoqueAtual: 20, isDeadStock: false, categoria: 'ARMACOES', codSku: 2, descricao: 'OAK', diasGiroUltimaPeca: 15, subcategoria: 'AR_RX' },
  { marca: 'SILHOUETTE', qtdVendidos: 40, totalVendido: 8000, estoqueAtual: 30, isDeadStock: false, categoria: 'ARMACOES', codSku: 3, descricao: 'SIL', diasGiroUltimaPeca: 20, subcategoria: 'AR_RX' },
];

const LOJAS_BASE: LojaInput[] = [
  { codEmpresa: COD_BARUERI, itens: itensBarueri, capacidadeTotal: 200 },
  { codEmpresa: COD_PRIMITIVA, itens: itensPrimitiva, capacidadeTotal: 150 },
];

// ─── Guardas ──────────────────────────────────────────────────────────────────

describe('calcularMixIdealMultiLoja — guardas', () => {
  it('lojas vazio → []', () => {
    expect(calcularMixIdealMultiLoja({ lojas: [] })).toEqual([]);
  });

  it('loja com itens vazios não gera linhas', () => {
    const r = calcularMixIdealMultiLoja({
      lojas: [{ codEmpresa: 99, itens: [], capacidadeTotal: 100 }],
    });
    expect(r).toEqual([]);
  });

  it('loja com capacidade=0 não gera linhas', () => {
    const r = calcularMixIdealMultiLoja({
      lojas: [{ codEmpresa: COD_BARUERI, itens: itensBarueri, capacidadeTotal: 0 }],
    });
    expect(r).toEqual([]);
  });
});

// ─── Coerência com V2 loja a loja ─────────────────────────────────────────────

describe('calcularMixIdealMultiLoja — coerência com V2', () => {
  it('cada linha de uma loja bate com calcularMixIdealV2 rodado só nessa loja', () => {
    const multi = calcularMixIdealMultiLoja({ lojas: LOJAS_BASE });

    const soloBarueri = calcularMixIdealV2({
      itens: itensBarueri,
      capacidadeTotal: 200,
    });
    const multiBarueri = multi.filter(m => m.codEmpresa === COD_BARUERI);

    // Mesmas marcas, mesmos mixTotal / participação
    for (const solo of soloBarueri) {
      const dupla = multiBarueri.find(x => x.marca === solo.marca)!;
      expect(dupla.participacao).toBe(solo.participacao);
      expect(dupla.mixTotal).toBe(solo.mixTotal);
      expect(dupla.lacuna).toBe(solo.lacuna);
      expect(dupla.status).toBe(solo.status);
      expect(dupla.minimoEfetivo).toBe(solo.minimoEfetivo);
    }
  });

  it('cada linha carrega o codEmpresa da sua loja', () => {
    const multi = calcularMixIdealMultiLoja({ lojas: LOJAS_BASE });
    for (const m of multi) {
      expect([COD_BARUERI, COD_PRIMITIVA]).toContain(m.codEmpresa);
    }
    expect(multi.some(m => m.codEmpresa === COD_BARUERI)).toBe(true);
    expect(multi.some(m => m.codEmpresa === COD_PRIMITIVA)).toBe(true);
  });
});

// ─── Independência: participação de uma loja NÃO afeta outra ─────────────────

describe('calcularMixIdealMultiLoja — independência entre lojas', () => {
  it('participação de RAYBAN em Barueri difere da em Primitiva (calculadas isoladamente)', () => {
    const multi = calcularMixIdealMultiLoja({ lojas: LOJAS_BASE });
    const rbBarueri = multi.find(m => m.marca === 'RAYBAN' && m.codEmpresa === COD_BARUERI)!;
    const rbPrimitiva = multi.find(m => m.marca === 'RAYBAN' && m.codEmpresa === COD_PRIMITIVA)!;
    // Barueri: 70/95 peças, 7000/11000 fat → part ≈ 0.5 * 0.737 + 0.5 * 0.636 = 0.687
    // Primitiva: 30/100 peças, 3000/14500 fat → part ≈ 0.5 * 0.3 + 0.5 * 0.207 = 0.253
    expect(rbBarueri.participacao).toBeGreaterThan(rbPrimitiva.participacao);
  });

  it('minimoLoja distinto por loja é respeitado', () => {
    // Barueri com mínimo 30; Primitiva com mínimo 20.
    // SILHOUETTE em Barueri: participacao ~5%, mixTotalRaw ~10, minimoLoja=30 → SUGERIR_DESCONTINUAR
    // SILHOUETTE em Primitiva: participacao ~34%, mixTotalRaw ~51, minimoLoja=20 → OK
    const r = calcularMixIdealMultiLoja({
      lojas: [
        { ...LOJAS_BASE[0], minimoLoja: 30 },
        { ...LOJAS_BASE[1], minimoLoja: 20 },
      ],
    });
    const silBarueri = r.find(m => m.marca === 'SILHOUETTE' && m.codEmpresa === COD_BARUERI)!;
    const silPrimitiva = r.find(m => m.marca === 'SILHOUETTE' && m.codEmpresa === COD_PRIMITIVA)!;
    expect(silBarueri.minimoEfetivo).toBe(30);
    expect(silBarueri.status).toBe('SUGERIR_DESCONTINUAR');
    expect(silPrimitiva.minimoEfetivo).toBe(20);
    expect(silPrimitiva.status).toBe('OK');
  });

  it('marcaConfigs separados por loja não vazam entre si', () => {
    // RAYBAN estratégica só em Barueri; nada em Primitiva.
    const r = calcularMixIdealMultiLoja({
      lojas: [
        { ...LOJAS_BASE[0], marcaConfigs: new Map([['RAYBAN', { estrategica: true }]]) },
        { ...LOJAS_BASE[1] }, // sem configs
      ],
    });
    const rbBarueri = r.find(m => m.marca === 'RAYBAN' && m.codEmpresa === COD_BARUERI)!;
    const rbPrimitiva = r.find(m => m.marca === 'RAYBAN' && m.codEmpresa === COD_PRIMITIVA)!;
    expect(rbBarueri.estrategica).toBe(true);
    expect(rbPrimitiva.estrategica).toBe(false);
  });
});

// ─── Marca presente em uma loja e ausente em outra ────────────────────────────

describe('calcularMixIdealMultiLoja — marca só em uma loja', () => {
  it('marca com vendas só em Primitiva aparece só uma vez no resultado', () => {
    const lojas: LojaInput[] = [
      { codEmpresa: COD_BARUERI, itens: itensBarueri, capacidadeTotal: 200 },
      {
        codEmpresa: COD_PRIMITIVA,
        itens: [
          ...itensPrimitiva,
          { marca: 'PERSOL', qtdVendidos: 50, totalVendido: 6000, estoqueAtual: 30, isDeadStock: false, categoria: 'ARMACOES', codSku: 4, descricao: 'PER', diasGiroUltimaPeca: 12, subcategoria: 'AR_RX' },
        ],
        capacidadeTotal: 150,
      },
    ];
    const r = calcularMixIdealMultiLoja({ lojas });
    const persols = r.filter(m => m.marca === 'PERSOL');
    expect(persols).toHaveLength(1);
    expect(persols[0].codEmpresa).toBe(COD_PRIMITIVA);
  });
});

// ─── Agregador por marca ──────────────────────────────────────────────────────

describe('agregarPorMarca', () => {
  it('soma mixTotal / estoqueEfetivo / lacuna / pecasVendidas / faturamento', () => {
    const multi = calcularMixIdealMultiLoja({ lojas: LOJAS_BASE });
    const agg = agregarPorMarca(multi);

    const rbBarueri = multi.find(m => m.marca === 'RAYBAN' && m.codEmpresa === COD_BARUERI)!;
    const rbPrimitiva = multi.find(m => m.marca === 'RAYBAN' && m.codEmpresa === COD_PRIMITIVA)!;
    const rbAgg = agg.find(a => a.marca === 'RAYBAN')!;

    expect(rbAgg.mixTotal).toBe(rbBarueri.mixTotal + rbPrimitiva.mixTotal);
    expect(rbAgg.estoqueEfetivo).toBe(rbBarueri.estoqueEfetivo + rbPrimitiva.estoqueEfetivo);
    expect(rbAgg.lacuna).toBe(rbBarueri.lacuna + rbPrimitiva.lacuna);
    expect(rbAgg.pecasVendidas).toBe(70 + 30);
    expect(rbAgg.faturamento).toBe(7000 + 3000);
  });

  it('lojasCount reflete quantas lojas têm a marca', () => {
    const multi = calcularMixIdealMultiLoja({ lojas: LOJAS_BASE });
    const agg = agregarPorMarca(multi);
    expect(agg.find(a => a.marca === 'RAYBAN')!.lojasCount).toBe(2);
    expect(agg.find(a => a.marca === 'OAKLEY')!.lojasCount).toBe(2);
    expect(agg.find(a => a.marca === 'SILHOUETTE')!.lojasCount).toBe(2);
  });

  it('temEstrategica é true se marca é estratégica em ≥1 loja', () => {
    const multi = calcularMixIdealMultiLoja({
      lojas: [
        { ...LOJAS_BASE[0], marcaConfigs: new Map([['RAYBAN', { estrategica: true }]]) },
        { ...LOJAS_BASE[1] },
      ],
    });
    const agg = agregarPorMarca(multi);
    expect(agg.find(a => a.marca === 'RAYBAN')!.temEstrategica).toBe(true);
    expect(agg.find(a => a.marca === 'OAKLEY')!.temEstrategica).toBe(false);
  });

  it('temSugerirDescontinuar é true se marca ficou abaixo do mínimo em ≥1 loja', () => {
    // SILHOUETTE em Barueri: participacao ~5%, mixRaw ~10 < 25 → SUGERIR_DESCONTINUAR
    // SILHOUETTE em Primitiva: OK
    const multi = calcularMixIdealMultiLoja({ lojas: LOJAS_BASE });
    const agg = agregarPorMarca(multi);
    const sil = agg.find(a => a.marca === 'SILHOUETTE')!;
    expect(sil.temSugerirDescontinuar).toBe(true);
  });

  it('ordenado por faturamento DESC', () => {
    const multi = calcularMixIdealMultiLoja({ lojas: LOJAS_BASE });
    const agg = agregarPorMarca(multi);
    for (let i = 0; i < agg.length - 1; i++) {
      expect(agg[i].faturamento).toBeGreaterThanOrEqual(agg[i + 1].faturamento);
    }
  });

  it('marca com participação zero não vaza para o agregado', () => {
    // Marca inexistente em ambas as lojas — nada muda no agregado.
    const multi = calcularMixIdealMultiLoja({ lojas: LOJAS_BASE });
    const agg = agregarPorMarca(multi);
    expect(agg.find(a => a.marca === 'INEXISTENTE')).toBeUndefined();
  });
});

// ─── Agregador por loja ───────────────────────────────────────────────────────

describe('agregarPorLoja', () => {
  it('soma mixTotal / estoqueEfetivo / lacuna por loja', () => {
    const multi = calcularMixIdealMultiLoja({ lojas: LOJAS_BASE });
    const agg = agregarPorLoja(multi);

    const marcasBarueri = multi.filter(m => m.codEmpresa === COD_BARUERI);
    const barueriAgg = agg.find(a => a.codEmpresa === COD_BARUERI)!;

    expect(barueriAgg.mixTotal).toBe(marcasBarueri.reduce((s, m) => s + m.mixTotal, 0));
    expect(barueriAgg.estoqueEfetivo).toBe(marcasBarueri.reduce((s, m) => s + m.estoqueEfetivo, 0));
    expect(barueriAgg.lacuna).toBe(marcasBarueri.reduce((s, m) => s + m.lacuna, 0));
    expect(barueriAgg.marcasCount).toBe(marcasBarueri.length);
  });

  it('capacidadeTotal vem do map opcional', () => {
    const multi = calcularMixIdealMultiLoja({ lojas: LOJAS_BASE });
    const capMap = new Map([[COD_BARUERI, 200], [COD_PRIMITIVA, 150]]);
    const agg = agregarPorLoja(multi, capMap);
    expect(agg.find(a => a.codEmpresa === COD_BARUERI)!.capacidadeTotal).toBe(200);
    expect(agg.find(a => a.codEmpresa === COD_PRIMITIVA)!.capacidadeTotal).toBe(150);
  });

  it('sem map de capacidade → capacidadeTotal=0 (defensivo)', () => {
    const multi = calcularMixIdealMultiLoja({ lojas: LOJAS_BASE });
    const agg = agregarPorLoja(multi);
    agg.forEach(a => expect(a.capacidadeTotal).toBe(0));
  });

  it('ordenado por codEmpresa ASC', () => {
    const multi = calcularMixIdealMultiLoja({ lojas: LOJAS_BASE });
    const agg = agregarPorLoja(multi);
    for (let i = 0; i < agg.length - 1; i++) {
      expect(agg[i].codEmpresa).toBeLessThan(agg[i + 1].codEmpresa);
    }
  });
});

// ─── Invariantes cruzadas ─────────────────────────────────────────────────────

describe('invariantes cruzadas motor multi-loja', () => {
  it('Σ mixTotal por marca (agregarPorMarca) == Σ mixTotal por loja (agregarPorLoja)', () => {
    const multi = calcularMixIdealMultiLoja({ lojas: LOJAS_BASE });
    const totalPorMarca = agregarPorMarca(multi).reduce((s, a) => s + a.mixTotal, 0);
    const totalPorLoja = agregarPorLoja(multi).reduce((s, a) => s + a.mixTotal, 0);
    expect(totalPorMarca).toBe(totalPorLoja);
  });

  it('Σ lacuna por marca == Σ lacuna por loja', () => {
    const multi = calcularMixIdealMultiLoja({ lojas: LOJAS_BASE });
    const totalPorMarca = agregarPorMarca(multi).reduce((s, a) => s + a.lacuna, 0);
    const totalPorLoja = agregarPorLoja(multi).reduce((s, a) => s + a.lacuna, 0);
    expect(totalPorMarca).toBe(totalPorLoja);
  });

  it('MIX_MINIMO_MARCA continua o fallback quando nada é passado', () => {
    // Sanity check pro futuro: se o fallback mudar sem passar aqui,
    // outros testes vão pegar, mas explicito.
    expect(MIX_MINIMO_MARCA).toBe(25);
  });
});
