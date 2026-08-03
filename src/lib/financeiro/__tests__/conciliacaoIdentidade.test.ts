// F0 — conciliação por identidade.
//
// A pergunta que originou isto: se o retorno do pagamento já diz qual boleto foi
// pago, por que a conciliação redescobre isso por valor e data? Redescobria
// porque a informação era jogada fora — a baixa via webhook não gravava
// paymentId nem endToEndId, e o pool de candidatos não carregava identificador
// nenhum. Sobrava adivinhar.
import { describe, it, expect } from 'vitest';
import {
  matchEntry,
  extrairReferencias,
  referenciasDoLancamento,
  referenciasCasam,
  normalizarReferencia,
  type ExtratoEntry,
  type Pools,
  type CandidatoForte,
} from '../../../../supabase/functions/_shared/conciliacaoMotor';

// E(1) + ISPB(8) + yyyyMMddHHmm(12) + sufixo(11) = 32 caracteres.
const E2E = 'E30306294202608041200ABCDEFGHIJK';
const LANC_A = '459b5741-1111-4222-8333-444455556666';
const LANC_B = '5a600998-9999-4888-8777-666655554444';

function poolsVazias(fortes: CandidatoForte[] = []): Pools {
  return { fortes, recebiveis: [], lancamentos: [], regras: [] };
}

function entrada(over: Partial<ExtratoEntry> = {}): ExtratoEntry {
  return {
    id: 'x-1',
    cod_empresa: 16,
    data_lancamento: '2026-08-04',
    descricao: 'PAGAMENTO BOLETO',
    valor: 122.6,
    tipo: 'DEBITO',
    ...over,
  };
}

describe('extrairReferencias — o que o extrato carrega', () => {
  it('acha identificadores aninhados no payload do BTG', () => {
    const refs = extrairReferencias({ data: { payment: { endToEndId: E2E, paymentId: 'pay-12345678' } } });
    expect(refs).toContain(E2E.toUpperCase());
    expect(refs).toContain('PAY-12345678');
  });

  it('acha o E2E embutido na descrição, fora de campo nomeado', () => {
    expect(extrairReferencias({ description: `PIX ENVIADO ${E2E}` })).toContain(E2E.toUpperCase());
  });

  it('acha o externalId (uuid do lançamento) devolvido pelo banco', () => {
    expect(extrairReferencias({ tags: { externalId: LANC_A } })).toContain(LANC_A.toUpperCase());
  });

  it('ignora valor curto demais para identificar — banco, agência, "OK"', () => {
    const refs = extrairReferencias({ transactionId: '33', paymentId: 'OK' });
    expect(refs).toEqual([]);
  });

  it('payload nulo não quebra', () => {
    expect(extrairReferencias(null)).toEqual([]);
  });
});

describe('referenciasDoLancamento — o que sabemos do nosso lado', () => {
  it('inclui o próprio id, porque é o externalId que enviamos ao banco', () => {
    expect(referenciasDoLancamento(LANC_A, null)).toEqual([LANC_A.toUpperCase()]);
  });

  it('junta o que a baixa gravou: paymentId, E2E e código de autenticação', () => {
    const refs = referenciasDoLancamento(LANC_A, {
      btg_payment_id: 'pay-12345678',
      btg_end_to_end_id: E2E,
      btg_authentication_code: 'AUTH-987654321',
    });
    expect(refs).toEqual(expect.arrayContaining(['PAY-12345678', E2E.toUpperCase(), 'AUTH-987654321']));
  });

  it('não repete identificador já presente em btg_referencias', () => {
    const refs = referenciasDoLancamento(LANC_A, {
      btg_referencias: ['PAY-12345678'],
      btg_payment_id: 'pay-12345678',
    });
    expect(refs.filter((r) => r === 'PAY-12345678')).toHaveLength(1);
  });
});

describe('referenciasCasam', () => {
  it('lado vazio nunca casa — ausência de dado não é coincidência', () => {
    expect(referenciasCasam([], ['PAY-12345678'])).toBe(false);
    expect(referenciasCasam(undefined, undefined)).toBe(false);
  });

  it('basta um identificador em comum', () => {
    expect(referenciasCasam(['A-11111111', 'PAY-12345678'], ['PAY-12345678'])).toBe(true);
  });
});

describe('matchEntry — F0 vence as fases por valor', () => {
  it('casa por identificador mesmo com valor e data divergentes', () => {
    // O débito saiu com o valor do título registrado (R$ 130,00), não o do ERP
    // (R$ 122,60), e num dia diferente do combinado. F1 nunca fecharia.
    const cand: CandidatoForte = {
      alvo_tipo: 'LANCAMENTO', id: LANC_A, valor: 122.6, data: '2026-08-01',
      label: 'Em trânsito no borderô', referencias: [E2E],
    };
    const r = matchEntry(
      entrada({ valor: 130.0, data_lancamento: '2026-08-06', referencias: [E2E] }),
      poolsVazias([cand]),
      new Set(),
    );
    expect(r.status).toBe('MATCH');
    expect(r.metodo).toBe('IDENTIDADE');
    expect(r.alocacoes?.[0].alvo_id).toBe(LANC_A);
    // A linha do extrato manda no valor alocado: é o que saiu da conta.
    expect(r.alocacoes?.[0].valor_alocado).toBe(130.0);
  });

  it('desempata dois boletos de mesmo valor e mesmo dia — o caso que ia para a fila', () => {
    const comuns = { alvo_tipo: 'LANCAMENTO' as const, valor: 122.6, data: '2026-08-04', label: 'Borderô' };
    const r = matchEntry(
      entrada({ referencias: ['PAY-22222222'] }),
      poolsVazias([
        { ...comuns, id: LANC_A, referencias: ['PAY-11111111'] },
        { ...comuns, id: LANC_B, referencias: ['PAY-22222222'] },
      ]),
      new Set(),
    );
    expect(r.metodo).toBe('IDENTIDADE');
    expect(r.alocacoes?.[0].alvo_id).toBe(LANC_B);
  });

  it('sem identificador no extrato, o comportamento antigo continua valendo', () => {
    const cand: CandidatoForte = {
      alvo_tipo: 'LANCAMENTO', id: LANC_A, valor: 122.6, data: '2026-08-04',
      label: 'Borderô', referencias: ['PAY-11111111'],
    };
    const r = matchEntry(entrada(), poolsVazias([cand]), new Set());
    expect(r.status).toBe('MATCH');
    expect(r.metodo).toBe('EXATO'); // F1, por valor e data
  });

  it('candidato já usado não casa nem por identidade', () => {
    const cand: CandidatoForte = {
      alvo_tipo: 'LANCAMENTO', id: LANC_A, valor: 122.6, data: '2026-08-04',
      label: 'Borderô', referencias: [E2E],
    };
    const r = matchEntry(
      entrada({ referencias: [E2E] }),
      poolsVazias([cand]),
      new Set([`LANCAMENTO|${LANC_A}`]),
    );
    expect(r.status).not.toBe('MATCH');
  });

  it('mesmo identificador em dois alvos é dado inconsistente: sugere, não concilia', () => {
    const comuns = { alvo_tipo: 'LANCAMENTO' as const, valor: 999.0, data: '2026-08-04', label: 'Borderô', referencias: [E2E] };
    const r = matchEntry(
      entrada({ referencias: [E2E] }),
      poolsVazias([{ ...comuns, id: LANC_A }, { ...comuns, id: LANC_B }]),
      new Set(),
    );
    expect(r.status).not.toBe('MATCH');
    expect(r.sugestoes.length).toBeGreaterThanOrEqual(2);
  });
});

describe('normalizarReferencia', () => {
  it('caixa alta e sem espaço nas pontas — os dois lados comparam igual', () => {
    expect(normalizarReferencia('  pay-12345678 ')).toBe('PAY-12345678');
  });

  it('rejeita curto demais e longo demais', () => {
    expect(normalizarReferencia('1234')).toBeNull();
    expect(normalizarReferencia('x'.repeat(200))).toBeNull();
  });
});
