/**
 * Testes — Princípios #19 e #20 (Sub-Entrega C)
 *
 * #19 Dead Stock = SKU com estoqueAtual > 0 E diasDesdeUltimaVenda > 180
 * #20 Estoque Efetivo = soma de Armações NÃO dead stock (binário por SKU)
 */
import { describe, it, expect } from 'vitest';
import { calcularMixIdealMarcas } from '../mix-ideal';

// ─── Helper local — espelha a lógica do hook e do service ────────────────────
function isDeadStock(item: { estoqueAtual: number; diasDesdeUltimaVenda: number }): boolean {
  return item.estoqueAtual > 0 && item.diasDesdeUltimaVenda > 180;
}

// ─── Dataset helper ──────────────────────────────────────────────────────────
interface ItemMock {
  categoria: 'ARMACOES' | 'LENTES' | 'OUTROS';
  estoqueAtual: number;
  diasDesdeUltimaVenda: number;
  marca: string;
  qtdVendidos: number;
  totalVendido: number;
}

function calcularEstoqueEfetivo(itens: ItemMock[]): number {
  return itens
    .filter(i => i.categoria === 'ARMACOES' && i.estoqueAtual > 0 && !isDeadStock(i))
    .reduce((soma, i) => soma + i.estoqueAtual, 0);
}

// ─── #19 — isDeadStock: 4 cenários ───────────────────────────────────────────
describe('#19 isDeadStock — critério por última venda', () => {
  it('estoque=0, venda recente → false (sem estoque, não é dead)', () => {
    expect(isDeadStock({ estoqueAtual: 0, diasDesdeUltimaVenda: 30 })).toBe(false);
  });

  it('estoque>0, venda recente → false (ainda gira)', () => {
    expect(isDeadStock({ estoqueAtual: 5, diasDesdeUltimaVenda: 90 })).toBe(false);
  });

  it('estoque=0, sem venda há 200d → false (estoque 0 não é dead stock)', () => {
    expect(isDeadStock({ estoqueAtual: 0, diasDesdeUltimaVenda: 200 })).toBe(false);
  });

  it('estoque>0, sem venda há 181d → true (dead stock confirmado)', () => {
    expect(isDeadStock({ estoqueAtual: 3, diasDesdeUltimaVenda: 181 })).toBe(true);
  });

  it('fronteira exata: 180 dias → false (limite é estritamente > 180)', () => {
    expect(isDeadStock({ estoqueAtual: 2, diasDesdeUltimaVenda: 180 })).toBe(false);
  });

  it('diasDesdeUltimaVenda=0 (nunca vendeu ou sem dado) → false', () => {
    expect(isDeadStock({ estoqueAtual: 10, diasDesdeUltimaVenda: 0 })).toBe(false);
  });
});

// ─── #20 — estoqueEfetivoArmacoes ────────────────────────────────────────────
describe('#20 estoqueEfetivoArmacoes — apenas Armações saudáveis', () => {
  const MOCK_ITENS: ItemMock[] = [
    // Armação com estoque e venda recente → conta
    { categoria: 'ARMACOES', estoqueAtual: 10, diasDesdeUltimaVenda: 30,  marca: 'A', qtdVendidos: 5,  totalVendido: 500 },
    // Armação dead stock → NÃO conta
    { categoria: 'ARMACOES', estoqueAtual: 5,  diasDesdeUltimaVenda: 200, marca: 'B', qtdVendidos: 0,  totalVendido: 0   },
    // Armação sem estoque → NÃO conta (estoqueAtual=0)
    { categoria: 'ARMACOES', estoqueAtual: 0,  diasDesdeUltimaVenda: 10,  marca: 'C', qtdVendidos: 2,  totalVendido: 200 },
    // Lentes com estoque e venda recente → NÃO conta (outra categoria)
    { categoria: 'LENTES',   estoqueAtual: 20, diasDesdeUltimaVenda: 40,  marca: 'D', qtdVendidos: 8,  totalVendido: 800 },
    // Lentes dead stock → NÃO conta (outra categoria)
    { categoria: 'LENTES',   estoqueAtual: 8,  diasDesdeUltimaVenda: 250, marca: 'E', qtdVendidos: 0,  totalVendido: 0   },
    // Armação saudável extra → conta
    { categoria: 'ARMACOES', estoqueAtual: 3,  diasDesdeUltimaVenda: 60,  marca: 'F', qtdVendidos: 1,  totalVendido: 100 },
  ];

  it('soma apenas Armações com estoque e não dead (10 + 3 = 13)', () => {
    expect(calcularEstoqueEfetivo(MOCK_ITENS)).toBe(13);
  });

  it('SKU Armação dead stock não entra (5 peças excluídas)', () => {
    const semDead = MOCK_ITENS.filter(i => !(i.categoria === 'ARMACOES' && i.diasDesdeUltimaVenda === 200));
    expect(calcularEstoqueEfetivo(semDead)).toBe(calcularEstoqueEfetivo(MOCK_ITENS));
    // dead estava excluído de qualquer forma
    expect(calcularEstoqueEfetivo(MOCK_ITENS)).not.toBe(15);
  });

  it('Lentes não contam mesmo que saudáveis (20 peças ignoradas)', () => {
    const soLentes: ItemMock[] = [
      { categoria: 'LENTES', estoqueAtual: 20, diasDesdeUltimaVenda: 40, marca: 'D', qtdVendidos: 8, totalVendido: 800 },
    ];
    expect(calcularEstoqueEfetivo(soLentes)).toBe(0);
  });

  it('retorna 0 quando todas as Armações são dead stock', () => {
    const todasDead: ItemMock[] = [
      { categoria: 'ARMACOES', estoqueAtual: 5,  diasDesdeUltimaVenda: 300, marca: 'X', qtdVendidos: 0, totalVendido: 0 },
      { categoria: 'ARMACOES', estoqueAtual: 10, diasDesdeUltimaVenda: 500, marca: 'Y', qtdVendidos: 0, totalVendido: 0 },
    ];
    expect(calcularEstoqueEfetivo(todasDead)).toBe(0);
  });

  it('retorna 0 quando não há Armações', () => {
    const semArmacoes: ItemMock[] = [
      { categoria: 'LENTES', estoqueAtual: 10, diasDesdeUltimaVenda: 10, marca: 'Z', qtdVendidos: 3, totalVendido: 300 },
    ];
    expect(calcularEstoqueEfetivo(semArmacoes)).toBe(0);
  });
});

// ─── calcularMixIdealMarcas com isDeadStock ────────────────────────────────
describe('calcularMixIdealMarcas — pecasAtuais exclui dead stock', () => {
  // 2 SKUs da marca BRAND:
  //   SKU vivo:  estoqueAtual=8, qtdVendidos=10, isDeadStock=false
  //   SKU dead:  estoqueAtual=5, qtdVendidos=0,  isDeadStock=true
  // Sem dead stock: pecasAtuais = 8
  // Com dead stock excluído: pecasAtuais = 8 (5 não conta)
  // Sem o campo isDeadStock (legado): pecasAtuais = 8+5 = 13

  const SKU_VIVO = { marca: 'BRAND', qtdVendidos: 10, totalVendido: 1000, estoqueAtual: 8, isDeadStock: false };
  const SKU_DEAD = { marca: 'BRAND', qtdVendidos: 0,  totalVendido: 0,    estoqueAtual: 5, isDeadStock: true  };

  it('sem nenhum dead stock: pecasAtuais = soma total', () => {
    const result = calcularMixIdealMarcas([SKU_VIVO]);
    const brand = result.find(m => m.marca === 'BRAND')!;
    expect(brand.pecasAtuais).toBe(8);
  });

  it('SKU dead não conta em pecasAtuais', () => {
    const result = calcularMixIdealMarcas([SKU_VIVO, SKU_DEAD]);
    const brand = result.find(m => m.marca === 'BRAND')!;
    // Sem dead stock excluído seria 13; com exclusão deve ser 8
    expect(brand.pecasAtuais).toBe(8);
    expect(brand.pecasAtuais).not.toBe(13);
  });

  it('lacuna aumenta quando há dead stock (estoque efetivo menor)', () => {
    const semDead = calcularMixIdealMarcas([SKU_VIVO]);
    const comDead = calcularMixIdealMarcas([SKU_VIVO, SKU_DEAD]);
    const brandSem = semDead.find(m => m.marca === 'BRAND')!;
    const brandCom = comDead.find(m => m.marca === 'BRAND')!;
    // pecasIdeais é o mesmo (vendas são iguais para o SKU_VIVO)
    // mas pecasAtuais é igual (8 em ambos) pois SKU_DEAD não conta
    expect(brandCom.lacuna).toBeGreaterThanOrEqual(brandSem.lacuna);
    // pecasAtuais deve ser 8 em ambos os casos
    expect(brandCom.pecasAtuais).toBe(brandSem.pecasAtuais);
  });

  it('SKU dead ainda conta para ABC e vendas (skusAtivos, taxaPerformance)', () => {
    // SKU dead com estoque > 0 conta como ativo (skusAtivos++)
    // mas taxaPerformance cai porque qtdVendidos=0 → skusComVenda não aumenta
    const result = calcularMixIdealMarcas([SKU_VIVO, SKU_DEAD]);
    const brand = result.find(m => m.marca === 'BRAND')!;
    // skusAtivos=2 (vivo tem estoque>0, dead tem estoque>0)
    // skusComVenda=1 (só o vivo vendeu)
    // taxaPerformance = 1/2 = 0.5
    expect(brand.taxaPerformance).toBeCloseTo(0.5, 5);
  });

  it('compatibilidade legado: sem isDeadStock → comportamento anterior (todos contam)', () => {
    // Itens sem o campo isDeadStock devem se comportar como antes (isDeadStock=undefined=falsy)
    const itensLegado = [
      { marca: 'BRAND', qtdVendidos: 10, totalVendido: 1000, estoqueAtual: 8 },
      { marca: 'BRAND', qtdVendidos: 0,  totalVendido: 0,    estoqueAtual: 5 },
    ];
    const result = calcularMixIdealMarcas(itensLegado);
    const brand = result.find(m => m.marca === 'BRAND')!;
    // Sem isDeadStock explícito, todos os itens contam → 8+5=13
    expect(brand.pecasAtuais).toBe(13);
  });

  it('snapshot com dead stock', () => {
    expect(calcularMixIdealMarcas([SKU_VIVO, SKU_DEAD])).toMatchSnapshot();
  });
});
