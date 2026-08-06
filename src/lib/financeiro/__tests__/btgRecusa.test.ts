// Tradução da recusa do BTG — o payload de referência é o real, do
// payments.invalidated que a Johnson gerou em 04/08 (boleto com juros).
import { describe, it, expect } from 'vitest';
import { lerRecusaBtg, traduzirErroBtg } from '../../../../supabase/functions/_shared/btgRecusa';
import { normStatus, motivoRecusa } from '../../../../supabase/functions/_shared/btgEventos';

const PAYLOAD_REAL = {
  type: 'BANKSLIP',
  amount: 213.06,
  status: 'INVALIDATED',
  paymentId: 'd26561ba-7e56-4635-bd18-4aa8293db059',
  detail: { totalAmount: 217.46, dueDate: '2026-08-02' },
  errors: [{ code: 'payment-amount-changed', arguments: { totalAmount: '217.46' } }],
};

describe('normStatus com o vocabulário real do BTG', () => {
  it('INVALIDATED é falha (antes ficava PENDENTE para sempre)', () => {
    expect(normStatus('INVALIDATED')).toBe('FALHA');
  });

  it('VALIDATED continua pendente — não confundir com INVALIDATED', () => {
    expect(normStatus('VALIDATED')).toBe('PENDENTE');
  });
});

describe('lerRecusaBtg', () => {
  it('traduz o código do payload real com o valor atualizado', () => {
    const r = lerRecusaBtg(PAYLOAD_REAL)!;
    expect(r.codigo).toBe('payment-amount-changed');
    expect(r.motivo).toContain('217,46');
    expect(r.motivo.toLowerCase()).toContain('valor');
    expect(r.como_resolver).toBeTruthy();
  });

  it('não usa a descrição do pagamento como motivo', () => {
    // Regressão: um salário recusado aparecia com motivo "Salario 2026 07".
    expect(lerRecusaBtg({ status: 'FAILED', description: 'Salario 2026 07' })).toBeNull();
  });

  it('junta múltiplos erros', () => {
    const r = lerRecusaBtg({
      status: 'REJECTED',
      errors: [{ code: 'insufficient-funds' }, { code: 'out-of-time-limit' }],
    })!;
    expect(r.motivo).toContain('Saldo insuficiente');
    expect(r.motivo).toContain('horário-limite');
  });

  it('código desconhecido vira texto legível em vez de sumir', () => {
    const r = traduzirErroBtg({ code: 'some-new-btg-code' })!;
    expect(r.codigo).toBe('some-new-btg-code');
    expect(r.motivo).toBe('Some new btg code');
    expect(r.como_resolver).toBeUndefined();
  });

  it('cai no texto livre quando não há errors[]', () => {
    expect(lerRecusaBtg({ status: 'FAILED', reason: 'Conta encerrada' })?.motivo).toBe('Conta encerrada');
  });

  it('não ecoa o próprio status como explicação', () => {
    expect(lerRecusaBtg({ status: 'FAILED', message: 'FAILED' })).toBeNull();
  });

  it('motivoRecusa (usado na baixa) usa a mesma tradução', () => {
    expect(motivoRecusa(PAYLOAD_REAL)).toContain('217,46');
  });
});
