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
    expect(p?.acao).toContain('app do BTG');
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

  it('liberado internamente e não enviado é pendência de gente, não de banco', () => {
    // Data de hoje: sem o ramo de data vencida, que tem ação própria.
    const p = pendenciaDoBordero(bordero({ status: 'APROVADO', data_pagamento: HOJE }), HOJE);
    expect(p?.tipo).toBe('AGUARDANDO_ENVIO');
    // "Aprovado" solto confundia com a autorização do master no BTG.
    expect(p?.mensagem).toContain('Liberado internamente');
    expect(p?.acao).toContain('avise o master');
  });

  it('aprovado com data futura fica em baixa — ainda dá tempo', () => {
    const p = pendenciaDoBordero(bordero({ status: 'APROVADO', data_pagamento: '2026-08-25' }), HOJE);
    expect(p?.severidade).toBe('BAIXA');
  });

  it('montagem sem bloqueio e com data vencida é borderô esquecido', () => {
    const p = pendenciaDoBordero(bordero({ status: 'MONTAGEM' }), HOJE);
    expect(p?.tipo).toBe('MONTAGEM_PARADA');
    expect(p?.responsavel).toBe('OPERADOR');
    expect(p?.dias_parado).toBe(6);
  });

  it('montagem com item fora da faixa é decisão da Mesa, não esquecimento', () => {
    const p = pendenciaDoBordero(
      bordero({ status: 'MONTAGEM', composicao: comp({ total: 9 }), bloqueios_mesa: 2 }),
      HOJE,
    );
    expect(p?.tipo).toBe('MESA_PENDENTE');
    expect(p?.responsavel).toBe('ADMIN');
    expect(p?.mensagem).toContain('2 de 9');
    expect(p?.acao_rotulo).toBe('Abrir a Mesa');
  });

  it('exceção aparece mesmo antes da data — descobrir na véspera é tarde', () => {
    const p = pendenciaDoBordero(
      bordero({ status: 'MONTAGEM', data_pagamento: '2026-08-30', bloqueios_mesa: 1 }),
      HOJE,
    );
    expect(p?.tipo).toBe('MESA_PENDENTE');
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
  it('sem retorno é do operador: ele confere no banco e lembra o master', () => {
    // O master não abre este painel; deixá-lo como responsável tirava o dono da
    // pendência de dentro da equipe.
    const p = pendenciaDoBordero(bordero(), HOJE);
    expect(p?.responsavel).toBe('OPERADOR');
    expect(p?.local).toBe('BANCO');
    expect(p?.acao).toContain('lembre o master');
  });

  it('mas ainda oferece consultar o banco daqui, antes de cobrar alguém', () => {
    // A autorização pode já ter acontecido e o sistema não ter buscado o retorno.
    const p = pendenciaDoBordero(bordero(), HOJE);
    expect(p?.acao_sistema).toBe('ATUALIZAR_RETORNO');
    expect(p?.acao_rotulo).toBe('Consultar o banco agora');
  });

  it('recusado é do operador: ele vê o motivo no banco e corrige aqui', () => {
    const p = pendenciaDoBordero(
      bordero({ composicao: comp({ total: 3, pagos: 2, rejeitados: 1, pendentes: 0 }) }),
      HOJE,
    );
    expect(p?.responsavel).toBe('OPERADOR');
    expect(p?.local).toBe('SISTEMA');
    expect(p?.acao_sistema).toBe('DEVOLVER_PREPARO');
    expect(p?.acao).toContain('horário-limite ou saldo');
  });

  it('aprovado sem envio é do operador, resolvido no sistema', () => {
    const p = pendenciaDoBordero(bordero({ status: 'APROVADO', data_pagamento: HOJE }), HOJE);
    expect(p?.responsavel).toBe('OPERADOR');
    expect(p?.local).toBe('SISTEMA');
    expect(p?.acao_sistema).toBe('ENVIAR_BORDERO');
  });

  it('decisão de Mesa é do admin — quem monta não libera o próprio pagamento', () => {
    const p = pendenciaDoBordero(bordero({ status: 'MONTAGEM', bloqueios_mesa: 1 }), HOJE);
    expect(p?.responsavel).toBe('ADMIN');
    expect(p?.acao_sistema).toBe('APROVAR_BORDERO');
  });

  it('toda pendência diz quem faz, onde, e o que o botão dispara', () => {
    const casos = [
      bordero(),
      bordero({ status: 'APROVADO' }),
      bordero({ status: 'MONTAGEM' }),
      bordero({ status: 'MONTAGEM', bloqueios_mesa: 1 }),
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

describe('borderô pago por fora — o botão de enviar pagaria duas vezes', () => {
  // Boleto sai por débito automático ou alguém paga no app; o sync do ERP baixa
  // o título. O borderô fica liberado, com tudo pago, e nunca foi ao banco.
  const pagoFora = comp({ total: 5, pagos: 5, pendentes: 0 });

  it('liberado com tudo pago não é "falta enviar"', () => {
    const p = pendenciaDoBordero(bordero({ status: 'APROVADO', composicao: pagoFora }), HOJE);
    expect(p?.tipo).toBe('PAGO_FORA');
    expect(p?.acao_sistema).toBe('ENCERRAR_BORDERO');
  });

  it('avisa explicitamente para não enviar', () => {
    const p = pendenciaDoBordero(bordero({ status: 'APROVADO', composicao: pagoFora }), HOJE);
    expect(p?.acao).toContain('NÃO envie ao BTG');
  });

  it('vale também para o borderô ainda em montagem', () => {
    const p = pendenciaDoBordero(bordero({ status: 'MONTAGEM', composicao: pagoFora }), HOJE);
    expect(p?.tipo).toBe('PAGO_FORA');
  });

  it('não pede valor: nada há a pagar', () => {
    const p = pendenciaDoBordero(bordero({ status: 'APROVADO', composicao: pagoFora }), HOJE);
    expect(p?.valor_pendente).toBe(0);
  });

  it('enviado com tudo pago não é pago por fora — foi o banco que pagou', () => {
    expect(pendenciaDoBordero(bordero({ status: 'ENVIADO', composicao: pagoFora }), HOJE)).toBeNull();
  });

  it('com item recusado no meio, a recusa continua mandando', () => {
    const p = pendenciaDoBordero(
      bordero({ status: 'APROVADO', composicao: comp({ total: 5, pagos: 4, rejeitados: 1, pendentes: 0 }) }),
      HOJE,
    );
    expect(p?.tipo).toBe('RECUSADO');
  });
});

describe('data vencida antes do envio', () => {
  it('avisa que o banco recusa data no passado e oferece o ajuste', () => {
    const p = pendenciaDoBordero(bordero({ status: 'APROVADO', data_pagamento: '2026-08-04' }), HOJE);
    expect(p?.acao_sistema).toBe('AJUSTAR_DATA');
    expect(p?.acao_rotulo).toBe('Ajustar data e enviar');
    expect(p?.mensagem).toContain('venceu há 6 dia(s)');
  });

  it('data de hoje ou futura segue no fluxo normal de envio', () => {
    const p = pendenciaDoBordero(bordero({ status: 'APROVADO', data_pagamento: HOJE }), HOJE);
    expect(p?.acao_sistema).toBe('ENVIAR_BORDERO');
  });
});

describe('lote enviado que não foi autorizado — a saída de refazer', () => {
  it('depois do primeiro dia, oferece refazer além de consultar o banco', () => {
    // Sem essa segunda saída o operador chegava ao borderô e não encontrava
    // nada para clicar: a data não é editável depois do envio.
    const p = pendenciaDoBordero(bordero(), HOJE);
    expect(p?.acao_sistema).toBe('ATUALIZAR_RETORNO');
    expect(p?.acao_secundaria).toBe('REFAZER_BORDERO');
    expect(p?.acao_secundaria_rotulo).toContain('Refazer com nova data');
  });

  it('no mesmo dia do envio não oferece refazer — ainda pode ser autorizado', () => {
    const p = pendenciaDoBordero(
      bordero({ data_pagamento: HOJE, composicao: comp({ proxima_data: HOJE }) }),
      HOJE,
    );
    expect(p?.acao_sistema).toBe('ATUALIZAR_RETORNO');
    expect(p?.acao_secundaria).toBeUndefined();
  });
});
