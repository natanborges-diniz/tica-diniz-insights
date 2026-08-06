// Devolver ao preparo o pagamento que o banco recusou.
//
// O erro caro aqui é liberar um título já pago: o operador montaria um segundo
// pagamento do mesmo boleto, e Pix não volta. Por isso, na dúvida, não libera.
import { describe, it, expect } from 'vitest';
import {
  decidirReenvio,
  separarParaReenvio,
  estadoDeVolta,
  type ItemParaReenvio,
} from '../../../../supabase/functions/_shared/reenvio';

const recusado = (over: Partial<ItemParaReenvio> = {}): ItemParaReenvio => ({
  id: 'l-1',
  descricao: 'SABESP 08/2026',
  status: 'AUTORIZADO',
  requer_validacao: true,
  ...over,
});

describe('decidirReenvio', () => {
  it('recusado pelo banco pode voltar ao preparo', () => {
    expect(decidirReenvio(recusado()).liberar).toBe(true);
  });

  it('já baixado nunca volta — reenviar pagaria duas vezes', () => {
    const d = decidirReenvio(recusado({ status: 'BAIXADO' }));
    expect(d.liberar).toBe(false);
    expect(d.motivo).toBe('JA_PAGO');
  });

  it('com data de baixa não volta, mesmo que o status diga outra coisa', () => {
    // Estado inconsistente acontece; quando o dinheiro deixou rastro, o rastro
    // manda.
    expect(decidirReenvio(recusado({ data_baixa: '2026-08-08' })).motivo).toBe('JA_PAGO');
  });

  it('com valor pago registrado também não volta', () => {
    expect(decidirReenvio(recusado({ valor_pago: 122.6 })).motivo).toBe('JA_PAGO');
  });

  it('em trânsito não volta e explica que o lote ainda pode ser pago', () => {
    const d = decidirReenvio(recusado({ status: 'PROCESSANDO', requer_validacao: false }));
    expect(d.liberar).toBe(false);
    expect(d.motivo).toBe('EM_TRANSITO');
    expect(d.explicacao).toContain('autorização do master');
  });

  it('autorizado sem marca de recusa também volta — é lá que se corrige', () => {
    const d = decidirReenvio(recusado({ requer_validacao: false }));
    expect(d.liberar).toBe(true);
  });

  it('conciliado no cartão não é caso de preparo', () => {
    const d = decidirReenvio(recusado({ status: 'CONCILIADO_CARTAO', requer_validacao: false }));
    expect(d.liberar).toBe(false);
    expect(d.motivo).toBe('NAO_RECUSADO');
  });

  it('sem descrição usa o id, para a mensagem não sair vazia', () => {
    expect(decidirReenvio(recusado({ descricao: null })).descricao).toBe('l-1');
  });
});

describe('separarParaReenvio', () => {
  it('separa o que vai do que fica, com o motivo de cada bloqueio', () => {
    const r = separarParaReenvio([
      recusado({ id: 'a' }),
      recusado({ id: 'b', status: 'BAIXADO' }),
      recusado({ id: 'c' }),
      recusado({ id: 'd', status: 'PROCESSANDO', requer_validacao: false }),
    ]);
    expect(r.liberar).toEqual(['a', 'c']);
    expect(r.bloqueados.map(b => b.motivo)).toEqual(['JA_PAGO', 'EM_TRANSITO']);
  });

  it('lista vazia não quebra', () => {
    expect(separarParaReenvio([])).toEqual({ liberar: [], bloqueados: [] });
  });

  it('borderô inteiro já pago não libera nada', () => {
    const r = separarParaReenvio([recusado({ status: 'BAIXADO' }), recusado({ id: 'x', status: 'BAIXADO' })]);
    expect(r.liberar).toEqual([]);
    expect(r.bloqueados).toHaveLength(2);
  });
});

describe('estadoDeVolta', () => {
  it('volta como CLASSIFICADO — o que falhou foi o envio, não a classificação', () => {
    const e = estadoDeVolta();
    expect(e.status).toBe('CLASSIFICADO');
  });

  it('sai do borderô antigo e perde a autorização do lote que já foi', () => {
    const e = estadoDeVolta();
    expect(e.bordero_id).toBeNull();
    expect(e.autorizado_por).toBeNull();
    expect(e.requer_validacao).toBe(false);
  });

  it('guarda o motivo do banco na observação', () => {
    const e = estadoDeVolta('invalid-account');
    expect(String(e.observacao)).toContain('invalid-account');
    expect(String(e.observacao)).toContain('novo borderô');
  });

  it('sem motivo, a observação continua legível', () => {
    expect(String(estadoDeVolta(null).observacao)).toContain('Devolvido ao preparo');
  });
});
