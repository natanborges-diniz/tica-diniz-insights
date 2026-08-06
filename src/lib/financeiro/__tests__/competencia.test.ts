// Competência — o mês que o DRE usa.
//
// O bug que originou isto: o DRE filtrava por data_emissao com >= e <=, e em SQL
// isso descarta NULL. Folha e provisão de rubrica não têm emissão (não há
// documento emitido), então sumiam do relatório inteiro — não caíam no grupo
// errado, simplesmente não existiam.
import { describe, it, expect } from 'vitest';
import {
  competenciaDoLancamento,
  mesesNoIntervalo,
  mesDe,
} from '../../../../supabase/functions/_shared/competencia';

describe('competenciaDoLancamento — quem manda', () => {
  it('o mês decidido vence tudo — julho pago em agosto é julho', () => {
    expect(competenciaDoLancamento({
      competencia: '2026-07',
      data_emissao: '2026-08-01',
      data_vencimento: '2026-08-08',
    })).toBe('2026-07');
  });

  it('encargo de julho que vence em agosto continua sendo julho', () => {
    // FGTS vence dia 7 do mês seguinte; INSS e IRRF, dia 20. O fato gerador é o
    // salário de julho.
    expect(competenciaDoLancamento({
      competencia: '2026-07',
      data_vencimento: '2026-08-07',
    })).toBe('2026-07');
  });

  it('provisão de rubrica usa a competência da provisão', () => {
    expect(competenciaDoLancamento({
      competencia_rubrica: '2026-09',
      data_vencimento: '2026-09-10',
    })).toBe('2026-09');
  });

  it('título do ERP usa a emissão — é o que a casa usa como competência', () => {
    expect(competenciaDoLancamento({
      data_emissao: '2026-07-15',
      data_vencimento: '2026-08-20',
    })).toBe('2026-07');
  });

  it('sem emissão nem decisão, cai no vencimento em vez de sumir do DRE', () => {
    expect(competenciaDoLancamento({ data_vencimento: '2026-08-20' })).toBe('2026-08');
  });

  it('sem data nenhuma, devolve null em vez de inventar mês', () => {
    expect(competenciaDoLancamento({})).toBeNull();
    expect(competenciaDoLancamento({ data_emissao: null, data_vencimento: null })).toBeNull();
  });

  it('valor malformado é ignorado e a próxima fonte assume', () => {
    expect(competenciaDoLancamento({ competencia: 'julho', data_emissao: '2026-07-15' }))
      .toBe('2026-07');
  });
});

describe('mesDe', () => {
  it('corta o dia sem passar por Date — 01/07 não vira 30/06 por fuso', () => {
    expect(mesDe('2026-07-01')).toBe('2026-07');
  });

  it('aceita quem já veio como yyyy-MM', () => {
    expect(mesDe('2026-07')).toBe('2026-07');
  });

  it('recusa lixo', () => {
    expect(mesDe('')).toBeNull();
    expect(mesDe(null)).toBeNull();
    expect(mesDe('07/2026')).toBeNull();
  });
});

describe('mesesNoIntervalo', () => {
  it('devolve os meses inteiros tocados pelo intervalo', () => {
    // 15/07 a 20/08 significa julho e agosto inteiros: recortar por dia daria um
    // "julho" que não é julho, e a soma não bateria com o fechamento.
    expect(mesesNoIntervalo('2026-07-15', '2026-08-20')).toEqual(['2026-07', '2026-08']);
  });

  it('mesmo mês nas duas pontas devolve um mês só', () => {
    expect(mesesNoIntervalo('2026-07-01', '2026-07-31')).toEqual(['2026-07']);
  });

  it('atravessa a virada do ano', () => {
    expect(mesesNoIntervalo('2026-11-01', '2027-02-28'))
      .toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });

  it('intervalo invertido devolve vazio em vez de laço infinito', () => {
    expect(mesesNoIntervalo('2026-08-01', '2026-07-01')).toEqual([]);
  });

  it('data inválida devolve vazio', () => {
    expect(mesesNoIntervalo('', '2026-07-01')).toEqual([]);
  });

  it('doze meses fecham um exercício', () => {
    expect(mesesNoIntervalo('2026-01-01', '2026-12-31')).toHaveLength(12);
  });
});
