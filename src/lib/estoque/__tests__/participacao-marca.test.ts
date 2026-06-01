import { describe, it, expect } from 'vitest';
import { calcularParticipacaoMarca } from '../participacao-marca';

// Dataset: 3 marcas
// RAYBAN: 60 peças, R$6000
// OAKLEY: 30 peças, R$4000
// SILHOUETTE: 10 peças, R$2000
// GENÉRICA: 0 peças, R$0 (sem vendas)
// Total: 100 peças, R$12000
const MOCK = [
  { marca: 'RAYBAN',    qtdVendidos: 60, totalVendido: 6000, categoria: 'ARMACOES' as const },
  { marca: 'OAKLEY',   qtdVendidos: 30, totalVendido: 4000, categoria: 'ARMACOES' as const },
  { marca: 'SILHOUETTE', qtdVendidos: 10, totalVendido: 2000, categoria: 'ARMACOES' as const },
  { marca: 'GENÉRICA', qtdVendidos: 0,  totalVendido: 0,    categoria: 'ARMACOES' as const },
  // Lente — não deve entrar no cálculo
  { marca: 'ZEISS',    qtdVendidos: 50, totalVendido: 5000, categoria: 'LENTES' as const },
] as const;

describe('calcularParticipacaoMarca', () => {
  it('retorna Map vazio para input vazio', () => {
    expect(calcularParticipacaoMarca([])).toEqual(new Map());
  });

  it('ignora categorias que não são ARMACOES', () => {
    const r = calcularParticipacaoMarca(MOCK);
    expect(r.has('ZEISS')).toBe(false);
  });

  it('marca sem vendas tem participacao = 0', () => {
    const r = calcularParticipacaoMarca(MOCK);
    const gen = r.get('GENÉRICA')!;
    expect(gen.participacao).toBe(0);
    expect(gen.pecasVendidas).toBe(0);
    expect(gen.faturamento).toBe(0);
  });

  it('pctPecas correto para RAYBAN: 60/100 = 0.6', () => {
    const r = calcularParticipacaoMarca(MOCK);
    const rb = r.get('RAYBAN')!;
    expect(rb.pctPecas).toBeCloseTo(60 / 100, 10);
  });

  it('pctFaturamento correto para RAYBAN: 6000/12000 = 0.5', () => {
    const r = calcularParticipacaoMarca(MOCK);
    const rb = r.get('RAYBAN')!;
    expect(rb.pctFaturamento).toBeCloseTo(6000 / 12000, 10);
  });

  it('participacao RAYBAN = 0.6*0.6 + 0.4*0.5 = 0.56', () => {
    const r = calcularParticipacaoMarca(MOCK);
    const rb = r.get('RAYBAN')!;
    expect(rb.participacao).toBeCloseTo(0.6 * 0.6 + 0.4 * 0.5, 10);
  });

  it('soma das participacoes = 1 (excluindo marcas sem vendas)', () => {
    const r = calcularParticipacaoMarca(MOCK);
    let soma = 0;
    for (const [, v] of r) soma += v.participacao;
    expect(soma).toBeCloseTo(1, 10);
  });

  it('marca dominante (100% vendas) tem participacao = 1', () => {
    const itens = [{ marca: 'UNICA', qtdVendidos: 50, totalVendido: 5000, categoria: 'ARMACOES' as const }];
    const r = calcularParticipacaoMarca(itens);
    expect(r.get('UNICA')!.participacao).toBeCloseTo(1, 10);
  });

  it('marca sem categoria é tratada como ARMACOES (compatibilidade)', () => {
    const itens = [{ marca: 'X', qtdVendidos: 10, totalVendido: 100 }];
    const r = calcularParticipacaoMarca(itens);
    expect(r.has('X')).toBe(true);
  });

  it('nomes de marca são trimados', () => {
    const itens = [
      { marca: ' RAYBAN ', qtdVendidos: 10, totalVendido: 100, categoria: 'ARMACOES' as const },
    ];
    const r = calcularParticipacaoMarca(itens);
    expect(r.has('RAYBAN')).toBe(true);
    expect(r.has(' RAYBAN ')).toBe(false);
  });

  it('valores negativos de qtdVendidos são tratados como 0', () => {
    const itens = [
      { marca: 'A', qtdVendidos: -5, totalVendido: 100, categoria: 'ARMACOES' as const },
      { marca: 'B', qtdVendidos: 10, totalVendido: 200, categoria: 'ARMACOES' as const },
    ];
    const r = calcularParticipacaoMarca(itens);
    // A não tem peças vendidas (0 após max(0,-5))
    // pctPecas_A = 0/10 = 0; pctFat_A = 100/300 = 0.333
    const a = r.get('A')!;
    expect(a.pctPecas).toBe(0);
    expect(a.pctFaturamento).toBeCloseTo(100 / 300, 10);
  });

  it('snapshot', () => {
    expect(Array.from(calcularParticipacaoMarca(MOCK).entries())).toMatchSnapshot();
  });
});
