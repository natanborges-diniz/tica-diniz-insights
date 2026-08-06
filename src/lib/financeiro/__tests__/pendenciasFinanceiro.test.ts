// Painel de pendências.
//
// Caso real: um fornecedor cobrou porque não tinha recebido. O sistema sabia —
// borderô enviado, item nunca voltou processado — mas a informação estava dentro
// do borderô, numa loja específica. Dez lojas, ninguém abre uma por uma todo dia.
import { describe, it, expect } from 'vitest';
import {
  pendenciaDoBordero,
  ordenarPendencias,
  resumirPendencias,
  severidadePorDias,
  diasEntre,
  type BorderoParaPainel,
} from '../../../../supabase/functions/_shared/pendenciasFinanceiro';

const HOJE = '2026-08-10';

const comp = (over = {}) => ({
  total: 1, pagos: 0, rejeitados: 0, pendentes: 1, proxima_data: null as string | null, ...over,
});

const bordero = (over: Partial<BorderoParaPainel> = {}): BorderoParaPainel => ({
  id: 'b-1234abcd',
  cod_empresa: 16,
  descricao: 'Borderô Semana 04/08/2026',
  status: 'ENVIADO',
  data_pagamento: '2026-08-04',
  total_valor: 11562.80,
  composicao: comp(),
  ...over,
});

describe('diasEntre', () => {
  it('conta dias sem passar por fuso', () => {
    expect(diasEntre('2026-08-04', '2026-08-10')).toBe(6);
    expect(diasEntre('2026-08-10', '2026-08-10')).toBe(0);
  });

  it('atravessa a virada do mês', () => {
    expect(diasEntre('2026-07-30', '2026-08-02')).toBe(3);
  });
});

describe('severidadePorDias', () => {
  it('um dia é o banco processando; cinco é o fornecedor ligando', () => {
    expect(severidadePorDias(0)).toBe('BAIXA');
    expect(severidadePorDias(1)).toBe('BAIXA');
    expect(severidadePorDias(2)).toBe('MEDIA');
    expect(severidadePorDias(5)).toBe('ALTA');
  });
});

describe('pendenciaDoBordero — o que exige ação', () => {
  it('enviado com data vencida e sem retorno: provavelmente falta o master autorizar', () => {
    const p = pendenciaDoBordero(bordero(), HOJE);
    expect(p?.tipo).toBe('AGUARDANDO_BANCO');
    expect(p?.dias_parado).toBe(6);
    expect(p?.severidade).toBe('ALTA');
    expect(p?.acao).toContain('aplicativo do BTG');
  });

  it('enviado hoje ainda não é problema', () => {
    const p = pendenciaDoBordero(bordero({ data_pagamento: HOJE, composicao: comp({ proxima_data: HOJE }) }), HOJE);
    expect(p?.severidade).toBe('BAIXA');
    expect(p?.mensagem).toContain('ainda sem retorno');
  });

  it('agendado para o futuro não entra no painel', () => {
    const p = pendenciaDoBordero(
      bordero({ composicao: comp({ proxima_data: '2026-08-20' }) }),
      HOJE,
    );
    expect(p).toBeNull();
  });

  it('recusa do banco é sempre alta — o dinheiro não saiu e ninguém tenta de novo sozinho', () => {
    const p = pendenciaDoBordero(
      bordero({ composicao: comp({ total: 9, pagos: 7, rejeitados: 2, pendentes: 0 }) }),
      HOJE,
    );
    expect(p?.tipo).toBe('RECUSADO');
    expect(p?.severidade).toBe('ALTA');
    expect(p?.mensagem).toContain('2 pagamento(s) recusado(s)');
    expect(p?.mensagem).toContain('7 pago(s)');
  });

  it('recusa vence agendamento futuro — não pode ficar escondida', () => {
    const p = pendenciaDoBordero(
      bordero({ composicao: comp({ total: 3, pagos: 1, rejeitados: 1, pendentes: 1, proxima_data: '2026-09-01' }) }),
      HOJE,
    );
    expect(p?.tipo).toBe('RECUSADO');
  });

  it('aprovado e não enviado é pendência de gente, não de banco', () => {
    const p = pendenciaDoBordero(bordero({ status: 'APROVADO' }), HOJE);
    expect(p?.tipo).toBe('AGUARDANDO_ENVIO');
    expect(p?.acao).toContain('Envie o borderô');
  });

  it('aprovado com data futura fica em baixa — ainda dá tempo', () => {
    const p = pendenciaDoBordero(bordero({ status: 'APROVADO', data_pagamento: '2026-08-25' }), HOJE);
    expect(p?.severidade).toBe('BAIXA');
  });

  it('montagem com data vencida cobra atenção', () => {
    const p = pendenciaDoBordero(bordero({ status: 'MONTAGEM' }), HOJE);
    expect(p?.tipo).toBe('MONTAGEM_ATRASADA');
    expect(p?.dias_parado).toBe(6);
  });

  it('montagem com data futura é trabalho em andamento, não pendência', () => {
    expect(pendenciaDoBordero(bordero({ status: 'MONTAGEM', data_pagamento: '2026-08-30' }), HOJE)).toBeNull();
  });

  it('montagem vazia não vira pendência', () => {
    const p = pendenciaDoBordero(
      bordero({ status: 'MONTAGEM', composicao: comp({ total: 0, pendentes: 0 }) }),
      HOJE,
    );
    expect(p).toBeNull();
  });

  it('processado e cancelado saem do painel', () => {
    expect(pendenciaDoBordero(bordero({ status: 'PROCESSADO' }), HOJE)).toBeNull();
    expect(pendenciaDoBordero(bordero({ status: 'CANCELADO' }), HOJE)).toBeNull();
  });

  it('enviado sem nada pendente já fechou', () => {
    const p = pendenciaDoBordero(
      bordero({ composicao: comp({ total: 2, pagos: 2, pendentes: 0 }) }),
      HOJE,
    );
    expect(p).toBeNull();
  });

  it('borderô sem descrição usa o id encurtado', () => {
    const p = pendenciaDoBordero(bordero({ descricao: null }), HOJE);
    expect(p?.descricao).toBe('Borderô B-1234AB');
  });
});

describe('ordenarPendencias', () => {
  it('mais grave primeiro, depois mais tempo parado', () => {
    const itens = [
      pendenciaDoBordero(bordero({ id: 'a', data_pagamento: '2026-08-09' }), HOJE)!,
      pendenciaDoBordero(bordero({ id: 'b', data_pagamento: '2026-08-01' }), HOJE)!,
      pendenciaDoBordero(bordero({ id: 'c', data_pagamento: '2026-08-04' }), HOJE)!,
    ];
    expect(ordenarPendencias(itens).map(p => p.bordero_id)).toEqual(['b', 'c', 'a']);
  });
});

describe('resumirPendencias', () => {
  it('conta, soma e diz em quais lojas — é onde o operador vai olhar', () => {
    const itens = [
      pendenciaDoBordero(bordero({ id: 'a', cod_empresa: 16 }), HOJE)!,
      pendenciaDoBordero(bordero({ id: 'b', cod_empresa: 1, status: 'APROVADO' }), HOJE)!,
      pendenciaDoBordero(bordero({ id: 'c', cod_empresa: 16 }), HOJE)!,
    ];
    const r = resumirPendencias(itens);
    expect(r.total).toBe(3);
    expect(r.lojas).toEqual([1, 16]);
    expect(r.por_tipo.AGUARDANDO_BANCO).toBe(2);
    expect(r.valor_total).toBeCloseTo(11562.80 * 3, 2);
  });

  it('painel vazio não quebra', () => {
    expect(resumirPendencias([])).toEqual({
      total: 0, alta: 0, valor_total: 0, por_tipo: {}, lojas: [],
    });
  });
});

describe('quem faz e onde — a pendência não pode circular entre as pessoas', () => {
  it('sem retorno é do master do BTG, no aplicativo do banco', () => {
    const p = pendenciaDoBordero(bordero(), HOJE);
    expect(p?.responsavel).toBe('MASTER_BTG');
    expect(p?.local).toBe('BANCO');
  });

  it('mas ainda oferece consultar o banco daqui, antes de cobrar alguém', () => {
    // A autorização pode já ter acontecido e o sistema não ter buscado o retorno.
    const p = pendenciaDoBordero(bordero(), HOJE);
    expect(p?.acao_sistema).toBe('ATUALIZAR_RETORNO');
    expect(p?.acao_rotulo).toBe('Consultar o banco agora');
  });

  it('recusado é do admin, resolvido no sistema', () => {
    const p = pendenciaDoBordero(
      bordero({ composicao: comp({ total: 3, pagos: 2, rejeitados: 1, pendentes: 0 }) }),
      HOJE,
    );
    expect(p?.responsavel).toBe('ADMIN');
    expect(p?.local).toBe('SISTEMA');
    expect(p?.acao_sistema).toBe('DEVOLVER_PREPARO');
  });

  it('aprovado sem envio é do operador, resolvido no sistema', () => {
    const p = pendenciaDoBordero(bordero({ status: 'APROVADO' }), HOJE);
    expect(p?.responsavel).toBe('OPERADOR');
    expect(p?.local).toBe('SISTEMA');
    expect(p?.acao_sistema).toBe('ENVIAR_BORDERO');
  });

  it('montagem atrasada é do admin — quem monta não aprova o próprio pagamento', () => {
    const p = pendenciaDoBordero(bordero({ status: 'MONTAGEM' }), HOJE);
    expect(p?.responsavel).toBe('ADMIN');
    expect(p?.acao_sistema).toBe('ABRIR_BORDERO');
  });

  it('toda pendência diz quem faz, onde, e o que o botão dispara', () => {
    const casos = [
      bordero(),
      bordero({ status: 'APROVADO' }),
      bordero({ status: 'MONTAGEM' }),
      bordero({ composicao: comp({ total: 2, pagos: 1, rejeitados: 1, pendentes: 0 }) }),
    ];
    for (const b of casos) {
      const p = pendenciaDoBordero(b, HOJE)!;
      expect(p.responsavel).toBeDefined();
      expect(p.local).toBeDefined();
      expect(p.acao_sistema).toBeDefined();
      expect(p.acao_rotulo).toBeTruthy();
    }
  });
});
