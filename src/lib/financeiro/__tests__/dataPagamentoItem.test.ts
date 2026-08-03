// Data de pagamento de cada item do borderô — os três cenários da operação:
// tudo numa data única, cada um no seu vencimento, e alguns diferentes.
import { describe, it, expect } from 'vitest';
import { dataPagamentoItem } from '../../../../supabase/functions/_shared/agendamento';

const HOJE = '2026-08-03'; // segunda

describe('modo DATA_UNICA (prática da casa)', () => {
  it('agenda tudo na data do borderô', () => {
    expect(dataPagamentoItem({
      modo: 'DATA_UNICA', vencimento: '2026-08-20', dataPagamentoBordero: '2026-08-10', hoje: HOJE,
    })).toBe('2026-08-10');
  });

  it('antecipa para o vencimento quando ele cai antes da data do borderô (sem juros)', () => {
    expect(dataPagamentoItem({
      modo: 'DATA_UNICA', vencimento: '2026-08-06', dataPagamentoBordero: '2026-08-10', hoje: HOJE,
    })).toBe('2026-08-06');
  });

  it('data do borderô igual a hoje → paga hoje', () => {
    expect(dataPagamentoItem({
      modo: 'DATA_UNICA', vencimento: '2026-08-06', dataPagamentoBordero: HOJE, hoje: HOJE,
    })).toBe(HOJE);
  });

  it('é o default quando o modo não vem preenchido (borderôs anteriores à coluna)', () => {
    expect(dataPagamentoItem({
      modo: null, vencimento: '2026-08-20', dataPagamentoBordero: '2026-08-10', hoje: HOJE,
    })).toBe('2026-08-10');
  });
});

describe('modo VENCIMENTO', () => {
  it('agenda cada título no próprio vencimento', () => {
    expect(dataPagamentoItem({
      modo: 'VENCIMENTO', vencimento: '2026-08-20', dataPagamentoBordero: '2026-08-10', hoje: HOJE,
    })).toBe('2026-08-20');
  });

  it('não antecipa nem atrasa por causa da data do borderô', () => {
    expect(dataPagamentoItem({
      modo: 'VENCIMENTO', vencimento: '2026-08-05', dataPagamentoBordero: '2026-08-31', hoje: HOJE,
    })).toBe('2026-08-05');
  });

  it('sem vencimento conhecido, cai na data do borderô', () => {
    expect(dataPagamentoItem({
      modo: 'VENCIMENTO', vencimento: null, dataPagamentoBordero: '2026-08-10', hoje: HOJE,
    })).toBe('2026-08-10');
  });
});

describe('override por item', () => {
  it('vence sobre o modo DATA_UNICA', () => {
    expect(dataPagamentoItem({
      modo: 'DATA_UNICA', override: '2026-08-14', vencimento: '2026-08-20',
      dataPagamentoBordero: '2026-08-10', hoje: HOJE,
    })).toBe('2026-08-14');
  });

  it('vence sobre o modo VENCIMENTO', () => {
    expect(dataPagamentoItem({
      modo: 'VENCIMENTO', override: '2026-08-14', vencimento: '2026-08-20', hoje: HOJE,
    })).toBe('2026-08-14');
  });
});

describe('nunca devolve data no passado', () => {
  // A API exige paymentDate e recusa `past-payment-date`; um título vencido
  // precisa ser pago o quanto antes.
  it('título vencido → hoje', () => {
    expect(dataPagamentoItem({
      modo: 'VENCIMENTO', vencimento: '2026-08-02', hoje: HOJE,
    })).toBe(HOJE);
  });

  it('data do borderô no passado → hoje', () => {
    expect(dataPagamentoItem({
      modo: 'DATA_UNICA', vencimento: '2026-08-20', dataPagamentoBordero: '2026-07-27', hoje: HOJE,
    })).toBe(HOJE);
  });

  it('override no passado → hoje', () => {
    expect(dataPagamentoItem({
      modo: 'DATA_UNICA', override: '2026-07-01', hoje: HOJE,
    })).toBe(HOJE);
  });

  it('sem nenhuma referência → hoje', () => {
    expect(dataPagamentoItem({ hoje: HOJE })).toBe(HOJE);
  });
});
