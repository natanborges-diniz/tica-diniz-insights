import { describe, it, expect } from 'vitest';
import { calcularCurvaABC } from '../curva-abc';

// ─── OLD inline logic (copiada do hook antes da extração) ─────────────────────
function oldCurvaABC(
  itens: ReadonlyArray<{ codSku: number; totalVendido: number }>
): Map<number, 'A' | 'B' | 'C'> {
  const totalVendasGeral = itens.reduce((acc, sku) => acc + sku.totalVendido, 0);
  const ordenadosPorVenda = [...itens].sort((a, b) => b.totalVendido - a.totalVendido);
  let acumulado = 0;
  const curvaMap = new Map<number, 'A' | 'B' | 'C'>();
  ordenadosPorVenda.forEach(sku => {
    acumulado += sku.totalVendido;
    const percentual = totalVendasGeral > 0 ? (acumulado / totalVendasGeral) * 100 : 0;
    if (percentual <= 80)       curvaMap.set(sku.codSku, 'A');
    else if (percentual <= 95)  curvaMap.set(sku.codSku, 'B');
    else                        curvaMap.set(sku.codSku, 'C');
  });
  return curvaMap;
}

// ─── Dataset fixo ─────────────────────────────────────────────────────────────
// Total = 1000. Cumulative %:
//   SKU 1:  500 → 50%  → A
//   SKU 2:  200 → 70%  → A
//   SKU 3:  100 → 80%  → A  (exato no corte)
//   SKU 4:   80 → 88%  → B
//   SKU 5:   70 → 95%  → B  (exato no corte)
//   SKU 6:   30 → 98%  → C
//   SKU 7:   20 → 100% → C
const MOCK_SKUS = [
  { codSku: 3, totalVendido: 100 },
  { codSku: 7, totalVendido:  20 },
  { codSku: 1, totalVendido: 500 },
  { codSku: 5, totalVendido:  70 },
  { codSku: 2, totalVendido: 200 },
  { codSku: 6, totalVendido:  30 },
  { codSku: 4, totalVendido:  80 },
] as const;

describe('calcularCurvaABC — algoritmo', () => {
  it('classifica corretamente com dataset conhecido', () => {
    const m = calcularCurvaABC(MOCK_SKUS);
    expect(m.get(1)).toBe('A');
    expect(m.get(2)).toBe('A');
    expect(m.get(3)).toBe('A'); // exato em 80%
    expect(m.get(4)).toBe('B');
    expect(m.get(5)).toBe('B'); // exato em 95%
    expect(m.get(6)).toBe('C');
    expect(m.get(7)).toBe('C');
  });

  it('retorna map com mesmo tamanho do input', () => {
    expect(calcularCurvaABC(MOCK_SKUS).size).toBe(MOCK_SKUS.length);
  });

  it('array vazio → map vazio', () => {
    expect(calcularCurvaABC([]).size).toBe(0);
  });

  it('totalVendido = 0 em todos → percentual = 0 → todos A', () => {
    const itens = [
      { codSku: 1, totalVendido: 0 },
      { codSku: 2, totalVendido: 0 },
    ];
    const m = calcularCurvaABC(itens);
    expect(m.get(1)).toBe('A');
    expect(m.get(2)).toBe('A');
  });

  it('item único → C (100% do faturamento, acima de 80 e 95)', () => {
    const m = calcularCurvaABC([{ codSku: 99, totalVendido: 500 }]);
    expect(m.get(99)).toBe('C');
  });

  it('respeita cortes customizados', () => {
    // Corte A=50, B=70: SKU1(50%) → A, SKU2(70%) → B, resto → C
    const m = calcularCurvaABC(MOCK_SKUS, { a: 50, b: 70 });
    expect(m.get(1)).toBe('A'); // 50% == corteA → A
    expect(m.get(2)).toBe('B'); // 70% == corteB → B
    expect(m.get(3)).toBe('C'); // 80% > 70 → C
  });

  it('não muta o array de entrada (sort interno não afeta original)', () => {
    const input = [
      { codSku: 1, totalVendido: 10 },
      { codSku: 2, totalVendido: 90 },
    ];
    calcularCurvaABC(input);
    expect(input[0].codSku).toBe(1); // ordem original preservada
  });
});

// ─── Regressão OLD vs NEW ─────────────────────────────────────────────────────
describe('regressão OLD vs NEW — calcularCurvaABC', () => {
  it('NEW produz resultado idêntico ao OLD para cada SKU', () => {
    const oldMap = oldCurvaABC(MOCK_SKUS);
    const newMap = calcularCurvaABC(MOCK_SKUS);
    expect(newMap.size).toBe(oldMap.size);
    oldMap.forEach((curva, codSku) => {
      expect(newMap.get(codSku)).toBe(curva);
    });
  });

  it('snapshot da distribuição ABC', () => {
    const m = calcularCurvaABC(MOCK_SKUS);
    const distribuicao = { A: 0, B: 0, C: 0 };
    m.forEach(c => distribuicao[c]++);
    expect(distribuicao).toMatchSnapshot();
  });
});
