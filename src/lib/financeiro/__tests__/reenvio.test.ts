// Devolver ao preparo o pagamento que o banco recusou.
//
// O erro caro aqui é liberar um título já pago: o operador montaria um segundo
// pagamento do mesmo boleto, e Pix não volta. Por isso, na dúvida, não libera.
import { describe, it, expect } from 'vitest';
import {
  decidirReenvio,
  separarParaReenvio,
  estadoDeVolta,
  ehMotivoNaoLiquidado,
  MOTIVOS_NAO_LIQUIDADO,
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

  it('autorizado sem marca de recusa não é caso de reenvio', () => {
    const d = decidirReenvio(recusado({ requer_validacao: false }));
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

describe('motivo de não liquidação', () => {
  // Estruturado porque a orientação muda conforme o caso — e porque contar os
  // motivos revela problema de processo: "fora de horário" toda semana não é
  // erro do operador, é a rotina de envio no horário errado.
  it('cobre os casos que acontecem de verdade', () => {
    const valores = MOTIVOS_NAO_LIQUIDADO.map(m => m.valor);
    expect(valores).toContain('FORA_HORARIO');
    expect(valores).toContain('SEM_SALDO');
    expect(valores).toContain('NAO_AUTORIZADO');
  });

  it('cada motivo carrega a orientação do que fazer antes de reenviar', () => {
    for (const m of MOTIVOS_NAO_LIQUIDADO) {
      expect(m.orientacao.length).toBeGreaterThan(10);
    }
  });

  it('fora de horário orienta pela janela do tipo de pagamento', () => {
    const m = MOTIVOS_NAO_LIQUIDADO.find(x => x.valor === 'FORA_HORARIO')!;
    expect(m.orientacao).toContain('Pix não tem');
  });

  it('sem saldo avisa que a recusa se repete', () => {
    const m = MOTIVOS_NAO_LIQUIDADO.find(x => x.valor === 'SEM_SALDO')!;
    expect(m.orientacao).toContain('se repete');
  });

  it('recusa valor inventado', () => {
    expect(ehMotivoNaoLiquidado('FORA_HORARIO')).toBe(true);
    expect(ehMotivoNaoLiquidado('QUALQUER_COISA')).toBe(false);
    expect(ehMotivoNaoLiquidado(null)).toBe(false);
  });
});
