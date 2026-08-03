// Pagamento unificado com memória dos componentes.
//
// Caso que motivou: boleto de despesa de ocupação que embute aluguel, IPTU e
// condomínio. O pagamento é um só; o DRE precisa continuar sabendo quanto foi
// de cada coisa.
import { describe, it, expect } from 'vitest';
import {
  validarAgrupamento,
  ratearValorPago,
  descricaoPagador,
} from '../../../../supabase/functions/_shared/rateio';

const comp = (over: Partial<Parameters<typeof validarAgrupamento>[0][number]> = {}) => ({
  id: 'c1', cod_empresa: 2, status: 'PREVISTO', valor: 100, lancamento_pai_id: null,
  descricao: 'Aluguel', ...over,
});

const OCUPACAO = [
  comp({ id: 'aluguel', valor: 4000, descricao: 'Aluguel' }),
  comp({ id: 'iptu', valor: 800, descricao: 'IPTU' }),
  comp({ id: 'condominio', valor: 200, descricao: 'Condomínio' }),
];

describe('validarAgrupamento', () => {
  it('aceita componentes elegíveis e devolve a soma', () => {
    const r = validarAgrupamento(OCUPACAO, null);
    expect(r.ok).toBe(true);
    expect(r.soma).toBe(5000);
  });

  it('fecha quando a soma bate com o valor do boleto', () => {
    const r = validarAgrupamento(OCUPACAO, 5000);
    expect(r.ok).toBe(true);
    expect(r.diferenca).toBe(0);
  });

  it('recusa quando a soma não explica o valor cobrado, dizendo quanto falta', () => {
    const r = validarAgrupamento(OCUPACAO, 5150);
    expect(r.ok).toBe(false);
    expect(r.diferenca).toBe(150);
    expect(r.motivo).toMatch(/não fecha/);
    expect(r.motivo).toMatch(/150\.00/);
  });

  it('exige ao menos dois lançamentos', () => {
    expect(validarAgrupamento([comp()], null).motivo).toMatch(/ao menos dois/);
  });

  it('recusa mistura de empresas', () => {
    const r = validarAgrupamento([comp({ id: 'a' }), comp({ id: 'b', cod_empresa: 9 })], null);
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/mesma empresa/);
  });

  it('recusa lançamento que já compõe outro pagamento', () => {
    const r = validarAgrupamento(
      [comp({ id: 'a' }), comp({ id: 'b', lancamento_pai_id: 'outro', descricao: 'IPTU' })],
      null,
    );
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/IPTU.*já faz parte/);
  });

  it('recusa lançamento que já entrou em borderô', () => {
    const r = validarAgrupamento(
      [comp({ id: 'a' }), comp({ id: 'b', status: 'AUTORIZADO', descricao: 'Energia' })],
      null,
    );
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/Energia.*AUTORIZADO/);
  });
});

describe('ratearValorPago', () => {
  it('distribui proporcionalmente quando o pago é igual ao previsto', () => {
    const r = ratearValorPago(OCUPACAO.map(c => ({ id: c.id, valor: c.valor })), 5000);
    expect(r).toEqual([
      { id: 'aluguel', valor: 4000 },
      { id: 'iptu', valor: 800 },
      { id: 'condominio', valor: 200 },
    ]);
  });

  it('distribui juros/multa proporcionalmente', () => {
    const r = ratearValorPago(OCUPACAO.map(c => ({ id: c.id, valor: c.valor })), 5100);
    expect(r.map(x => x.valor)).toEqual([4080, 816, 204]);
    expect(r.reduce((s, x) => s + x.valor, 0)).toBe(5100);
  });

  it('fecha exatamente com o total mesmo quando a proporção não é redonda', () => {
    // 3 partes iguais de 100 sobre 100,01 — 33,34/33,34/33,33 tem que somar certo
    const r = ratearValorPago(
      [{ id: 'a', valor: 100 }, { id: 'b', valor: 100 }, { id: 'c', valor: 100 }],
      100.01,
    );
    const soma = r.reduce((s, x) => s + x.valor, 0);
    expect(Math.round(soma * 100) / 100).toBe(100.01);
  });

  it('absorve o ajuste de centavos do boleto sem sobrar resíduo', () => {
    // Caso Johnson & Johnson: ERP 213,08 → boleto 213,06
    const r = ratearValorPago([{ id: 'a', valor: 113.08 }, { id: 'b', valor: 100 }], 213.06);
    expect(r.reduce((s, x) => s + x.valor, 0)).toBe(213.06);
  });

  it('desconto reduz todas as partes', () => {
    const r = ratearValorPago([{ id: 'a', valor: 800 }, { id: 'b', valor: 200 }], 900);
    expect(r).toEqual([{ id: 'a', valor: 720 }, { id: 'b', valor: 180 }]);
  });

  it('divide igualmente quando não há base de proporção', () => {
    const r = ratearValorPago([{ id: 'a', valor: 0 }, { id: 'b', valor: 0 }], 100);
    expect(r.reduce((s, x) => s + x.valor, 0)).toBe(100);
  });

  it('lista vazia devolve lista vazia', () => {
    expect(ratearValorPago([], 100)).toEqual([]);
  });
});

describe('descricaoPagador', () => {
  it('usa o favorecido quando conhecido', () => {
    expect(descricaoPagador(OCUPACAO, 'Imobiliária XYZ')).toBe('Imobiliária XYZ — 3 itens');
  });

  it('cai num rótulo genérico sem favorecido', () => {
    expect(descricaoPagador(OCUPACAO, null)).toBe('Pagamento unificado — 3 itens');
  });
});
