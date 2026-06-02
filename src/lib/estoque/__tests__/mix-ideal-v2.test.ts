/**
 * Testes — D₃ (Sub-Entrega D)
 *
 * calcularMixIdealV2: participação proporcional por marca (Princípio #6).
 * Cenários: marca<25 estratégica, marca<25 não-estratégica, override solar,
 *           alocação por passadas, estouro de capacidade, dead stock.
 */
import { describe, it, expect } from 'vitest';
import { calcularMixIdealV2 } from '../mix-ideal-v2';
import { MIX_MINIMO_MARCA } from '../constants';

// ─── Dataset base — 3 marcas, capacidade 200 ─────────────────────────────────
// RAYBAN:     60 peças, R$6000  → part = 0.6×0.6 + 0.4×0.5    = 0.56
// OAKLEY:     30 peças, R$4000  → part = 0.6×0.3 + 0.4×0.333  ≈ 0.313
// SILHOUETTE: 10 peças, R$2000  → part = 0.6×0.1 + 0.4×0.167  ≈ 0.127
// Com cap=200: RB=112, OAK=63, SIL=25 → todos OK

const CAP = 200;
const BASE = [
  { marca: 'RAYBAN',     qtdVendidos: 60, totalVendido: 6000, estoqueAtual: 50, isDeadStock: false, categoria: 'ARMACOES' as const, codSku: 1, descricao: 'RB 4105',     diasGiroUltimaPeca: 10 },
  { marca: 'OAKLEY',     qtdVendidos: 30, totalVendido: 4000, estoqueAtual: 40, isDeadStock: false, categoria: 'ARMACOES' as const, codSku: 2, descricao: 'OAK Metal',   diasGiroUltimaPeca: 15 },
  { marca: 'SILHOUETTE', qtdVendidos: 10, totalVendido: 2000, estoqueAtual: 30, isDeadStock: false, categoria: 'ARMACOES' as const, codSku: 3, descricao: 'SIL Momentum', diasGiroUltimaPeca: 25 },
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
    // Única marca (100% participação) → mixTotal = 100
    // estoqueAtual = 97 no SKU2 → estoqueEfetivo = 97, lacuna = 3
    // Round-robin: sku1(giro=5) → 2, sku2(giro=20) → 1
    const itens = [
      { marca: 'BRAND', qtdVendidos: 50, totalVendido: 5000, estoqueAtual:  0, isDeadStock: false, categoria: 'ARMACOES' as const, codSku: 1, descricao: 'Rápido', diasGiroUltimaPeca: 5 },
      { marca: 'BRAND', qtdVendidos: 50, totalVendido: 5000, estoqueAtual: 97, isDeadStock: false, categoria: 'ARMACOES' as const, codSku: 2, descricao: 'Lento',  diasGiroUltimaPeca: 20 },
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
    // Filtro 1.5.A: diasGiroUltimaPeca == null → não entra como candidato.
    // Toda a lacuna vai para sku1 (diasGiro=5); sku2 (null) não é alocado.
    const itens = [
      { marca: 'BRAND', qtdVendidos: 50, totalVendido: 5000, estoqueAtual:  0, isDeadStock: false, categoria: 'ARMACOES' as const, codSku: 1, descricao: 'Rápido',   diasGiroUltimaPeca: 5 },
      { marca: 'BRAND', qtdVendidos: 50, totalVendido: 5000, estoqueAtual: 97, isDeadStock: false, categoria: 'ARMACOES' as const, codSku: 2, descricao: 'Sem dado', diasGiroUltimaPeca: null },
    ];
    const r = calcularMixIdealV2({ itens, capacidadeTotal: 100 });
    const brand = r.find(m => m.marca === 'BRAND')!;
    expect(brand.lacuna).toBe(3);
    expect(brand.skusAlocados).toHaveLength(1);
    expect(brand.skusAlocados[0].codSku).toBe(1);
    expect(brand.skusAlocados[0].qtdSugerida).toBe(3); // toda a lacuna vai para sku1
  });

  it('soma dos qtdSugerida = lacuna', () => {
    const r = calcularMixIdealV2({ itens: BASE, capacidadeTotal: CAP });
    r.forEach(m => {
      const totalAlocado = m.skusAlocados.reduce((s, sku) => s + sku.qtdSugerida, 0);
      expect(totalAlocado).toBe(m.lacuna);
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
