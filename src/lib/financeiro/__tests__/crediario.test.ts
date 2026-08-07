// Testes do Crediário Loja — parcelas rigorosamente como aprovadas.
import { describe, it, expect } from 'vitest';
import {
  gerarParcelasBoleto,
  somarMeses,
  sanitizarCpf,
  podeDisparar,
} from '../../../../supabase/functions/_shared/crediario';

describe('somarMeses', () => {
  it('preserva o dia e rola meses', () => {
    expect(somarMeses('2026-08-10', 0)).toBe('2026-08-10');
    expect(somarMeses('2026-08-10', 1)).toBe('2026-09-10');
    expect(somarMeses('2026-11-10', 3)).toBe('2027-02-10');
  });
  it('clampa em mês curto (31 → fev)', () => {
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(somarMeses('2028-01-31', 1)).toBe('2028-02-29'); // bissexto
    expect(somarMeses('2026-01-31', 2)).toBe('2026-03-31');
  });
});

describe('gerarParcelasBoleto', () => {
  it('gera o carnê exatamente como aprovado (3× 250,00)', () => {
    const p = gerarParcelasBoleto({
      valor_total: 750, parcelas: 3, valor_parcela: 250, primeiro_vencimento: '2026-09-10',
    });
    expect(p).toHaveLength(3);
    expect(p.map((x) => x.valor)).toEqual([250, 250, 250]);
    expect(p.map((x) => x.vencimento)).toEqual(['2026-09-10', '2026-10-10', '2026-11-10']);
  });

  it('última parcela ajusta os centavos para a soma bater com o total', () => {
    // 3× 333,33 = 999,99 — total aprovado 1000,00 → última vira 333,34
    const p = gerarParcelasBoleto({
      valor_total: 1000, parcelas: 3, valor_parcela: 333.33, primeiro_vencimento: '2026-09-05',
    });
    expect(p.map((x) => x.valor)).toEqual([333.33, 333.33, 333.34]);
    expect(p.reduce((s, x) => s + x.valor, 0)).toBeCloseTo(1000, 2);
  });

  it('parcela única', () => {
    const p = gerarParcelasBoleto({
      valor_total: 199.9, parcelas: 1, valor_parcela: 199.9, primeiro_vencimento: '2026-08-20',
    });
    expect(p).toEqual([{ numero: 1, valor: 199.9, vencimento: '2026-08-20' }]);
  });

  it('rejeita liberação inconsistente (parcelas × valor longe do total)', () => {
    expect(() => gerarParcelasBoleto({
      valor_total: 1000, parcelas: 3, valor_parcela: 250, primeiro_vencimento: '2026-09-10',
    })).toThrow(/inconsistente/);
  });

  it('rejeita parâmetros inválidos', () => {
    expect(() => gerarParcelasBoleto({ valor_total: 100, parcelas: 0, valor_parcela: 100, primeiro_vencimento: '2026-09-10' })).toThrow(/parcelas/);
    expect(() => gerarParcelasBoleto({ valor_total: 100, parcelas: 40, valor_parcela: 2.5, primeiro_vencimento: '2026-09-10' })).toThrow(/parcelas/);
    expect(() => gerarParcelasBoleto({ valor_total: -1, parcelas: 1, valor_parcela: -1, primeiro_vencimento: '2026-09-10' })).toThrow(/positivos/);
    expect(() => gerarParcelasBoleto({ valor_total: 100, parcelas: 1, valor_parcela: 100, primeiro_vencimento: '10/09/2026' })).toThrow(/vencimento/);
  });
});

describe('sanitizarCpf', () => {
  it('aceita com máscara e devolve 11 dígitos', () => {
    expect(sanitizarCpf('123.456.789-09')).toBe('12345678909');
  });
  it('rejeita tamanho errado', () => {
    expect(() => sanitizarCpf('123456')).toThrow(/CPF/);
    expect(() => sanitizarCpf('12.345.678/0001-99')).toThrow(/CPF/); // CNPJ não passa
  });
});

describe('podeDisparar', () => {
  const hoje = '2026-08-07';
  it('LIBERADO e dentro da validade → ok', () => {
    expect(podeDisparar({ status: 'LIBERADO', validade: '2026-08-31' }, hoje).ok).toBe(true);
    expect(podeDisparar({ status: 'LIBERADO', validade: null }, hoje).ok).toBe(true);
  });
  it('já emitido / cancelado → bloqueia', () => {
    expect(podeDisparar({ status: 'BOLETOS_EMITIDOS' }, hoje).ok).toBe(false);
    expect(podeDisparar({ status: 'CANCELADO' }, hoje).ok).toBe(false);
  });
  it('expirada → bloqueia com motivo claro', () => {
    const r = podeDisparar({ status: 'LIBERADO', validade: '2026-08-01' }, hoje);
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/expirou/);
  });
});
