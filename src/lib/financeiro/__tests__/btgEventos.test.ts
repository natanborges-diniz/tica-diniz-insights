// Testes do processamento de eventos BTG (E5 — SPEC_P1_CONCILIACAO_3VIAS.md §5.3)
// Só as partes puras: classificação de evento e normalização de status/valor/data.
import { describe, it, expect } from 'vitest';
import {
  classificarEvento,
  normStatus,
  extractAmount,
  extractDate,
} from '../../../../supabase/functions/_shared/btgEventos';

describe('classificarEvento', () => {
  it('classifica pagamentos por event_type', () => {
    expect(classificarEvento('payment.completed', {})).toBe('PAGAMENTO');
    expect(classificarEvento('PIX_SENT', {})).toBe('PAGAMENTO');
    expect(classificarEvento('batch-payment.updated', {})).toBe('PAGAMENTO');
    expect(classificarEvento('TED_EXECUTED', {})).toBe('PAGAMENTO');
  });

  it('classifica cobranças por event_type', () => {
    expect(classificarEvento('collection.paid', {})).toBe('COBRANCA');
    expect(classificarEvento('BOLETO_SETTLED', {})).toBe('COBRANCA');
    expect(classificarEvento('invoice.updated', {})).toBe('COBRANCA');
  });

  it('classifica DDA', () => {
    expect(classificarEvento('dda.new', {})).toBe('DDA');
  });

  it('cobre os grupos reais do painel BTG', () => {
    expect(classificarEvento('payments.approval-authorized', {})).toBe('PAGAMENTO');
    expect(classificarEvento('transfers.failed', {})).toBe('PAGAMENTO');
    expect(classificarEvento('automatic-pix.paid', {})).toBe('PAGAMENTO');
    expect(classificarEvento('bank-slips.paid', {})).toBe('COBRANCA');
    expect(classificarEvento('collections.settled', {})).toBe('COBRANCA');
    expect(classificarEvento('instant-collections.paid', {})).toBe('COBRANCA');
    expect(classificarEvento('authorized-direct-debits.created', {})).toBe('DDA');
  });

  it('cai no payload quando o event_type não ajuda', () => {
    expect(classificarEvento('desconhecido', { paymentId: 'abc' })).toBe('PAGAMENTO');
    expect(classificarEvento('desconhecido', { collectionId: 'abc' })).toBe('COBRANCA');
    expect(classificarEvento('desconhecido', {})).toBe('DESCONHECIDO');
  });

  it('PAYMENT tem precedência sobre campos do payload', () => {
    expect(classificarEvento('collection.paid', { paymentId: 'x' })).toBe('COBRANCA');
  });
});

describe('normStatus (vocabulário tolerante — pendência #1 da spec)', () => {
  it('reconhece variações de pago', () => {
    for (const s of ['PAID', 'paid', 'Completed', 'EXECUTED', 'SETTLED', 'LIQUIDATED']) {
      expect(normStatus(s)).toBe('PAGO');
    }
  });

  it('reconhece variações de falha', () => {
    for (const s of ['REJECTED', 'refused', 'FAILED', 'CANCELLED', 'CANCELED', 'RETURNED']) {
      expect(normStatus(s)).toBe('FALHA');
    }
  });

  it('resto é pendente (não dispara efeito)', () => {
    expect(normStatus('PROCESSING')).toBe('PENDENTE');
    expect(normStatus('PENDING_APPROVAL')).toBe('PENDENTE');
    expect(normStatus(undefined)).toBe('PENDENTE');
    expect(normStatus('')).toBe('PENDENTE');
  });

  it('CANCELLED não vira PAGO apesar de conter "LED"… (regressão de substring)', () => {
    // FAILED_WORDS é checado antes de PAID_WORDS
    expect(normStatus('CANCELLED')).toBe('FALHA');
  });
});

describe('extractAmount / extractDate', () => {
  it('extrai valor de formatos numéricos e aninhados', () => {
    expect(extractAmount({ amount: 150.5 })).toBe(150.5);
    expect(extractAmount({ amountPaid: 99 })).toBe(99);
    expect(extractAmount({ amount: { amount: 42, currency: 'BRL' } })).toBe(42);
    expect(extractAmount({})).toBeNull();
  });

  it('amountPaid tem precedência sobre amount', () => {
    expect(extractAmount({ amountPaid: 10, amount: 20 })).toBe(10);
  });

  it('extrai data com fallback', () => {
    expect(extractDate({ executedAt: '2026-07-15T10:00:00Z' }, '2026-07-28')).toBe('2026-07-15');
    expect(extractDate({ paymentDate: '2026-07-10' }, '2026-07-28')).toBe('2026-07-10');
    expect(extractDate({}, '2026-07-28')).toBe('2026-07-28');
  });
});
