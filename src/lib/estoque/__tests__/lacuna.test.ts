import { describe, it, expect } from 'vitest';
import { distribuirLacuna, type SkuParaPool, type MotivoQtd, type LacunaResult, type LacunaItemResult } from '../lacuna';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sku(overrides: Partial<SkuParaPool> & { codSku: number }): SkuParaPool {
  return {
    qtdVendidos: 10,
    precoCusto: 100,
    diasGiroUltimaPeca: 30,
    diasGiroMedio: null,
    pecasGiroConsideradas: 3,
    curvaABC: 'B',
    ...overrides,
  };
}

// ─── Edge cases ────────────────────────────────────────────────────────────────
describe('edge cases', () => {
  it('lacuna 0 → alocados vazios, naoPreenchivel=0', () => {
    const r = distribuirLacuna([sku({ codSku: 1 })], 0);
    expect(r.alocados).toEqual([]);
    expect(r.naoPreenchivel).toBe(0);
    expect(r.poolSize).toBe(0);
  });

  it('lacuna negativa → naoPreenchivel=0', () => {
    const r = distribuirLacuna([sku({ codSku: 1 })], -5);
    expect(r.naoPreenchivel).toBe(0);
  });

  it('pool vazio → tudo naoPreenchivel', () => {
    const r = distribuirLacuna([], 5);
    expect(r.alocados).toEqual([]);
    expect(r.naoPreenchivel).toBe(5);
    expect(r.poolSize).toBe(0);
  });

  it('SKU precoCusto=0 excluído do pool', () => {
    const r = distribuirLacuna([sku({ codSku: 1, precoCusto: 0 })], 3);
    expect(r.poolSize).toBe(0);
    expect(r.naoPreenchivel).toBe(3);
  });

  it('SKU qtdVendidos=0 excluído do pool', () => {
    const r = distribuirLacuna([sku({ codSku: 1, qtdVendidos: 0 })], 3);
    expect(r.poolSize).toBe(0);
  });

  it('SKU giro null excluído do pool', () => {
    const r = distribuirLacuna([sku({ codSku: 1, diasGiroUltimaPeca: null, diasGiroMedio: null })], 3);
    expect(r.poolSize).toBe(0);
  });

  it('SKU giro > maxGiro excluído do pool (padrão 90d)', () => {
    const r = distribuirLacuna([sku({ codSku: 1, diasGiroUltimaPeca: 91 })], 3);
    expect(r.poolSize).toBe(0);
  });

  it('SKU giro = maxGiro incluído (fronteira ≤)', () => {
    const r = distribuirLacuna([sku({ codSku: 1, diasGiroUltimaPeca: 90 })], 3);
    expect(r.poolSize).toBe(1);
  });

  it('prefere diasGiroUltimaPeca sobre diasGiroMedio', () => {
    // ultima=25 (ok), medio=100 (excluiria) — deve incluir
    const r = distribuirLacuna([sku({ codSku: 1, diasGiroUltimaPeca: 25, diasGiroMedio: 100 })], 1);
    expect(r.poolSize).toBe(1);
    expect(r.alocados.length).toBe(1);
  });

  it('usa diasGiroMedio se diasGiroUltimaPeca é null', () => {
    const r = distribuirLacuna([sku({ codSku: 1, diasGiroUltimaPeca: null, diasGiroMedio: 40 })], 1);
    expect(r.poolSize).toBe(1);
  });
});

// ─── Teto de compra ────────────────────────────────────────────────────────────
describe('tetoCompra', () => {
  it('teto = ceil(qtdVendidos * 1.2) limita alocação mesmo com lacuna grande', () => {
    // giro=7 (o mais rápido): recebe passes 1,2,3 + todos os 4+ [21,15,10,7] = 7 passes máximos.
    // qtdVendidos=3 → teto=ceil(3.6)=4 → teto ativa no passe 4 lim=21 (qtd chegaria a 4=teto).
    // lacuna=20 → naoPreenchivel=16.
    const r = distribuirLacuna([sku({ codSku: 1, curvaABC: 'A', qtdVendidos: 3, diasGiroUltimaPeca: 7 })], 20);
    const a = r.alocados.find(a => a.codSku === 1)!;
    expect(a.qtdAComprar).toBe(4); // ceil(3 * 1.2) = 4
    expect(r.naoPreenchivel).toBe(16);
  });

  it('teto mínimo = 1 quando ceil < 1 (nunca acontece pois qtdVendidos≥1 para estar no pool)', () => {
    // qtdVendidos=1 → teto=ceil(1.2)=2; giro=7 → pode receber até 7 passes, mas limitado a 2
    const r = distribuirLacuna([sku({ codSku: 1, curvaABC: 'A', qtdVendidos: 1, diasGiroUltimaPeca: 7 })], 10);
    const a = r.alocados.find(a => a.codSku === 1)!;
    expect(a.qtdAComprar).toBe(2); // teto = ceil(1 * 1.2) = 2 (algoritmo daria mais)
    expect(r.naoPreenchivel).toBe(8);
  });
});

// ─── Passes ────────────────────────────────────────────────────────────────────
describe('passes de distribuição', () => {
  it('passe 1 (BASE): 1 peça por SKU, melhor score ao pior', () => {
    // 3 SKUs com lacuna=3 → cada um recebe 1 no passe 1
    const skus = [
      sku({ codSku: 1, curvaABC: 'A', diasGiroUltimaPeca: 20 }),
      sku({ codSku: 2, curvaABC: 'B', diasGiroUltimaPeca: 40 }),
      sku({ codSku: 3, curvaABC: 'C', diasGiroUltimaPeca: 60 }),
    ];
    const r = distribuirLacuna(skus, 3);
    expect(r.alocados.length).toBe(3);
    r.alocados.forEach(a => {
      if (a.motivo === 'BASE') expect(a.qtdAComprar).toBeGreaterThanOrEqual(1);
    });
    expect(r.naoPreenchivel).toBe(0);
  });

  it('passe 2 (GIRO_RAPIDO): +1 nos giros ≤ 45d', () => {
    // SKU1: giro=30 (≤45), SKU2: giro=60 (>45); lacuna=4
    // passe 1: ambos recebem 1 (restante=2)
    // passe 2: só SKU1 recebe +1 (restante=1)
    // passe 3: SKU1 giro≤30 → +1 (restante=0)
    const skus = [
      sku({ codSku: 1, curvaABC: 'A', diasGiroUltimaPeca: 30 }),
      sku({ codSku: 2, curvaABC: 'A', diasGiroUltimaPeca: 60 }),
    ];
    const r = distribuirLacuna(skus, 4);
    const a1 = r.alocados.find(a => a.codSku === 1)!;
    const a2 = r.alocados.find(a => a.codSku === 2)!;
    // SKU1 deve ter mais que SKU2
    expect(a1.qtdAComprar).toBeGreaterThan(a2.qtdAComprar);
    expect(r.naoPreenchivel).toBe(0);
  });

  it('passe 3 (GIRO_MUITO_RAPIDO): +1 nos giros ≤ 30d', () => {
    const skus = [
      sku({ codSku: 1, curvaABC: 'A', diasGiroUltimaPeca: 25, qtdVendidos: 20 }),
      sku({ codSku: 2, curvaABC: 'A', diasGiroUltimaPeca: 50, qtdVendidos: 20 }),
    ];
    // lacuna=6: passe1=2(1+1), passe2=+1 p/ SKU1 (giro≤45), passe3=+1 p/ SKU1 (giro≤30)
    // SKU1 recebe pelo menos 3, SKU2 recebe 1
    const r = distribuirLacuna(skus, 5);
    const a1 = r.alocados.find(a => a.codSku === 1)!;
    const a2 = r.alocados.find(a => a.codSku === 2)!;
    expect(a1.qtdAComprar).toBeGreaterThanOrEqual(3);
    expect(a2.qtdAComprar).toBe(1);
  });

  it('motivo final reflete o último passe em que o SKU recebeu unidade', () => {
    // SKU com giro=20 (≤30) que recebe passes 1,2,3 → motivo final = GIRO_MUITO_RAPIDO
    const r = distribuirLacuna([sku({ codSku: 1, curvaABC: 'A', diasGiroUltimaPeca: 20, qtdVendidos: 20 })], 5);
    const a = r.alocados.find(a => a.codSku === 1)!;
    expect(a.motivo).toBe('GIRO_MUITO_RAPIDO');
  });

  it('SKU que só recebe no passe 1 tem motivo BASE', () => {
    // giro=80 (>45): passa apenas no passe 1
    const r = distribuirLacuna([sku({ codSku: 1, curvaABC: 'A', diasGiroUltimaPeca: 80, qtdVendidos: 20 })], 2);
    const a = r.alocados.find(a => a.codSku === 1)!;
    // passe 1: +1, passe 2: giro=80>45 → nada, passe 3: giro=80>30 → nada, passes 4+: giro>lim → nada
    // restante=1 → naoPreenchivel=1
    expect(a.motivo).toBe('BASE');
    expect(a.qtdAComprar).toBe(1);
    expect(r.naoPreenchivel).toBe(1);
  });
});

// ─── Scoring e ordenação ───────────────────────────────────────────────────────
describe('scoring', () => {
  it('curva A tem score maior que C (mesmo giro e peças)', () => {
    // score = (1/giro) * amostra * peso
    // A: peso=3, C: peso=1 → A recebe prioridade no passe 1
    const skus = [
      sku({ codSku: 1, curvaABC: 'C', diasGiroUltimaPeca: 30, qtdVendidos: 10 }),
      sku({ codSku: 2, curvaABC: 'A', diasGiroUltimaPeca: 30, qtdVendidos: 10 }),
    ];
    // lacuna=1: só 1 peça, deve ir para o SKU A (maior score)
    const r = distribuirLacuna(skus, 1);
    const a = r.alocados[0];
    expect(a.codSku).toBe(2); // curvaABC=A
  });

  it('giro mais rápido tem score maior que giro mais lento (mesma curva)', () => {
    // score = (1/giro) * ... → giro menor → score maior
    const skus = [
      sku({ codSku: 1, curvaABC: 'B', diasGiroUltimaPeca: 60 }),
      sku({ codSku: 2, curvaABC: 'B', diasGiroUltimaPeca: 15 }),
    ];
    const r = distribuirLacuna(skus, 1);
    expect(r.alocados[0].codSku).toBe(2); // giro=15 → score maior
  });

  it('mais pecasGiroConsideradas aumenta score (amostra = max(1, pGC))', () => {
    const skus = [
      sku({ codSku: 1, curvaABC: 'B', diasGiroUltimaPeca: 30, pecasGiroConsideradas: 1 }),
      sku({ codSku: 2, curvaABC: 'B', diasGiroUltimaPeca: 30, pecasGiroConsideradas: 5 }),
    ];
    const r = distribuirLacuna(skus, 1);
    expect(r.alocados[0].codSku).toBe(2); // amostra=5 → score maior
  });
});

// ─── maxGiro customizado ────────────────────────────────────────────────────────
describe('opts.limitesGiro.maxGiro', () => {
  it('maxGiro=45: exclui SKUs com giro > 45d', () => {
    const skus = [
      sku({ codSku: 1, diasGiroUltimaPeca: 40 }), // inclui
      sku({ codSku: 2, diasGiroUltimaPeca: 50 }), // exclui
    ];
    const r = distribuirLacuna(skus, 2, { limitesGiro: { maxGiro: 45 } });
    expect(r.poolSize).toBe(1);
    expect(r.alocados.every(a => a.codSku === 1)).toBe(true);
  });

  it('maxGiro=120: inclui SKUs com giro até 120d', () => {
    const skus = [
      sku({ codSku: 1, diasGiroUltimaPeca: 100 }), // incluído com maxGiro=120
    ];
    const r = distribuirLacuna(skus, 1, { limitesGiro: { maxGiro: 120 } });
    expect(r.poolSize).toBe(1);
  });
});

// ─── Dataset de regressão — 3 marcas (curvas A, B, C) ─────────────────────────
//
// Marca RAYBAN (curva A): 3 SKUs, giros variados
//   SKU-101: giro=15, curva=A, qtd=20 → teto=24, score=(1/15)*3*3=0.600 ← melhor
//   SKU-102: giro=30, curva=A, qtd=15 → teto=18, score=(1/30)*3*3=0.300
//   SKU-103: giro=60, curva=B, qtd=10 → teto=12, score=(1/60)*3*2=0.100
//   lacuna=10
//
// Marca OAKLEY (curva B): 2 SKUs
//   SKU-201: giro=20, curva=A, qtd=8  → teto=10, score=(1/20)*3*3=0.450
//   SKU-202: giro=80, curva=C, qtd=5  → teto=6,  score=(1/80)*3*1=0.0375
//   lacuna=5
//
// Marca GENÉRICA (curva C): 1 SKU mas giro=95 > maxGiro=90 → pool vazio
//   SKU-301: giro=95, curva=C, qtd=3
//   lacuna=3 → tudo naoPreenchivel

const POOL_RAYBAN: SkuParaPool[] = [
  { codSku: 101, qtdVendidos: 20, precoCusto: 200, diasGiroUltimaPeca: 15, diasGiroMedio: null, pecasGiroConsideradas: 3, curvaABC: 'A' },
  { codSku: 102, qtdVendidos: 15, precoCusto: 150, diasGiroUltimaPeca: 30, diasGiroMedio: null, pecasGiroConsideradas: 3, curvaABC: 'A' },
  { codSku: 103, qtdVendidos: 10, precoCusto: 100, diasGiroUltimaPeca: 60, diasGiroMedio: null, pecasGiroConsideradas: 3, curvaABC: 'B' },
];
const POOL_OAKLEY: SkuParaPool[] = [
  { codSku: 201, qtdVendidos: 8,  precoCusto: 300, diasGiroUltimaPeca: 20, diasGiroMedio: null, pecasGiroConsideradas: 2, curvaABC: 'A' },
  { codSku: 202, qtdVendidos: 5,  precoCusto: 250, diasGiroUltimaPeca: 80, diasGiroMedio: null, pecasGiroConsideradas: 1, curvaABC: 'C' },
];
const POOL_GENERICA: SkuParaPool[] = [
  { codSku: 301, qtdVendidos: 3,  precoCusto: 50,  diasGiroUltimaPeca: 95, diasGiroMedio: null, pecasGiroConsideradas: 1, curvaABC: 'C' },
];

// ─── OLD inline (cópia exata da lógica do hook antes da extração) ──────────────
const PESO_CURVA_OLD: Record<'A' | 'B' | 'C', number> = { A: 3, B: 2, C: 1 };

function oldDistribuirLacuna(
  skus: ReadonlyArray<SkuParaPool>,
  lacuna: number,
  maxGiro = 90
): LacunaResult {
  if (lacuna <= 0 || skus.length === 0) {
    return { alocados: [], naoPreenchivel: Math.max(0, lacuna), poolSize: 0 };
  }

  type PoolItem = { codSku: number; giroEf: number; score: number; tetoCompra: number; qtd: number; motivo: MotivoQtd | undefined };
  const pool: PoolItem[] = skus
    .filter(s => {
      const giroEf = s.diasGiroUltimaPeca ?? s.diasGiroMedio ?? null;
      return s.precoCusto > 0 && s.qtdVendidos > 0 && giroEf !== null && giroEf > 0 && giroEf <= maxGiro;
    })
    .map(s => {
      const giroEf = (s.diasGiroUltimaPeca ?? s.diasGiroMedio) as number;
      const amostra = Math.max(1, s.pecasGiroConsideradas);
      const peso = PESO_CURVA_OLD[s.curvaABC];
      const score = (1 / giroEf) * amostra * peso;
      const tetoCompra = Math.max(1, Math.ceil(s.qtdVendidos * 1.2));
      return { codSku: s.codSku, giroEf, score, tetoCompra, qtd: 0, motivo: undefined };
    })
    .sort((a, b) => b.score - a.score);

  let restante = lacuna;

  for (const p of pool) { if (restante <= 0) break; if (p.qtd < p.tetoCompra) { p.qtd += 1; restante -= 1; p.motivo = 'BASE'; } }
  if (restante > 0) { for (const p of pool) { if (restante <= 0) break; if (p.giroEf <= 45 && p.qtd < p.tetoCompra) { p.qtd += 1; restante -= 1; p.motivo = 'GIRO_RAPIDO'; } } }
  if (restante > 0) { for (const p of pool) { if (restante <= 0) break; if (p.giroEf <= 30 && p.qtd < p.tetoCompra) { p.qtd += 1; restante -= 1; p.motivo = 'GIRO_MUITO_RAPIDO'; } } }
  const limites = [21, 15, 10, 7];
  for (const lim of limites) {
    if (restante <= 0) break;
    let alocou = false;
    for (const p of pool) { if (restante <= 0) break; if (p.giroEf <= lim && p.qtd < p.tetoCompra) { p.qtd += 1; restante -= 1; p.motivo = 'GIRO_MUITO_RAPIDO'; alocou = true; } }
    if (!alocou) break;
  }

  return {
    alocados: pool.filter(p => p.qtd > 0).map(p => ({ codSku: p.codSku, qtdAComprar: p.qtd, motivo: p.motivo as MotivoQtd })),
    naoPreenchivel: restante,
    poolSize: pool.length,
  };
}

describe('regressão OLD vs NEW — 3 marcas (A, B, C)', () => {
  const casos: Array<[string, SkuParaPool[], number]> = [
    ['RAYBAN (curva A, lacuna 10)',  POOL_RAYBAN,   10],
    ['OAKLEY (curva B, lacuna 5)',   POOL_OAKLEY,   5 ],
    ['GENÉRICA (curva C, lacuna 3)', POOL_GENERICA, 3 ],
  ];

  casos.forEach(([label, pool, lacuna]) => {
    it(`${label}: NEW == OLD em cada campo`, () => {
      const old = oldDistribuirLacuna(pool, lacuna);
      const novo = distribuirLacuna(pool, lacuna);
      expect(novo.poolSize).toBe(old.poolSize);
      expect(novo.naoPreenchivel).toBe(old.naoPreenchivel);
      expect(novo.alocados.length).toBe(old.alocados.length);
      const sortFn = (a: LacunaItemResult, b: LacunaItemResult) => a.codSku - b.codSku;
      const oldSort = [...old.alocados].sort(sortFn);
      const newSort = [...novo.alocados].sort(sortFn);
      oldSort.forEach((o, i) => {
        expect(newSort[i].codSku).toBe(o.codSku);
        expect(newSort[i].qtdAComprar).toBe(o.qtdAComprar);
        expect(newSort[i].motivo).toBe(o.motivo);
      });
    });
  });

  it('snapshot RAYBAN lacuna=10 (OLD)', () => {
    expect(oldDistribuirLacuna(POOL_RAYBAN, 10)).toMatchSnapshot();
  });

  it('snapshot RAYBAN lacuna=10 (NEW — deve ser idêntico)', () => {
    expect(distribuirLacuna(POOL_RAYBAN, 10)).toMatchSnapshot();
  });

  it('snapshot OAKLEY lacuna=5 (OLD)', () => {
    expect(oldDistribuirLacuna(POOL_OAKLEY, 5)).toMatchSnapshot();
  });

  it('snapshot OAKLEY lacuna=5 (NEW — deve ser idêntico)', () => {
    expect(distribuirLacuna(POOL_OAKLEY, 5)).toMatchSnapshot();
  });

  it('snapshot GENÉRICA lacuna=3 (OLD — pool vazio)', () => {
    expect(oldDistribuirLacuna(POOL_GENERICA, 3)).toMatchSnapshot();
  });

  it('snapshot GENÉRICA lacuna=3 (NEW — deve ser idêntico)', () => {
    expect(distribuirLacuna(POOL_GENERICA, 3)).toMatchSnapshot();
  });
});

// ─── Testes de invariantes ─────────────────────────────────────────────────────
describe('invariantes', () => {
  it('soma(qtdAComprar) + naoPreenchivel == lacuna', () => {
    const casos = [
      { pool: POOL_RAYBAN, lacuna: 10 },
      { pool: POOL_OAKLEY, lacuna: 5 },
      { pool: POOL_GENERICA, lacuna: 3 },
      { pool: POOL_RAYBAN, lacuna: 100 }, // lacuna > tetos → sobra
    ];
    casos.forEach(({ pool, lacuna }) => {
      const r = distribuirLacuna(pool, lacuna);
      const totalAlocado = r.alocados.reduce((acc, a) => acc + a.qtdAComprar, 0);
      expect(totalAlocado + r.naoPreenchivel).toBe(lacuna);
    });
  });

  it('nenhum SKU supera tetoCompra = ceil(qtdVendidos * 1.2)', () => {
    const r = distribuirLacuna(POOL_RAYBAN, 100);
    const skuMap = new Map(POOL_RAYBAN.map(s => [s.codSku, s]));
    r.alocados.forEach(a => {
      const s = skuMap.get(a.codSku)!;
      const teto = Math.max(1, Math.ceil(s.qtdVendidos * 1.2));
      expect(a.qtdAComprar).toBeLessThanOrEqual(teto);
    });
  });

  it('SKUs com teto esgotado não aparecem mais vezes', () => {
    // 1 SKU com qtdVendidos=1 → teto=ceil(1.2)=2; lacuna=10 → deve receber apenas 2
    const r = distribuirLacuna([sku({ codSku: 1, curvaABC: 'A', qtdVendidos: 1, diasGiroUltimaPeca: 5 })], 10);
    const a = r.alocados.find(a => a.codSku === 1)!;
    expect(a.qtdAComprar).toBe(2);
    expect(r.naoPreenchivel).toBe(8);
  });

  it('não muta o array de entrada', () => {
    const original = [...POOL_RAYBAN];
    distribuirLacuna(POOL_RAYBAN, 10);
    POOL_RAYBAN.forEach((s, i) => {
      expect(s).toEqual(original[i]);
    });
  });
});
