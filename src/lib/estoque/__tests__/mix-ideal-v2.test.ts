/**
 * Testes — D₃ (Sub-Entrega D)
 *
 * calcularMixIdealV2: participação proporcional por marca (Princípio #6).
 * Cenários: marca<25 estratégica, marca<25 não-estratégica, override solar,
 *           alocação por passadas, estouro de capacidade, dead stock.
 */
import { describe, it, expect } from 'vitest';
import { calcularMixIdealV2, type StatusMixV2 } from '../mix-ideal-v2';
import { MIX_MINIMO_MARCA } from '../constants';

// ─── Dataset base — 3 marcas, capacidade 200 ─────────────────────────────────
// RAYBAN:     60 peças, R$6000  → part = 0.6×0.6 + 0.4×0.5    = 0.56
// OAKLEY:     30 peças, R$4000  → part = 0.6×0.3 + 0.4×0.333  ≈ 0.313
// SILHOUETTE: 10 peças, R$2000  → part = 0.6×0.1 + 0.4×0.167  ≈ 0.127
// Com cap=200: RB=112, OAK=63, SIL=25 → todos OK

const CAP = 200;
const BASE = [
  { marca: 'RAYBAN',     qtdVendidos: 60, totalVendido: 6000, estoqueAtual: 50, isDeadStock: false, categoria: 'ARMACOES' as const, codSku: 1, descricao: 'RB 4105',     diasGiroUltimaPeca: 10, subcategoria: 'AR_RX' as const },
  { marca: 'OAKLEY',     qtdVendidos: 30, totalVendido: 4000, estoqueAtual: 40, isDeadStock: false, categoria: 'ARMACOES' as const, codSku: 2, descricao: 'OAK Metal',   diasGiroUltimaPeca: 15, subcategoria: 'AR_RX' as const },
  { marca: 'SILHOUETTE', qtdVendidos: 10, totalVendido: 2000, estoqueAtual: 30, isDeadStock: false, categoria: 'ARMACOES' as const, codSku: 3, descricao: 'SIL Momentum', diasGiroUltimaPeca: 25, subcategoria: 'AR_RX' as const },
];

// ─── Guardas básicas ──────────────────────────────────────────────────────────

describe('calcularMixIdealV2 — guardas', () => {
  it('capacidade=0 → []', () => {
    expect(calcularMixIdealV2({ itens: BASE, capacidadeTotal: 0 })).toEqual([]);
  });

  it('itens vazios → []', () => {
    expect(calcularMixIdealV2({ itens: [], capacidadeTotal: CAP })).toEqual([]);
  });

  it('lentes são ignoradas', () => {
    const sóLentes = [
      { marca: 'ZEISS', qtdVendidos: 50, totalVendido: 5000, estoqueAtual: 10, categoria: 'LENTES' as const, codSku: 99 },
    ];
    expect(calcularMixIdealV2({ itens: sóLentes, capacidadeTotal: CAP })).toEqual([]);
  });
});

// ─── Status e regra do mínimo ─────────────────────────────────────────────────

describe('calcularMixIdealV2 — status e MIX_MINIMO_MARCA', () => {
  it('marca >= MIX_MINIMO → status OK', () => {
    const r = calcularMixIdealV2({ itens: BASE, capacidadeTotal: CAP });
    const rb = r.find(m => m.marca === 'RAYBAN')!;
    expect(rb.status).toBe('OK');
    expect(rb.mixTotal).toBeGreaterThanOrEqual(MIX_MINIMO_MARCA);
  });

  it('marca < MIX_MINIMO estratégica → mixTotal=25, status=ABAIXO_MINIMO_ESTRATEGICA', () => {
    const itens = [
      { marca: 'PEQUENA', qtdVendidos:   1, totalVendido:   100, estoqueAtual:  5, isDeadStock: false, categoria: 'ARMACOES' as const, codSku: 10, descricao: 'PEQ', diasGiroUltimaPeca: 30 },
      { marca: 'GRANDE',  qtdVendidos: 100, totalVendido: 10000, estoqueAtual: 80, isDeadStock: false, categoria: 'ARMACOES' as const, codSku: 11, descricao: 'GRA', diasGiroUltimaPeca:  5 },
    ];
    const configs = new Map([['PEQUENA', { estrategica: true }]]);
    const r = calcularMixIdealV2({ itens, capacidadeTotal: CAP, marcaConfigs: configs });
    const p = r.find(m => m.marca === 'PEQUENA')!;
    expect(p.status).toBe('ABAIXO_MINIMO_ESTRATEGICA');
    expect(p.mixTotal).toBe(MIX_MINIMO_MARCA);
  });

  it('marca < MIX_MINIMO não-estratégica → mixTotal=0, status=SUGERIR_DESCONTINUAR', () => {
    const itens = [
      { marca: 'PEQUENA', qtdVendidos:   1, totalVendido:   100, estoqueAtual:  5, isDeadStock: false, categoria: 'ARMACOES' as const, codSku: 10, descricao: 'PEQ', diasGiroUltimaPeca: 30 },
      { marca: 'GRANDE',  qtdVendidos: 100, totalVendido: 10000, estoqueAtual: 80, isDeadStock: false, categoria: 'ARMACOES' as const, codSku: 11, descricao: 'GRA', diasGiroUltimaPeca:  5 },
    ];
    const r = calcularMixIdealV2({ itens, capacidadeTotal: CAP });
    const p = r.find(m => m.marca === 'PEQUENA')!;
    expect(p.status).toBe('SUGERIR_DESCONTINUAR');
    expect(p.mixTotal).toBe(0);
    expect(p.lacuna).toBe(0);
    expect(p.skusAlocados).toHaveLength(0);
  });
});

// ─── Override pct_solar ───────────────────────────────────────────────────────

describe('calcularMixIdealV2 — pct_solar', () => {
  it('pct_solar=0% → mixSolar=0, mixRX=mixTotal', () => {
    const r = calcularMixIdealV2({
      itens: BASE,
      capacidadeTotal: CAP,
      marcaConfigs: new Map([['RAYBAN', { pctSolar: 0 }]]),
    });
    const rb = r.find(m => m.marca === 'RAYBAN')!;
    expect(rb.pctSolar).toBe(0);
    expect(rb.mixSolar).toBe(0);
    expect(rb.mixRX).toBe(rb.mixTotal);
  });

  it('pct_solar=100% → mixRX=0, mixSolar=mixTotal', () => {
    const r = calcularMixIdealV2({
      itens: BASE,
      capacidadeTotal: CAP,
      marcaConfigs: new Map([['RAYBAN', { pctSolar: 100 }]]),
    });
    const rb = r.find(m => m.marca === 'RAYBAN')!;
    expect(rb.mixRX).toBe(0);
    expect(rb.mixSolar).toBe(rb.mixTotal);
  });

  it('mixRX + mixSolar = mixTotal (sem perda de arredondamento)', () => {
    const r = calcularMixIdealV2({ itens: BASE, capacidadeTotal: CAP, pctSolarDefault: 35 });
    r.forEach(m => {
      expect(m.mixRX + m.mixSolar).toBe(m.mixTotal);
    });
  });

  it('pctSolarDefault é aplicado quando marca não tem config', () => {
    const r = calcularMixIdealV2({ itens: BASE, capacidadeTotal: CAP, pctSolarDefault: 40 });
    const rb = r.find(m => m.marca === 'RAYBAN')!;
    expect(rb.pctSolar).toBe(40);
  });
});

// ─── Lacuna e dead stock ──────────────────────────────────────────────────────

describe('calcularMixIdealV2 — lacuna e dead stock', () => {
  it('lacuna = max(0, mixTotal - estoqueEfetivo)', () => {
    const r = calcularMixIdealV2({ itens: BASE, capacidadeTotal: CAP });
    const rb = r.find(m => m.marca === 'RAYBAN')!;
    expect(rb.lacuna).toBe(Math.max(0, rb.mixTotal - rb.estoqueEfetivo));
  });

  it('estoque suficiente → lacuna=0', () => {
    // Estoque muito alto: nenhuma lacuna
    const itens = [{ ...BASE[0], estoqueAtual: 999, isDeadStock: false }];
    const r = calcularMixIdealV2({ itens, capacidadeTotal: CAP });
    expect(r[0].lacuna).toBe(0);
  });

  it('dead stock NÃO conta no estoqueEfetivo', () => {
    const itens = [
      { marca: 'BRAND', qtdVendidos: 50, totalVendido: 5000, estoqueAtual: 20, isDeadStock: false, categoria: 'ARMACOES' as const, codSku: 1, descricao: 'A', diasGiroUltimaPeca: 10 },
      { marca: 'BRAND', qtdVendidos:  0, totalVendido:    0, estoqueAtual: 15, isDeadStock: true,  categoria: 'ARMACOES' as const, codSku: 2, descricao: 'B', diasGiroUltimaPeca: null },
    ];
    const r = calcularMixIdealV2({ itens, capacidadeTotal: CAP });
    const brand = r.find(m => m.marca === 'BRAND')!;
    expect(brand.estoqueEfetivo).toBe(20); // 15 do dead stock excluídos
  });
});

// ─── Alocação por passadas ────────────────────────────────────────────────────

describe('calcularMixIdealV2 — alocação por passadas', () => {
  it('SKU mais rápido recebe unidade extra do resto (lacuna ímpar)', () => {
    // sku1=AR (RX), sku2=OC (Solar) → split independente por subcategoria (Princípio #24)
    // lacuna=3, pctSolar=30 → lacunaRxAlloc=round(3*0.7)=2, lacunaSolarAlloc=1
    // candidatosRx=[sku1(5)]: sku1=2; candidatosSolar=[sku2(20)]: sku2=1
    const itens = [
      { marca: 'BRAND', qtdVendidos: 50, totalVendido: 5000, estoqueAtual:  0, isDeadStock: false, categoria: 'ARMACOES' as const, codSku: 1, descricao: 'AR Rápido', diasGiroUltimaPeca: 5 },
      { marca: 'BRAND', qtdVendidos: 50, totalVendido: 5000, estoqueAtual: 97, isDeadStock: false, categoria: 'ARMACOES' as const, codSku: 2, descricao: 'OC Lento',  diasGiroUltimaPeca: 20 },
    ];
    const r = calcularMixIdealV2({ itens, capacidadeTotal: 100 });
    const brand = r.find(m => m.marca === 'BRAND')!;
    expect(brand.lacuna).toBe(3);
    const sku1 = brand.skusAlocados.find(s => s.codSku === 1)!;
    const sku2 = brand.skusAlocados.find(s => s.codSku === 2)!;
    expect(sku1.qtdSugerida).toBe(2);
    expect(sku2.qtdSugerida).toBe(1);
  });

  it('SKU sem diasGiroUltimaPeca é excluído dos candidatos (filtro 1.5.A)', () => {
    // sku2 (null giro) excluído; sku1 (AR_RX, giro=5) recebe a porção RX da lacuna.
    // lacuna=3, pctSolar=30 → lacunaRxAlloc=2, lacunaSolarAlloc=1 (sem candidatos Solar).
    const itens = [
      { marca: 'BRAND', qtdVendidos: 50, totalVendido: 5000, estoqueAtual:  0, isDeadStock: false, categoria: 'ARMACOES' as const, codSku: 1, descricao: 'AR Rápido',   diasGiroUltimaPeca: 5 },
      { marca: 'BRAND', qtdVendidos: 50, totalVendido: 5000, estoqueAtual: 97, isDeadStock: false, categoria: 'ARMACOES' as const, codSku: 2, descricao: 'AR Sem dado', diasGiroUltimaPeca: null },
    ];
    const r = calcularMixIdealV2({ itens, capacidadeTotal: 100 });
    const brand = r.find(m => m.marca === 'BRAND')!;
    expect(brand.lacuna).toBe(3);
    expect(brand.skusAlocados).toHaveLength(1);
    expect(brand.skusAlocados[0].codSku).toBe(1);
    expect(brand.skusAlocados[0].qtdSugerida).toBe(2); // porção RX da lacuna
    expect(brand.lacunaSolar).toBe(1);                 // porção Solar sem candidatos
  });

  it('sum(qtdSugerida) + lacunaRx + lacunaSolar = lacuna (invariante split)', () => {
    // BASE só tem AR_RX; candidatosSolar=[].
    // Parte solar da lacuna fica em lacunaSolar; parte RX é alocada.
    const r = calcularMixIdealV2({ itens: BASE, capacidadeTotal: CAP });
    r.forEach(m => {
      const totalAlocado = m.skusAlocados.reduce((s, sku) => s + sku.qtdSugerida, 0);
      expect(totalAlocado + m.lacunaRx + m.lacunaSolar).toBe(m.lacuna);
    });
  });

  it('lacuna=0 → skusAlocados vazio', () => {
    // Estoque muito alto → sem lacuna
    const itens = [{ ...BASE[0], estoqueAtual: 999 }];
    const r = calcularMixIdealV2({ itens, capacidadeTotal: CAP });
    expect(r[0].skusAlocados).toHaveLength(0);
  });
});

// ─── Ordenação e snapshot ─────────────────────────────────────────────────────

describe('calcularMixIdealV2 — ordenação', () => {
  it('resultado ordenado por participação DESC', () => {
    const r = calcularMixIdealV2({ itens: BASE, capacidadeTotal: CAP });
    for (let i = 0; i < r.length - 1; i++) {
      expect(r[i].participacao).toBeGreaterThanOrEqual(r[i + 1].participacao);
    }
  });

  it('snapshot com dataset base', () => {
    expect(calcularMixIdealV2({ itens: BASE, capacidadeTotal: CAP })).toMatchSnapshot();
  });
});

// ─── Propagação codigoBarra / ean ─────────────────────────────────────────────

describe('calcularMixIdealV2 — propagação codigoBarra/ean (Onda 1.6)', () => {
  const itensComBarras = [
    {
      marca: 'RAYBAN', qtdVendidos: 60, totalVendido: 6000, estoqueAtual: 50,
      isDeadStock: false, categoria: 'ARMACOES' as const, codSku: 1,
      descricao: 'RB 4105', diasGiroUltimaPeca: 10, subcategoria: 'AR_RX' as const,
      codigoBarra: '7891234567', ean: '8056597137928',
    },
  ];

  it('codigoBarra propagado do ItemMixV2 para SkuAlocado', () => {
    const r = calcularMixIdealV2({ itens: itensComBarras, capacidadeTotal: CAP });
    expect(r[0].skusAlocados[0].codigoBarra).toBe('7891234567');
  });

  it('ean preenchido propagado para SkuAlocado', () => {
    const r = calcularMixIdealV2({ itens: itensComBarras, capacidadeTotal: CAP });
    expect(r[0].skusAlocados[0].ean).toBe('8056597137928');
  });

  it('ean=null propagado como null', () => {
    const itens = [{ ...itensComBarras[0], ean: null }];
    const r = calcularMixIdealV2({ itens, capacidadeTotal: CAP });
    expect(r[0].skusAlocados[0].ean).toBeNull();
  });

  it('codigoBarra ausente → undefined em SkuAlocado', () => {
    const r = calcularMixIdealV2({ itens: BASE, capacidadeTotal: CAP });
    const rb = r.find(m => m.marca === 'RAYBAN')!;
    expect(rb.skusAlocados[0].codigoBarra).toBeUndefined();
  });
});

describe('StatusMixV2 — valores válidos', () => {
  it('inclui SEM_VENDAS_180D como status válido', () => {
    const status: StatusMixV2 = 'SEM_VENDAS_180D';
    expect(status).toBe('SEM_VENDAS_180D');
  });
});

// ─── Onda 2.B: split RX/Solar + volume vendido ────────────────────────────────

describe('calcularMixIdealV2 — alocação split RX/Solar (Onda 2.B)', () => {
  const itensRxSolar = [
    { marca: 'B', qtdVendidos: 60, totalVendido: 6000, estoqueAtual:  0, isDeadStock: false,
      categoria: 'ARMACOES' as const, codSku: 1, descricao: 'AR Grau 1', diasGiroUltimaPeca: 5 },
    { marca: 'B', qtdVendidos: 40, totalVendido: 4000, estoqueAtual: 60, isDeadStock: false,
      categoria: 'ARMACOES' as const, codSku: 2, descricao: 'OC Solar 2', diasGiroUltimaPeca: 8 },
  ];

  it('candidatos RX e Solar são alocados independentemente', () => {
    // 100% participação, cap=100, pctSolar=30
    // lacuna=40 (estoqueEfetivo=60), lacunaRxAlloc=round(40*0.7)=28, lacunaSolarAlloc=12
    const r = calcularMixIdealV2({ itens: itensRxSolar, capacidadeTotal: 100 });
    const b = r.find(m => m.marca === 'B')!;
    expect(b.qtdAlocadaRx).toBeGreaterThan(0);
    expect(b.qtdAlocadaSolar).toBeGreaterThan(0);
    expect(b.lacunaRx).toBe(0);
    expect(b.lacunaSolar).toBe(0);
  });

  it('subcategoria propagada para skusAlocados', () => {
    const r = calcularMixIdealV2({ itens: itensRxSolar, capacidadeTotal: 100 });
    const b = r.find(m => m.marca === 'B')!;
    const rx = b.skusAlocados.find(s => s.codSku === 1)!;
    const sol = b.skusAlocados.find(s => s.codSku === 2)!;
    expect(rx.subcategoria).toBe('AR_RX');
    expect(sol.subcategoria).toBe('AR_SOLAR');
  });

  it('sem candidatos Solar → lacunaSolar = porção solar da lacuna', () => {
    const apenasRx = [
      { marca: 'B', qtdVendidos: 50, totalVendido: 5000, estoqueAtual: 0, isDeadStock: false,
        categoria: 'ARMACOES' as const, codSku: 1, descricao: 'AR Grau', diasGiroUltimaPeca: 5 },
    ];
    const r = calcularMixIdealV2({ itens: apenasRx, capacidadeTotal: 100 });
    const b = r.find(m => m.marca === 'B')!;
    expect(b.lacunaSolar).toBeGreaterThan(0);
    expect(b.lacunaRx).toBe(0);
  });

  it('sem candidatos RX → lacunaRx = porção RX da lacuna', () => {
    const apenasSolar = [
      { marca: 'B', qtdVendidos: 50, totalVendido: 5000, estoqueAtual: 0, isDeadStock: false,
        categoria: 'ARMACOES' as const, codSku: 1, descricao: 'OC Solar', diasGiroUltimaPeca: 5 },
    ];
    const r = calcularMixIdealV2({ itens: apenasSolar, capacidadeTotal: 100 });
    const b = r.find(m => m.marca === 'B')!;
    expect(b.lacunaRx).toBeGreaterThan(0);
    expect(b.lacunaSolar).toBe(0);
  });

  it('invariante: qtdAlocadaRx + qtdAlocadaSolar + lacunaRx + lacunaSolar = lacuna', () => {
    const r = calcularMixIdealV2({ itens: itensRxSolar, capacidadeTotal: 100 });
    r.forEach(m => {
      expect(m.qtdAlocadaRx + m.qtdAlocadaSolar + m.lacunaRx + m.lacunaSolar).toBe(m.lacuna);
    });
  });
});

// ─── Princípio #27: OUTROS em armações ficam fora do plano ───────────────────

describe('calcularMixIdealV2 — Princípio #27: subcategoria OUTROS excluída', () => {
  it('item AR_RX com estoque e giro → entra como candidato', () => {
    const itens = [
      { marca: 'B', qtdVendidos: 30, totalVendido: 3000, estoqueAtual: 0, isDeadStock: false,
        categoria: 'ARMACOES' as const, codSku: 1, descricao: 'AR Grau', diasGiroUltimaPeca: 5,
        subcategoria: 'AR_RX' as const },
    ];
    const r = calcularMixIdealV2({ itens, capacidadeTotal: 100 });
    expect(r[0].skusAlocados.length).toBeGreaterThan(0);
  });

  it('item OUTROS com giro válido → NÃO entra em nenhum bucket (skusAlocados vazio, lacuna honesta)', () => {
    const itens = [
      { marca: 'B', qtdVendidos: 30, totalVendido: 3000, estoqueAtual: 0, isDeadStock: false,
        categoria: 'ARMACOES' as const, codSku: 1, descricao: 'XX Modelo', diasGiroUltimaPeca: 5,
        subcategoria: 'OUTROS' as const },
    ];
    const r = calcularMixIdealV2({ itens, capacidadeTotal: 100 });
    expect(r[0].skusAlocados).toHaveLength(0);
    expect(r[0].lacunaRx + r[0].lacunaSolar).toBe(r[0].lacuna);
  });
});

describe('calcularMixIdealV2 — volume vendido 180d (Onda 2.B)', () => {
  it('vendido180dTotal acumulado por marca', () => {
    const r = calcularMixIdealV2({ itens: BASE, capacidadeTotal: CAP });
    const rb = r.find(m => m.marca === 'RAYBAN')!;
    expect(rb.vendido180dTotal).toBe(60);
  });

  it('vendido180dRx e vendido180dSolar split por subcategoria', () => {
    const itens = [
      { marca: 'M', qtdVendidos: 30, totalVendido: 3000, estoqueAtual: 10, isDeadStock: false,
        categoria: 'ARMACOES' as const, codSku: 1, descricao: 'AR Grau', diasGiroUltimaPeca: 5,
        subcategoria: 'AR_RX' },
      { marca: 'M', qtdVendidos: 20, totalVendido: 2000, estoqueAtual: 10, isDeadStock: false,
        categoria: 'ARMACOES' as const, codSku: 2, descricao: 'OC Sol', diasGiroUltimaPeca: 8,
        subcategoria: 'AR_SOLAR' },
    ];
    const r = calcularMixIdealV2({ itens, capacidadeTotal: 100 });
    const m = r.find(x => x.marca === 'M')!;
    expect(m.vendido180dTotal).toBe(50);
    expect(m.vendido180dRx).toBe(30);
    expect(m.vendido180dSolar).toBe(20);
  });

  it('marca sem vendas: todos vendido180d = 0', () => {
    const semVendas = [
      { marca: 'M', qtdVendidos: 0, totalVendido: 0, estoqueAtual: 10, isDeadStock: false,
        categoria: 'ARMACOES' as const, codSku: 1, descricao: 'AR X', diasGiroUltimaPeca: null },
    ];
    // marca com qtdVendidos=0 não passa pelo filtro de participação (participacao=0, pecasVendidas=0)
    const r = calcularMixIdealV2({ itens: semVendas, capacidadeTotal: 100 });
    expect(r).toHaveLength(0);
  });

  it('BASE: vendido180dTotal = sum(qtdVendidos) por marca', () => {
    const r = calcularMixIdealV2({ itens: BASE, capacidadeTotal: CAP });
    const oak = r.find(m => m.marca === 'OAKLEY')!;
    expect(oak.vendido180dTotal).toBe(30);
    const sil = r.find(m => m.marca === 'SILHOUETTE')!;
    expect(sil.vendido180dTotal).toBe(10);
  });

  it('SKU solar esgotado (estoqueAtual=0, subcategoria=AR_SOLAR) contabiliza em vendido180dSolar (Princípio #28)', () => {
    // Simula frame solar vendido com estoque zerado — caso real "OC AEXC" e similares.
    // O merge itensMix agora usa cascata e? → v? → fallback, então subcategoria=AR_SOLAR chega aqui.
    const itens = [
      { marca: 'M', qtdVendidos: 25, totalVendido: 2500, estoqueAtual: 0, isDeadStock: false,
        categoria: 'ARMACOES' as const, codSku: 1, descricao: 'OC AEXC Solar', diasGiroUltimaPeca: null,
        subcategoria: 'AR_SOLAR' as const },
      { marca: 'M', qtdVendidos: 75, totalVendido: 7500, estoqueAtual: 50, isDeadStock: false,
        categoria: 'ARMACOES' as const, codSku: 2, descricao: 'AR Grau RX', diasGiroUltimaPeca: 5,
        subcategoria: 'AR_RX' as const },
    ];
    const r = calcularMixIdealV2({ itens, capacidadeTotal: 100 });
    const m = r.find(x => x.marca === 'M')!;
    expect(m.vendido180dSolar).toBe(25);
    expect(m.vendido180dRx).toBe(75);
    expect(m.vendido180dTotal).toBe(100);
  });
});
