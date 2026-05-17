import { describe, it, expect } from 'vitest';
import { calcularDecisaoSku, type DecisaoSku } from '../decisao-sku';
import { LIMITES } from '../faixas-saneamento';

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Cria um SKU base saudável (giro rápido, cobertura abaixo do alvo)
function skuBase(overrides: Partial<Parameters<typeof calcularDecisaoSku>[0]> = {}) {
  return {
    precoCusto: 100,
    estoqueAtual: 2,
    qtdVendidos: 5,
    diasEmEstoque: 60,
    diasGiroEfetivo: 30,
    pecasGiroConsideradas: 2,
    coberturaDias: 60,   // 2 peças × 30d = 60d
    diasAlvo: 90,        // coberturaDias(60) < diasAlvo(90) → REPOR
    vendaDiaria: 0.05,
    ...overrides,
  };
}

// ─── SEM_CADASTRO ──────────────────────────────────────────────────────────────
describe('SEM_CADASTRO', () => {
  it('precoCusto = 0 → SEM_CADASTRO independente do resto', () => {
    expect(calcularDecisaoSku(skuBase({ precoCusto: 0 }))).toBe('SEM_CADASTRO');
  });

  it('precoCusto = 0 mesmo com estoque parado > 270d', () => {
    expect(calcularDecisaoSku(skuBase({ precoCusto: 0, diasEmEstoque: 400, qtdVendidos: 0 }))).toBe('SEM_CADASTRO');
  });
});

// ─── LIQUIDAR ─────────────────────────────────────────────────────────────────
describe('LIQUIDAR', () => {
  it('estoque > 0, sem venda, dias >= 270 → LIQUIDAR', () => {
    expect(calcularDecisaoSku(skuBase({ qtdVendidos: 0, diasEmEstoque: 270 }))).toBe('LIQUIDAR');
  });

  it('dias = 271 → LIQUIDAR', () => {
    expect(calcularDecisaoSku(skuBase({ qtdVendidos: 0, diasEmEstoque: 271 }))).toBe('LIQUIDAR');
  });

  it('dias = 1000 → LIQUIDAR', () => {
    expect(calcularDecisaoSku(skuBase({ qtdVendidos: 0, diasEmEstoque: 1000 }))).toBe('LIQUIDAR');
  });

  it('estoqueAtual = 0 → não LIQUIDAR (sem estoque para liquidar)', () => {
    const d = calcularDecisaoSku(skuBase({ estoqueAtual: 0, qtdVendidos: 0, diasEmEstoque: 400 }));
    expect(d).not.toBe('LIQUIDAR');
  });

  it('qtdVendidos > 0 → não LIQUIDAR (mesmo com dias >= 270)', () => {
    const d = calcularDecisaoSku(skuBase({ qtdVendidos: 1, diasEmEstoque: 400 }));
    expect(d).not.toBe('LIQUIDAR');
  });
});

// ─── TROCAR ───────────────────────────────────────────────────────────────────
describe('TROCAR', () => {
  it('estoque > 0, sem venda, dias >= 180 e < 270 → TROCAR', () => {
    expect(calcularDecisaoSku(skuBase({ qtdVendidos: 0, diasEmEstoque: 180 }))).toBe('TROCAR');
    expect(calcularDecisaoSku(skuBase({ qtdVendidos: 0, diasEmEstoque: 269 }))).toBe('TROCAR');
  });

  it('dias = 179 → não TROCAR (abaixo do limiar)', () => {
    const d = calcularDecisaoSku(skuBase({ qtdVendidos: 0, diasEmEstoque: 179 }));
    expect(d).not.toBe('TROCAR');
  });

  it('estoqueAtual = 0 → não TROCAR', () => {
    const d = calcularDecisaoSku(skuBase({ estoqueAtual: 0, qtdVendidos: 0, diasEmEstoque: 200 }));
    expect(d).not.toBe('TROCAR');
  });
});

// ─── REPOR ────────────────────────────────────────────────────────────────────
describe('REPOR', () => {
  it('com giro real e pecasGiroConsideradas >= 1 e coberturaDias < diasAlvo → REPOR', () => {
    expect(calcularDecisaoSku(skuBase())).toBe('REPOR');
  });

  it('sem giro real mas vendaDiaria > 0 e coberturaDias < diasAlvo → REPOR (fallback)', () => {
    expect(calcularDecisaoSku(skuBase({
      diasGiroEfetivo: null,
      pecasGiroConsideradas: 0,
      vendaDiaria: 0.1,
    }))).toBe('REPOR');
  });

  it('giro real mas pecasGiroConsideradas = 0 → não REPOR por giro real', () => {
    const d = calcularDecisaoSku(skuBase({ pecasGiroConsideradas: 0, vendaDiaria: 0 }));
    expect(d).not.toBe('REPOR');
  });

  it('coberturaDias >= diasAlvo → não REPOR', () => {
    expect(calcularDecisaoSku(skuBase({ coberturaDias: 90, diasAlvo: 90 }))).not.toBe('REPOR');
    expect(calcularDecisaoSku(skuBase({ coberturaDias: 120, diasAlvo: 90 }))).not.toBe('REPOR');
  });
});

// ─── OBSERVAR ────────────────────────────────────────────────────────────────
describe('OBSERVAR', () => {
  it('cobertura ok, giro real → OBSERVAR', () => {
    expect(calcularDecisaoSku(skuBase({ coberturaDias: 95, diasAlvo: 90 }))).toBe('OBSERVAR');
  });

  it('sem giro e sem venda diária → OBSERVAR', () => {
    expect(calcularDecisaoSku(skuBase({
      diasGiroEfetivo: null,
      vendaDiaria: 0,
      coberturaDias: 95,
    }))).toBe('OBSERVAR');
  });

  it('qtdVendidos > 0 mas cobertura suficiente → OBSERVAR', () => {
    expect(calcularDecisaoSku(skuBase({ coberturaDias: 100, diasAlvo: 90 }))).toBe('OBSERVAR');
  });
});

// ─── Prioridade das regras ────────────────────────────────────────────────────
describe('prioridade das regras', () => {
  it('SEM_CADASTRO tem prioridade sobre LIQUIDAR', () => {
    expect(calcularDecisaoSku(skuBase({ precoCusto: 0, qtdVendidos: 0, diasEmEstoque: 400 }))).toBe('SEM_CADASTRO');
  });

  it('LIQUIDAR tem prioridade sobre TROCAR', () => {
    // dias = 270 → LIQUIDAR (não TROCAR)
    expect(calcularDecisaoSku(skuBase({ qtdVendidos: 0, diasEmEstoque: 270 }))).toBe('LIQUIDAR');
  });

  it('LIQUIDAR tem prioridade sobre REPOR', () => {
    expect(calcularDecisaoSku(skuBase({ qtdVendidos: 0, diasEmEstoque: 300, coberturaDias: 10 }))).toBe('LIQUIDAR');
  });
});

// ─── Fronteiras (LIMITES de faixas-saneamento) ───────────────────────────────
describe('fronteiras usando LIMITES', () => {
  it('LIMITES.ATENCAO = 180', () => expect(LIMITES.ATENCAO).toBe(180));
  it('LIMITES.ACAO_SUAVE = 270', () => expect(LIMITES.ACAO_SUAVE).toBe(270));

  it('dias = LIMITES.ATENCAO → TROCAR', () => {
    expect(calcularDecisaoSku(skuBase({ qtdVendidos: 0, diasEmEstoque: LIMITES.ATENCAO }))).toBe('TROCAR');
  });

  it('dias = LIMITES.ACAO_SUAVE → LIQUIDAR', () => {
    expect(calcularDecisaoSku(skuBase({ qtdVendidos: 0, diasEmEstoque: LIMITES.ACAO_SUAVE }))).toBe('LIQUIDAR');
  });
});

// ─── cortes customizados ──────────────────────────────────────────────────────
describe('cortes customizados', () => {
  it('diasAtencao customizado', () => {
    // Com diasAtencao=120: dias=150 → TROCAR; dias=119 → não TROCAR
    expect(calcularDecisaoSku(
      skuBase({ qtdVendidos: 0, diasEmEstoque: 150 }),
      { diasAtencao: 120 }
    )).toBe('TROCAR');
    expect(calcularDecisaoSku(
      skuBase({ qtdVendidos: 0, diasEmEstoque: 119 }),
      { diasAtencao: 120 }
    )).not.toBe('TROCAR');
  });

  it('diasAcao customizado', () => {
    // Com diasAcao=400: dias=350 → TROCAR (não LIQUIDAR); dias=400 → LIQUIDAR
    expect(calcularDecisaoSku(
      skuBase({ qtdVendidos: 0, diasEmEstoque: 350 }),
      { diasAcao: 400 }
    )).toBe('TROCAR');
    expect(calcularDecisaoSku(
      skuBase({ qtdVendidos: 0, diasEmEstoque: 400 }),
      { diasAcao: 400 }
    )).toBe('LIQUIDAR');
  });
});

// ─── Regressão OLD vs NEW ─────────────────────────────────────────────────────
function oldDecisaoSku(sku: {
  precoCusto: number; estoqueAtual: number; qtdVendidos: number; diasEmEstoque: number;
  diasGiroEfetivo: number | null; pecasGiroConsideradas: number;
  coberturaDias: number; diasAlvo: number; vendaDiaria: number;
}): DecisaoSku {
  const temGiroReal = sku.diasGiroEfetivo !== null && sku.diasGiroEfetivo > 0;
  if (sku.precoCusto === 0)                                                            return 'SEM_CADASTRO';
  if (sku.estoqueAtual > 0 && sku.qtdVendidos === 0 && sku.diasEmEstoque >= 270)       return 'LIQUIDAR';
  if (sku.estoqueAtual > 0 && sku.qtdVendidos === 0 && sku.diasEmEstoque >= 180)       return 'TROCAR';
  if (temGiroReal && sku.pecasGiroConsideradas >= 1 && sku.coberturaDias < sku.diasAlvo) return 'REPOR';
  if (!temGiroReal && sku.vendaDiaria > 0 && sku.coberturaDias < sku.diasAlvo)         return 'REPOR';
  return 'OBSERVAR';
}

const CASOS_REGRESSAO = [
  skuBase(),                                                               // REPOR
  skuBase({ precoCusto: 0 }),                                              // SEM_CADASTRO
  skuBase({ qtdVendidos: 0, diasEmEstoque: 180 }),                         // TROCAR
  skuBase({ qtdVendidos: 0, diasEmEstoque: 270 }),                         // LIQUIDAR
  skuBase({ coberturaDias: 100, diasAlvo: 90 }),                           // OBSERVAR
  skuBase({ diasGiroEfetivo: null, vendaDiaria: 0.1, pecasGiroConsideradas: 0 }), // REPOR fallback
  skuBase({ diasGiroEfetivo: null, vendaDiaria: 0, pecasGiroConsideradas: 0 }),   // OBSERVAR
  skuBase({ qtdVendidos: 0, diasEmEstoque: 150 }),                         // não TROCAR (estoqueAtual>0 mas dias<180)
  skuBase({ estoqueAtual: 0, qtdVendidos: 0, diasEmEstoque: 300 }),        // não LIQUIDAR (sem estoque)
];

describe('regressão OLD vs NEW', () => {
  it('NEW produz resultado idêntico ao OLD para todos os casos', () => {
    CASOS_REGRESSAO.forEach((sku, i) => {
      expect(calcularDecisaoSku(sku)).toBe(oldDecisaoSku(sku));
    });
  });

  it('snapshot dos casos de regressão', () => {
    expect(CASOS_REGRESSAO.map(sku => ({ ...sku, decisao: calcularDecisaoSku(sku) }))).toMatchSnapshot();
  });
});
