// O badge do borderô na lista.
//
// Caso real: dois borderôs de Barueri apareciam iguais — "Enviado BTG" — sendo
// que um tinha 9 itens em trânsito e o outro 1 item agendado para o dia 06.
// Nenhum dos dois dizia se alguém precisava fazer alguma coisa.
import { describe, it, expect } from 'vitest';
import {
  estadoBordero,
  resumirComposicao,
  type ItemBordero,
} from '../../../../supabase/functions/_shared/borderoEstado';

const HOJE = '2026-08-04';

const pago = (): ItemBordero => ({ status: 'BAIXADO' });
const recusado = (): ItemBordero => ({ status: 'AUTORIZADO', requer_validacao: true });
const emTransito = (data: string): ItemBordero => ({ status: 'PROCESSANDO', data_prevista: data });

describe('resumirComposicao', () => {
  it('separa pago, recusado e em trânsito', () => {
    const c = resumirComposicao([pago(), pago(), recusado(), emTransito('2026-08-06')]);
    expect(c).toEqual({ total: 4, pagos: 2, rejeitados: 1, pendentes: 1, proxima_data: '2026-08-06' });
  });

  it('cancelado sai da conta — não é sucesso nem pendência', () => {
    const c = resumirComposicao([pago(), { status: 'CANCELADO' }]);
    expect(c.total).toBe(1);
    expect(c.pagos).toBe(1);
  });

  it('proxima_data é a menor entre os pendentes', () => {
    const c = resumirComposicao([emTransito('2026-08-10'), emTransito('2026-08-06'), pago()]);
    expect(c.proxima_data).toBe('2026-08-06');
  });

  it('borderô vazio não quebra', () => {
    expect(resumirComposicao([])).toEqual({ total: 0, pagos: 0, rejeitados: 0, pendentes: 0, proxima_data: null });
  });
});

describe('estadoBordero — antes do banco', () => {
  it('em montagem não exige atenção: ainda é rascunho', () => {
    const e = estadoBordero('MONTAGEM', null, HOJE);
    expect(e.label).toBe('Em montagem');
    expect(e.exigeAtencao).toBe(false);
  });

  it('aprovado exige atenção: está parado esperando alguém enviar', () => {
    expect(estadoBordero('APROVADO', null, HOJE).exigeAtencao).toBe(true);
  });

  it('cancelado é estado final e silencioso', () => {
    expect(estadoBordero('CANCELADO', null, HOJE).chave).toBe('CANCELADO');
  });
});

describe('estadoBordero — depois do envio', () => {
  it('tudo pago: Processado, sem atenção', () => {
    const e = estadoBordero('ENVIADO', resumirComposicao([pago(), pago(), pago()]), HOJE);
    expect(e.label).toBe('Processado');
    expect(e.exigeAtencao).toBe(false);
  });

  it('fechou com recusa: Parcial com a contagem no rótulo', () => {
    const e = estadoBordero('ENVIADO', resumirComposicao([pago(), pago(), recusado()]), HOJE);
    expect(e.label).toBe('Parcial 2/3');
    expect(e.variant).toBe('destructive');
    expect(e.exigeAtencao).toBe(true);
  });

  it('nenhum aceito: Rejeitado, não Parcial 0/N', () => {
    const e = estadoBordero('ENVIADO', resumirComposicao([recusado(), recusado()]), HOJE);
    expect(e.label).toBe('Rejeitado');
  });

  it('tudo com data futura é Agendado, não demora', () => {
    const e = estadoBordero('ENVIADO', resumirComposicao([emTransito('2026-08-06')]), HOJE);
    expect(e.label).toBe('Agendado 06/08');
    expect(e.exigeAtencao).toBe(false);
  });

  it('pagamento de hoje ainda sem retorno é Em processamento, não Agendado', () => {
    const e = estadoBordero('ENVIADO', resumirComposicao([emTransito(HOJE), pago()]), HOJE);
    expect(e.label).toBe('Em processamento 1/2');
  });

  it('data vencida sem retorno também é Em processamento — aí sim vale olhar', () => {
    const e = estadoBordero('ENVIADO', resumirComposicao([emTransito('2026-08-01')]), HOJE);
    expect(e.chave).toBe('PROCESSANDO');
  });

  it('agendado com recusa no meio exige atenção mesmo sendo futuro', () => {
    const e = estadoBordero('ENVIADO', resumirComposicao([emTransito('2026-08-10'), recusado()]), HOJE);
    expect(e.chave).toBe('AGENDADO');
    expect(e.exigeAtencao).toBe(true);
    expect(e.titulo).toContain('recusado');
  });

  it('sem composição carregada, cai no rótulo genérico em vez de mentir', () => {
    expect(estadoBordero('ENVIADO', null, HOJE).label).toBe('Enviado ao BTG');
  });

  it('data formatada sem passar por fuso — 06/08 continua 06/08', () => {
    const e = estadoBordero('ENVIADO', resumirComposicao([emTransito('2026-08-06')]), HOJE);
    expect(e.label).toContain('06/08');
  });
});
