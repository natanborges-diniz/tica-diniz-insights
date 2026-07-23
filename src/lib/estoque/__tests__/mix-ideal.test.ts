import { describe, it, expect } from 'vitest';
import { calcularMixIdealCategoria } from '../mix-ideal';

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
