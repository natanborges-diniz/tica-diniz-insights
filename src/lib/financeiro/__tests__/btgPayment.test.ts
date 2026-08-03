// Testes do construtor de payload da API de Pagamentos do BTG.
//
// Bug real coberto: até 03/08/2026 o envio de borderô montava o item como
// `{ type, amount, details, scheduledDate }` e postava numa rota inexistente
// (.../batch-payments/{id}/payments), resultando em 500 genérico
// `btg:enterprise:banking:payments:error:unexpected-error` — o código que o BTG
// usa quando não consegue classificar a falha.
//
// Contrato correto (reference/post_companyid-banking-payments):
//   { items: [ { type, detail, amount, paymentDate, debitParty, batchId? } ] }
import { describe, it, expect } from 'vitest';
import {
  montarItem,
  montarCorpo,
  montarDetail,
  sanitizarDescricao,
  normalizarTaxId,
  normalizarTipoConta,
  chaveIdempotencia,
  descreverErroBtg,
} from '../../../../supabase/functions/_shared/btgPayment';

const DEBIT = { branchCode: '50', number: '000000050' };
const CNPJ = '30306294000145';
const CPF = '12345678909';

// Boleto real (Luxottica, Santander 033, venc 07/08/2026, R$ 15,96)
const LINHA_LUXOTTICA = '03399940308090000198584636301016415310000001596';

function base(over: Record<string, unknown> = {}) {
  return {
    tipo: 'PIX_KEY',
    valor: 100.5,
    dados: { chave_pix: CNPJ, nome: 'Fornecedor SA', documento: CNPJ },
    debitParty: DEBIT,
    paymentDate: '2026-08-10',
    ...over,
  } as Parameters<typeof montarItem>[0];
}

describe('montarItem — contrato do item', () => {
  it('usa detail no SINGULAR (o plural causava 500 genérico)', () => {
    const item = montarItem(base());
    expect(item).toHaveProperty('detail');
    expect(item).not.toHaveProperty('details');
  });

  it('inclui os três campos obrigatórios: amount, debitParty e paymentDate', () => {
    const item = montarItem(base());
    expect(item.amount).toBe(100.5);
    expect(item.paymentDate).toBe('2026-08-10');
    expect(item.debitParty).toEqual({ branchCode: '50', number: '000000050' });
  });

  it('nunca emite scheduledDate (campo só existe nos webhooks de saída)', () => {
    const item = montarItem(base());
    expect(item).not.toHaveProperty('scheduledDate');
  });

  it('com batchId, vincula ao lote e omite agreementId', () => {
    const item = montarItem(base({ batchId: 'b-123' }));
    expect(item.batchId).toBe('b-123');
    expect(item).not.toHaveProperty('agreementId');
  });

  it('sem batchId, é avulso e exige agreementId INDIVIDUAL_APPROVE', () => {
    const item = montarItem(base());
    expect(item.agreementId).toBe('INDIVIDUAL_APPROVE');
    expect(item).not.toHaveProperty('batchId');
  });

  it('leva tags.externalId — âncora de conciliação, já que o 201 não traz paymentId', () => {
    const item = montarItem(base({ externalId: 'lanc-abc' }));
    expect(item.tags).toEqual({ externalId: 'lanc-abc' });
  });

  it('envelopa em { items: [...] } com um único pagamento por requisição', () => {
    const corpo = montarCorpo(montarItem(base()));
    expect(Object.keys(corpo)).toEqual(['items']);
    expect(corpo.items).toHaveLength(1);
  });

  it('rejeita valor <= 0 antes de chegar ao banco', () => {
    expect(() => montarItem(base({ valor: 0 }))).toThrow(/maior que 0/);
  });

  it('rejeita paymentDate fora de yyyy-MM-dd', () => {
    expect(() => montarItem(base({ paymentDate: '10/08/2026' }))).toThrow(/yyyy-MM-dd/);
  });

  it('rejeita conta de débito não cadastrada', () => {
    expect(() => montarItem(base({ debitParty: { branchCode: '50', number: '' } })))
      .toThrow(/debitParty/);
  });

  it('rejeita tipo desconhecido', () => {
    expect(() => montarItem(base({ tipo: 'BOLETO' }))).toThrow(/não suportado/);
  });
});

describe('montarDetail — shape por tipo', () => {
  it('PIX_KEY usa key.value + creditParty (não o campo plano pixKey)', () => {
    const d = montarDetail('PIX_KEY', { chave_pix: CNPJ, nome: 'ACME', documento: CNPJ });
    expect(d).toEqual({ key: { value: CNPJ }, creditParty: { name: 'ACME', taxId: CNPJ } });
    expect(d).not.toHaveProperty('pixKey');
  });

  it('PIX_KEY sem dados do titular ainda monta (creditParty é opcional)', () => {
    expect(montarDetail('PIX_KEY', { chave_pix: 'a@b.com' })).toEqual({ key: { value: 'a@b.com' } });
  });

  it('TED aninha creditParty.account com type CC/PG/PP', () => {
    const d = montarDetail('TED', {
      nome: 'ACME', documento: CNPJ, banco: '33', agencia: '1234', conta: '567890',
      tipo_conta: 'CHECKING',
    }) as Record<string, Record<string, Record<string, string>>>;
    expect(d.creditParty.account).toEqual({
      type: 'CC', number: '567890', branch: '1234', bankCode: '033',
    });
  });

  it('TED sem dados da conta falha localmente, com mensagem legível', () => {
    expect(() => montarDetail('TED', { nome: 'ACME', documento: CNPJ }))
      .toThrow(/banco é obrigatório/);
  });

  it('BANKSLIP manda digitableLine e recusa linha de arrecadação', () => {
    expect(montarDetail('BANKSLIP', { linha_digitavel: LINHA_LUXOTTICA }))
      .toEqual({ digitableLine: LINHA_LUXOTTICA });
    expect(() => montarDetail('BANKSLIP', { linha_digitavel: '8'.repeat(48) }))
      .toThrow(/UTILITIES/);
  });

  it('UTILITIES aceita digitableLine de 48', () => {
    const linha = '8'.repeat(48);
    expect(montarDetail('UTILITIES', { linha_digitavel: linha })).toEqual({ digitableLine: linha });
  });

  it('DARF usa taxPayer/expireDate/principalAmount/baselinePeriodDate/treasuryRevenueCode', () => {
    const d = montarDetail('DARF', {
      cnpj: CNPJ, nome: 'ACME LTDA', codigo_receita: '211',
      valor_principal: '150.75', data_vencimento: '2026-08-20',
      periodo_apuracao: '2026-07-31',
    });
    expect(d).toMatchObject({
      taxPayer: { id: CNPJ, name: 'ACME LTDA' },
      treasuryRevenueCode: '0211',
      principalAmount: 150.75,
      expireDate: '2026-08-20',
      baselinePeriodDate: '2026-07-31',
    });
    expect(d).not.toHaveProperty('revenueCode');
    expect(d).not.toHaveProperty('dueDate');
  });

  it('PIX_REVERSAL exige originalEndToEndId (antes caía no default cru)', () => {
    expect(montarDetail('PIX_REVERSAL', { end_to_end_id: 'E30306294...' }))
      .toEqual({ originalEndToEndId: 'E30306294...' });
    expect(() => montarDetail('PIX_REVERSAL', {})).toThrow(/originalEndToEndId/);
  });
});

describe('sanitizarDescricao', () => {
  it('remove acentos e pontuação — só letras, números e espaços passam', () => {
    expect(sanitizarDescricao('Borderô Semana 10/08/2026 — 2'))
      .toBe('Bordero Semana 10 08 2026 2');
  });

  it('trunca em 140 caracteres', () => {
    expect(sanitizarDescricao('a'.repeat(200))).toHaveLength(140);
  });

  it('devolve string vazia para nulo', () => {
    expect(sanitizarDescricao(null)).toBe('');
  });
});

describe('normalizações', () => {
  it('aceita CPF (11) e CNPJ (14), rejeita o resto', () => {
    expect(normalizarTaxId('303.062.940-01'.replace(/\D/g, '').padEnd(11, '0'))).toHaveLength(11);
    expect(normalizarTaxId('30.306.294/0001-45')).toBe(CNPJ);
    expect(() => normalizarTaxId('123')).toThrow(/CPF \(11\) ou CNPJ/);
  });

  it('mapeia tipos de conta legados para CC/PG/PP', () => {
    expect(normalizarTipoConta('CHECKING')).toBe('CC');
    expect(normalizarTipoConta('poupanca')).toBe('PP');
    expect(normalizarTipoConta('PAGAMENTO')).toBe('PG');
    expect(normalizarTipoConta('')).toBe('CC');
    expect(() => normalizarTipoConta('CORRENTE_ESPECIAL')).toThrow(/não suportado/);
  });
});

describe('chaveIdempotencia', () => {
  it('é determinística: mesmo lote + lançamento → mesma chave (não duplica)', async () => {
    const a = await chaveIdempotencia('lote-1', 'lanc-1');
    const b = await chaveIdempotencia('lote-1', 'lanc-1');
    expect(a).toBe(b);
  });

  it('lote novo → chave nova, para que o reenvio após correção reprocesse', async () => {
    const a = await chaveIdempotencia('lote-1', 'lanc-1');
    const b = await chaveIdempotencia('lote-2', 'lanc-1');
    expect(a).not.toBe(b);
  });

  it('tem formato de uuid v5', async () => {
    const k = await chaveIdempotencia('x', 'y');
    expect(k).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('descreverErroBtg', () => {
  it('extrai detail + código curto de { data: { errors: [...] } }', () => {
    const corpo = {
      data: {
        errors: [{
          code: 'btg:enterprise:banking:payments:error:insufficient-balance',
          detail: 'Erro ao efetuar o pagamento. Saldo insuficiente.',
        }],
      },
    };
    expect(descreverErroBtg(corpo))
      .toBe('Erro ao efetuar o pagamento. Saldo insuficiente. (insufficient-balance)');
  });

  it('lida com data como array (operações em lote)', () => {
    const corpo = { data: [{ errors: [{ code: 'x:y:batch-not-found', detail: 'Lote não encontrado.' }] }] };
    expect(descreverErroBtg(corpo)).toBe('Lote não encontrado. (batch-not-found)');
  });

  it('degrada para o corpo cru quando o formato é outro', () => {
    expect(descreverErroBtg('Bad Gateway')).toBe('Bad Gateway');
  });
});
