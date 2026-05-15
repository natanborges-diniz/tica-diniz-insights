import { describe, it, expect } from 'vitest';
import {
  FAIXAS_SANEAMENTO,
  classificarPorIdade,
  toFaixaDoente,
} from '../faixas-saneamento';

describe('FAIXAS_SANEAMENTO', () => {
  it('has 6 entries without duplicates', () => {
    expect(FAIXAS_SANEAMENTO).toHaveLength(6);
    const ates = FAIXAS_SANEAMENTO.map(f => f.ate);
    expect(new Set(ates).size).toBe(6);
  });

  it('is ordered ascending by ate', () => {
    for (let i = 1; i < FAIXAS_SANEAMENTO.length; i++) {
      expect(FAIXAS_SANEAMENTO[i].ate).toBeGreaterThan(FAIXAS_SANEAMENTO[i - 1].ate);
    }
  });
});

describe('classificarPorIdade', () => {
  const casos: Array<[number, string, number, string]> = [
    // [dias, rotulo, desconto, acao]
    [0,    'ANALISE PARA RECOMPRA', 0,   'manter'    ],
    [1,    'ANALISE PARA RECOMPRA', 0,   'manter'    ],
    [89,   'ANALISE PARA RECOMPRA', 0,   'manter'    ],
    [90,   'ANALISE PARA RECOMPRA', 0,   'manter'    ],
    [91,   'ACOMPANHAMENTO',        0,   'observar'  ],
    [179,  'ACOMPANHAMENTO',        0,   'observar'  ],
    [180,  'ACOMPANHAMENTO',        0,   'observar'  ],
    [181,  'PROMOCAO 20%',          20,  'promover'  ],
    [269,  'PROMOCAO 20%',          20,  'promover'  ],
    [270,  'PROMOCAO 20%',          20,  'promover'  ],
    [271,  'LIQUIDA 30%',           30,  'liquidar'  ],
    [359,  'LIQUIDA 30%',           30,  'liquidar'  ],
    [360,  'LIQUIDA 30%',           30,  'liquidar'  ],
    [361,  'LIQUIDA 50%',           50,  'liquidar'  ],
    [719,  'LIQUIDA 50%',           50,  'liquidar'  ],
    [720,  'LIQUIDA 50%',           50,  'liquidar'  ],
    [721,  'DESCARTE 100%',         100, 'descartar' ],
    [999,  'DESCARTE 100%',         100, 'descartar' ],
    [9999, 'DESCARTE 100%',         100, 'descartar' ],
  ];

  it.each(casos)('%id → rotulo=%s desconto=%i acao=%s', (dias, rotulo, desconto, acao) => {
    const result = classificarPorIdade(dias);
    expect(result.rotulo).toBe(rotulo);
    expect(result.desconto).toBe(desconto);
    expect(result.acao).toBe(acao);
  });

  it('returns last entry for very large values', () => {
    const result = classificarPorIdade(Number.MAX_SAFE_INTEGER);
    expect(result.rotulo).toBe('DESCARTE 100%');
  });
});

describe('toFaixaDoente', () => {
  it('maps desconto 20 → PROMOCAO_20', () => {
    expect(toFaixaDoente(classificarPorIdade(270))).toBe('PROMOCAO_20');
  });

  it('maps desconto 30 → LIQUIDACAO_30', () => {
    expect(toFaixaDoente(classificarPorIdade(360))).toBe('LIQUIDACAO_30');
  });

  it('maps desconto 50 → LIQUIDACAO_50', () => {
    expect(toFaixaDoente(classificarPorIdade(720))).toBe('LIQUIDACAO_50');
  });

  it('maps desconto 100 → DESCARTE', () => {
    expect(toFaixaDoente(classificarPorIdade(721))).toBe('DESCARTE');
  });

  it('faixa boundary: dia 181 is first day in PROMOCAO_20', () => {
    const entry = classificarPorIdade(181);
    expect(toFaixaDoente(entry)).toBe('PROMOCAO_20');
  });

  it('faixa boundary: dia 271 is first day in LIQUIDACAO_30', () => {
    const entry = classificarPorIdade(271);
    expect(toFaixaDoente(entry)).toBe('LIQUIDACAO_30');
  });
});

describe('doente boundary — desconto > 0 check', () => {
  it('items with dias <= 180 have desconto 0 (not doente)', () => {
    expect(classificarPorIdade(180).desconto).toBe(0);
  });

  it('items with dias 181 have desconto > 0 (start of doente)', () => {
    expect(classificarPorIdade(181).desconto).toBeGreaterThan(0);
  });
});
