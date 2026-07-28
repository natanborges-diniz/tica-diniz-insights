// Testes do sync ERP→ledger (P2/E2 — SPEC_P2_LEDGER_UNICO.md §2)
import { describe, it, expect } from 'vitest';
import {
  decidirSync,
  montarLancamento,
  autoClassify,
  origemIdErp,
  erpDizPaga,
  type ParcelaCacheRow,
  type PlanoMap,
} from '../../../../supabase/functions/_shared/ledgerSync';

const plano: PlanoMap = new Map([
  ['3.8.2', { grupo_dre: 'CUSTO_MERCADORIA', categoria: 'FORNECEDORES_PRODUTO' }],
  ['3.8', { grupo_dre: 'CUSTO_MERCADORIA', categoria: 'FORNECEDORES_PRODUTO' }],
  ['3.6.1', { grupo_dre: 'DESPESAS_OPERACIONAIS', categoria: 'FINANCEIRO_OPERACIONAL' }],
  ['1.7', { grupo_dre: 'RECEITA_BRUTA', categoria: 'VENDAS' }],
]);

const parcela = (over: Partial<ParcelaCacheRow> = {}): ParcelaCacheRow => ({
  cod_empresa: 1,
  tipo_lancamento: 'PAGAR',
  documento: 'NF 1234',
  pessoa_nome: 'OTICA FORNECEDOR LTDA',
  cod_pessoa: 99,
  data_vencimento: '2026-08-10',
  data_emissao: '2026-07-10',
  data_pagamento: null,
  data_recebimento: null,
  valor: 1500,
  valor_pago: 0,
  situacao: 'EM ABERTO',
  conta_numero: '3.8.2',
  conta_descricao: 'FORNECEDORES ARMACOES',
  forma_pagamento_tipo: 'BOLETO',
  cod_lancamento: 555,
  parcela_id: 777,
  ...over,
});

describe('origemIdErp / erpDizPaga', () => {
  it('monta a chave dura estável', () => {
    expect(origemIdErp(13, 98765)).toBe('ERP:13:98765');
  });

  it('PAGA por situacao ou por data_pagamento', () => {
    expect(erpDizPaga(parcela({ situacao: 'PAGA' }))).toBe(true);
    expect(erpDizPaga(parcela({ data_pagamento: '2026-07-20' }))).toBe(true);
    expect(erpDizPaga(parcela())).toBe(false);
  });
});

describe('autoClassify (plano de contas com fallback de prefixo)', () => {
  it('match exato → CMV para fornecedor de produto', () => {
    const r = autoClassify(plano, 'PAGAR', '3.8.2', 'FORNECEDORES ARMACOES');
    expect(r.natureza).toBe('CUSTO_MERCADORIA');
    expect(r.categoria).toBe('FORNECEDORES_PRODUTO');
  });

  it('fallback de prefixo: 3.8.99 → 3.8', () => {
    const r = autoClassify(plano, 'PAGAR', '3.8.99', 'FORNECEDOR NOVO');
    expect(r.natureza).toBe('CUSTO_MERCADORIA');
  });

  it('sem conta: RECEBER → receita, PAGAR cartão → deduções, resto → operacionais', () => {
    expect(autoClassify(plano, 'RECEBER', null).natureza).toBe('RECEITA_BRUTA');
    expect(autoClassify(plano, 'PAGAR', null, null, 'CARTAO CREDITO').natureza).toBe('DEDUCOES');
    expect(autoClassify(plano, 'PAGAR', null).natureza).toBe('DESPESAS_OPERACIONAIS');
  });
});

describe('montarLancamento', () => {
  it('parcela em aberto → PREVISTO com chave dura e classificação DRE', () => {
    const r = montarLancamento(parcela(), plano);
    expect(r.status).toBe('PREVISTO');
    expect(r.origem).toBe('ERP');
    expect(r.origem_id).toBe('ERP:1:777');
    expect(r.erp_parcela_id).toBe(777);
    expect(r.natureza).toBe('CUSTO_MERCADORIA');
    expect(r.valor_pago).toBeUndefined();
  });

  it('parcela PAGA no ERP → nasce BAIXADO com data/valor reais', () => {
    const r = montarLancamento(parcela({ situacao: 'PAGA', data_pagamento: '2026-07-20', valor_pago: 1480 }), plano);
    expect(r.status).toBe('BAIXADO');
    expect(r.valor_pago).toBe(1480);
    expect(r.data_pagamento).toBe('2026-07-20');
    expect((r.dados_extras as Record<string, unknown>).baixa_automatica).toBe('sync-ledger');
  });

  it('valor_pago zerado no ERP cai para o valor da parcela', () => {
    const r = montarLancamento(parcela({ situacao: 'PAGA', data_pagamento: '2026-07-20', valor_pago: 0 }), plano);
    expect(r.valor_pago).toBe(1500);
  });
});

describe('decidirSync — tabela de precedência §2', () => {
  const atual = (status: string, over: Partial<{ valor: number; data_vencimento: string }> = {}) => ({
    id: 'lanc-1', status, valor: 1500, data_vencimento: '2026-08-10', ...over,
  });

  it('sem lançamento → INSERIR', () => {
    expect(decidirSync(parcela(), null, plano).acao).toBe('INSERIR');
  });

  it('PREVISTO + ERP paga → BAIXAR sem validação', () => {
    const d = decidirSync(parcela({ situacao: 'PAGA', data_pagamento: '2026-07-20' }), atual('PREVISTO'), plano);
    expect(d.acao).toBe('BAIXAR');
    if (d.acao === 'BAIXAR') expect(d.requerValidacao).toBe(false);
  });

  it('em workflow (BORDERO) + ERP paga → BAIXAR com requer_validacao', () => {
    const d = decidirSync(parcela({ situacao: 'PAGA', data_pagamento: '2026-07-20' }), atual('BORDERO'), plano);
    expect(d.acao).toBe('BAIXAR');
    if (d.acao === 'BAIXAR') {
      expect(d.requerValidacao).toBe(true);
      expect(d.update.requer_validacao).toBe(true);
    }
  });

  it('BAIXADO no ledger + ERP paga → NADA (não re-baixa)', () => {
    expect(decidirSync(parcela({ situacao: 'PAGA', data_pagamento: '2026-07-20' }), atual('BAIXADO'), plano).acao).toBe('NADA');
  });

  it('BAIXADO no ledger + ERP em aberto → DIVERGENCIA (não reabre)', () => {
    expect(decidirSync(parcela(), atual('BAIXADO'), plano).acao).toBe('DIVERGENCIA');
  });

  it('CANCELADO → NADA sempre', () => {
    expect(decidirSync(parcela({ situacao: 'PAGA', data_pagamento: '2026-07-20' }), atual('CANCELADO'), plano).acao).toBe('NADA');
    expect(decidirSync(parcela(), atual('CANCELADO'), plano).acao).toBe('NADA');
  });

  it('renegociação (valor/venc mudou) em PREVISTO → ATUALIZAR', () => {
    const d = decidirSync(parcela({ valor: 1200 }), atual('PREVISTO'), plano);
    expect(d.acao).toBe('ATUALIZAR');
    if (d.acao === 'ATUALIZAR') expect(d.update.valor).toBe(1200);

    const d2 = decidirSync(parcela({ data_vencimento: '2026-09-10' }), atual('PREVISTO'), plano);
    expect(d2.acao).toBe('ATUALIZAR');
  });

  it('renegociação em BORDERO → NADA (não mexe no meio do workflow)', () => {
    expect(decidirSync(parcela({ valor: 1200 }), atual('BORDERO'), plano).acao).toBe('NADA');
  });

  it('nada mudou → NADA (idempotência)', () => {
    expect(decidirSync(parcela(), atual('PREVISTO'), plano).acao).toBe('NADA');
  });
});
