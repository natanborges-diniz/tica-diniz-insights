/**
 * Teste de regressão numérica — Entregas 1 e 2 (curva-abc)
 *
 * Replica a lógica OLD (inline) e compara com a NEW usando os mesmos dados.
 */
import { describe, it, expect } from 'vitest';
import { classificarPorIdade } from '../faixas-saneamento';
import { calcularCurvaABC } from '../curva-abc';

// ──────────────────────────────────────────────
// OLD logic (exato como estava antes da Entrega 1)
// ──────────────────────────────────────────────
function oldAcaoSugerida(diasEmEstoque: number): string {
  if (diasEmEstoque <= 90)  return 'ANALISE PARA RECOMPRA';
  if (diasEmEstoque <= 180) return 'ACOMPANHAMENTO';
  if (diasEmEstoque <= 270) return 'SINAL DE ALERTA';
  if (diasEmEstoque <= 360) return 'LIQUIDA 20%';
  if (diasEmEstoque <= 720) return 'LIQUIDA 30%';
  return 'LIQUIDA 50%';
}

// OLD hook classificarFaixaDoente — gerava { faixa, desconto }
function oldClassificarFaixaDoente(dias: number) {
  if (dias >= 720) return { faixa: 'DESCARTE',      desconto: '100%' };
  if (dias >= 360) return { faixa: 'LIQUIDACAO_50', desconto: '50%'  };
  if (dias >= 270) return { faixa: 'LIQUIDACAO_30', desconto: '30%'  };
  return           { faixa: 'PROMOCAO_20',           desconto: '20%'  };
}

// ──────────────────────────────────────────────
// NEW logic (faixas-saneamento.ts)
// ──────────────────────────────────────────────
function newAcaoSugerida(diasEmEstoque: number): string {
  return classificarPorIdade(diasEmEstoque).rotulo;
}

// ──────────────────────────────────────────────
// Dataset: 1 SKU por bucket de idade + fronteiras
// ──────────────────────────────────────────────
const MOCK = [
  { id: 'SKU-01', dias: 0,    qtd: 3, custo: 100 }, // extremo inferior
  { id: 'SKU-02', dias: 45,   qtd: 2, custo: 200 },
  { id: 'SKU-03', dias: 89,   qtd: 4, custo: 150 },
  { id: 'SKU-04', dias: 90,   qtd: 2, custo: 300 }, // fronteira ≤90
  { id: 'SKU-05', dias: 91,   qtd: 5, custo: 120 },
  { id: 'SKU-06', dias: 150,  qtd: 3, custo: 250 },
  { id: 'SKU-07', dias: 180,  qtd: 2, custo: 400 }, // fronteira ≤180
  { id: 'SKU-08', dias: 181,  qtd: 6, custo: 180 }, // primeiro dia doente
  { id: 'SKU-09', dias: 200,  qtd: 4, custo: 200 },
  { id: 'SKU-10', dias: 269,  qtd: 3, custo: 350 },
  { id: 'SKU-11', dias: 270,  qtd: 2, custo: 500 }, // fronteira ≤270
  { id: 'SKU-12', dias: 271,  qtd: 5, custo: 160 },
  { id: 'SKU-13', dias: 300,  qtd: 1, custo: 280 },
  { id: 'SKU-14', dias: 360,  qtd: 3, custo: 220 }, // fronteira ≤360
  { id: 'SKU-15', dias: 361,  qtd: 2, custo: 450 },
  { id: 'SKU-16', dias: 500,  qtd: 4, custo: 380 },
  { id: 'SKU-17', dias: 719,  qtd: 1, custo: 600 },
  { id: 'SKU-18', dias: 720,  qtd: 3, custo: 250 }, // fronteira ≤720
  { id: 'SKU-19', dias: 721,  qtd: 2, custo: 700 }, // primeiro dia DESCARTE
  { id: 'SKU-20', dias: 900,  qtd: 1, custo: 400 },
  { id: 'SKU-21', dias: 1500, qtd: 2, custo: 550 },
];

function computeMetrics(classifier: (d: number) => string) {
  const totalPecas      = MOCK.reduce((s, i) => s + i.qtd, 0);
  const valorTotalCusto = MOCK.reduce((s, i) => s + i.qtd * i.custo, 0);

  // dead stock: isDeadStock = diasEmEstoque > 180 (lógica do SERVICE, inalterada)
  const deadStock      = MOCK.filter(i => i.dias > 180);
  const deadStockPecas = deadStock.reduce((s, i) => s + i.qtd, 0);
  const deadStockValor = deadStock.reduce((s, i) => s + i.qtd * i.custo, 0);

  // pecasLiquidar: lógica do HOOK (acaoSugerida.includes('LIQUIDA'))
  const pecasLiquidar = MOCK
    .filter(i => classifier(i.dias).toUpperCase().includes('LIQUIDA'))
    .reduce((s, i) => s + i.qtd, 0);

  const skusPorFaixa: Record<string, { skus: number; pecas: number }> = {};
  MOCK.forEach(i => {
    const acao = classifier(i.dias);
    if (!skusPorFaixa[acao]) skusPorFaixa[acao] = { skus: 0, pecas: 0 };
    skusPorFaixa[acao].skus  += 1;
    skusPorFaixa[acao].pecas += i.qtd;
  });

  return { totalPecas, valorTotalCusto, deadStockPecas, deadStockValor, pecasLiquidar, skusPorFaixa };
}

const OLD = computeMetrics(oldAcaoSugerida);
const NEW = computeMetrics(newAcaoSugerida);

// ──────────────────────────────────────────────
// Métricas que NÃO devem mudar
// ──────────────────────────────────────────────
describe('métricas invariantes (devem ser idênticas)', () => {
  it('totalPecas: idêntico', () => {
    expect(NEW.totalPecas).toBe(OLD.totalPecas);
    expect(NEW.totalPecas).toBe(60); // soma manual de todos os qtd
  });

  it('valorTotalCusto: idêntico', () => {
    expect(NEW.valorTotalCusto).toBe(OLD.valorTotalCusto);
  });

  it('deadStockPecas: idêntico (isDeadStock = dias > 180, não muda)', () => {
    expect(NEW.deadStockPecas).toBe(OLD.deadStockPecas);
  });

  it('deadStockValor: idêntico', () => {
    expect(NEW.deadStockValor).toBe(OLD.deadStockValor);
  });
});

// ──────────────────────────────────────────────
// Mudança esperada: pecasLiquidar
// ──────────────────────────────────────────────
describe('pecasLiquidar (muda porque DESCARTE 100% não contém "LIQUIDA")', () => {
  it('OLD pecasLiquidar inclui itens >720d (LIQUIDA 50%)', () => {
    // SKU-19 (721d, qtd=2) + SKU-20 (900d, qtd=1) + SKU-21 (1500d, qtd=2) eram 'LIQUIDA 50%'
    const descartePecas = MOCK
      .filter(i => i.dias > 720)
      .reduce((s, i) => s + i.qtd, 0); // = 5
    expect(OLD.pecasLiquidar - NEW.pecasLiquidar).toBe(descartePecas);
  });

  it('NEW pecasLiquidar não inclui AÇÃO ESPECIAL (desconto 0)', () => {
    MOCK.filter(i => i.dias > 720).forEach(i => {
      expect(newAcaoSugerida(i.dias)).toBe('AÇÃO ESPECIAL');
      expect('AÇÃO ESPECIAL'.toUpperCase().includes('LIQUIDA')).toBe(false);
    });
  });
});

// ──────────────────────────────────────────────
// Mudanças esperadas nos rótulos das faixas
// ──────────────────────────────────────────────
describe('rótulos das faixas (mudanças esperadas)', () => {
  const mapeamentoEsperado: Array<[number, string, string]> = [
    // [dias, OLD_rotulo, NEW_rotulo]
    [200, 'SINAL DE ALERTA', 'PROMOCAO 20%'   ],
    [270, 'SINAL DE ALERTA', 'PROMOCAO 20%'   ],
    [271, 'LIQUIDA 20%',     'LIQUIDA 30%'    ],
    [360, 'LIQUIDA 20%',     'LIQUIDA 30%'    ],
    [361, 'LIQUIDA 30%',     'LIQUIDA 50%'    ],
    [720, 'LIQUIDA 30%',     'LIQUIDA 50%'    ],
    [721, 'LIQUIDA 50%',     'AÇÃO ESPECIAL'  ],
    [900, 'LIQUIDA 50%',     'AÇÃO ESPECIAL'  ],
  ];

  it.each(mapeamentoEsperado)('dia %id: OLD=%s → NEW=%s', (dias, oldLabel, newLabel) => {
    expect(oldAcaoSugerida(dias)).toBe(oldLabel);
    expect(newAcaoSugerida(dias)).toBe(newLabel);
  });

  it('faixas sem mudança de rótulo', () => {
    expect(newAcaoSugerida(0)).toBe('ANALISE PARA RECOMPRA');
    expect(newAcaoSugerida(90)).toBe('ANALISE PARA RECOMPRA');
    expect(newAcaoSugerida(91)).toBe('ACOMPANHAMENTO');
    expect(newAcaoSugerida(180)).toBe('ACOMPANHAMENTO');
  });
});

// ──────────────────────────────────────────────
// Snapshot numérico dos valores absolutos
// ──────────────────────────────────────────────
describe('snapshot dos valores absolutos (para referência)', () => {
  it('OLD metrics snapshot', () => {
    expect(OLD).toMatchSnapshot();
  });

  it('NEW metrics snapshot', () => {
    expect(NEW).toMatchSnapshot();
  });
});

// ──────────────────────────────────────────────
// Entrega 2 — regressão curva-abc
// ──────────────────────────────────────────────
// Dataset com vendas variadas para testar distribuição ABC
const MOCK_VENDAS = [
  { codSku: 1, totalVendido: 5000 },
  { codSku: 2, totalVendido: 3000 },
  { codSku: 3, totalVendido: 1500 },
  { codSku: 4, totalVendido: 800  },
  { codSku: 5, totalVendido: 400  },
  { codSku: 6, totalVendido: 200  },
  { codSku: 7, totalVendido: 100  },
  { codSku: 8, totalVendido:  50  },
  { codSku: 9, totalVendido:  25  },
  { codSku: 10, totalVendido: 10  },
];
// Total = 11085
// Cumulative: 1→45%, 2→72%, 3→85.5% ← corte A/B em 80%
// Continuando: 4→92.7%, 5→96.3% ← corte B/C em 95%
// Esperado: A={1,2}, B={3,4,5}, C={6,7,8,9,10}

function oldCurvaABCInline(
  itens: ReadonlyArray<{ codSku: number; totalVendido: number }>
): Map<number, 'A' | 'B' | 'C'> {
  const total = itens.reduce((acc, s) => acc + s.totalVendido, 0);
  const ord = [...itens].sort((a, b) => b.totalVendido - a.totalVendido);
  let acum = 0;
  const m = new Map<number, 'A' | 'B' | 'C'>();
  ord.forEach(s => {
    acum += s.totalVendido;
    const pct = total > 0 ? (acum / total) * 100 : 0;
    if (pct <= 80)      m.set(s.codSku, 'A');
    else if (pct <= 95) m.set(s.codSku, 'B');
    else                m.set(s.codSku, 'C');
  });
  return m;
}

describe('Entrega 2 — regressão curva-abc', () => {
  it('NEW calcularCurvaABC idêntico ao OLD inline para cada SKU', () => {
    const oldMap = oldCurvaABCInline(MOCK_VENDAS);
    const newMap = calcularCurvaABC(MOCK_VENDAS);
    expect(newMap.size).toBe(oldMap.size);
    oldMap.forEach((curva, codSku) => {
      expect(newMap.get(codSku)).toBe(curva);
    });
  });

  it('snapshot distribuição OLD', () => {
    const m = oldCurvaABCInline(MOCK_VENDAS);
    const dist = { A: 0, B: 0, C: 0 };
    m.forEach(c => dist[c]++);
    expect(dist).toMatchSnapshot();
  });

  it('snapshot distribuição NEW (deve ser idêntica)', () => {
    const m = calcularCurvaABC(MOCK_VENDAS);
    const dist = { A: 0, B: 0, C: 0 };
    m.forEach(c => dist[c]++);
    expect(dist).toMatchSnapshot();
  });
});
