import { describe, it, expect } from 'vitest';
import {
  normalizarForma,
  isCredito,
  isDevolucao,
  isVendaValida,
  calcularTicketMedio,
} from '../formaPagamento';

describe('normalizarForma', () => {
  it('aplica upper + trim', () => {
    expect(normalizarForma('  credito ')).toBe('CREDITO');
    expect(normalizarForma('Dinheiro')).toBe('DINHEIRO');
  });

  it('tolera null/undefined/vazio', () => {
    expect(normalizarForma(null)).toBe('');
    expect(normalizarForma(undefined)).toBe('');
    expect(normalizarForma('')).toBe('');
  });
});

describe('isCredito', () => {
  it('cobre singular e plural', () => {
    expect(isCredito('CREDITO')).toBe(true);
    expect(isCredito('CREDITOS')).toBe(true);
  });

  it('cobre variações de caixa e espaços (bug F3 da Inteligência)', () => {
    expect(isCredito(' creditos ')).toBe(true);
    expect(isCredito('Credito')).toBe(true);
  });

  it('não confunde com outras formas', () => {
    expect(isCredito('CARTAO DE CREDITO')).toBe(false);
    expect(isCredito('CREDIARIO')).toBe(false);
    expect(isCredito('DINHEIRO')).toBe(false);
    expect(isCredito(null)).toBe(false);
  });
});

describe('isDevolucao', () => {
  it('reconhece DEVOLUCAO com variações de caixa/espaço', () => {
    expect(isDevolucao('DEVOLUCAO')).toBe(true);
    expect(isDevolucao(' devolucao ')).toBe(true);
  });

  it('não confunde com outras formas', () => {
    expect(isDevolucao('DINHEIRO')).toBe(false);
    expect(isDevolucao('')).toBe(false);
  });
});

describe('isVendaValida', () => {
  it('exclui créditos e devoluções', () => {
    expect(isVendaValida('CREDITO')).toBe(false);
    expect(isVendaValida('CREDITOS')).toBe(false);
    expect(isVendaValida('DEVOLUCAO')).toBe(false);
  });

  it('aceita formas normais', () => {
    expect(isVendaValida('DINHEIRO')).toBe(true);
    expect(isVendaValida('CARTAO DE CREDITO')).toBe(true);
    expect(isVendaValida('PIX')).toBe(true);
  });
});

describe('calcularTicketMedio', () => {
  it('divide total sem créditos pela qtd sem créditos', () => {
    expect(calcularTicketMedio(1000, 4)).toBe(250);
  });

  it('retorna 0 sem transações', () => {
    expect(calcularTicketMedio(1000, 0)).toBe(0);
    expect(calcularTicketMedio(0, 0)).toBe(0);
  });
});
