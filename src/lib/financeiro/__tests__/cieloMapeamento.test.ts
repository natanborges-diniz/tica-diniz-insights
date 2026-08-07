// Mapeamento estabelecimento -> loja no Extrato Eletronico Cielo.
//
// Esta e a peca onde um erro nao se manifesta como erro: PV atribuido a loja
// errada nao quebra nada, so joga a venda no relatorio da loja vizinha. Por isso
// os casos abaixo cobrem a estrutura real do grupo, incluindo a que motivou
// estes testes — Sto Antonio e filial de Antonio Agu na Cielo, mas precisa
// aparecer como loja separada nos relatorios.

import { describe, it, expect } from 'vitest';
import {
  normalizaPv,
  montarMapaPv,
  resolverEmpresa,
  matrizesDistintas,
  type CieloConfigLoja,
} from '../../../../supabase/functions/_shared/cieloMapeamento';

// Estrutura real: Antonio Agu (9) e a matriz de extrato; Sto Antonio (17) e
// filial dela na Cielo, mas e loja propria no nosso sistema.
const ANTONIO_AGU: CieloConfigLoja = {
  cod_empresa: 9,
  cielo_estabelecimento_matriz: '2837031318',
  cielo_pvs: ['2837031318', '2809988441'],
};

const STO_ANTONIO: CieloConfigLoja = {
  cod_empresa: 17,
  cielo_estabelecimento_matriz: '2837031318', // mesma matriz da Antonio Agu
  cielo_pvs: ['2895579967'],
};

const UNIAO: CieloConfigLoja = {
  cod_empresa: 6,
  cielo_estabelecimento_matriz: '2838722330',
  cielo_pvs: ['2838722330', '2809988409', '1055799637', '1048250935'],
};

describe('normalizaPv', () => {
  it('ignora zeros a esquerda e espacos', () => {
    // O extrato traz o campo zero-padded em 10 posicoes; o cadastro na tela vem
    // como a pessoa digitou. Sem normalizar, nenhum dos dois se encontra.
    expect(normalizaPv('0002837031318')).toBe('2837031318');
    expect(normalizaPv('  2837031318  ')).toBe('2837031318');
    expect(normalizaPv('2837031318')).toBe('2837031318');
  });

  it('nao transforma um campo todo zerado em string vazia', () => {
    expect(normalizaPv('0000000000')).toBe('0000000000');
  });
});

describe('duas lojas sob a mesma matriz de extrato', () => {
  const configs = [ANTONIO_AGU, STO_ANTONIO];
  const mapa = montarMapaPv(configs);

  it('faz UMA chamada a API, nao uma por loja', () => {
    // O arquivo e o mesmo para as duas; baixar duas vezes gastaria um link
    // temporario a toa e duplicaria o processamento.
    const matrizes = matrizesDistintas(configs);
    expect(matrizes).toHaveLength(1);
    expect(matrizes[0].cielo_estabelecimento_matriz).toBe('2837031318');
  });

  it('separa as vendas por PV dentro do mesmo arquivo', () => {
    expect(resolverEmpresa('2837031318', '2837031318', mapa)).toBe(9);
    expect(resolverEmpresa('2809988441', '2837031318', mapa)).toBe(9);
    expect(resolverEmpresa('2895579967', '2837031318', mapa)).toBe(17);
  });

  it('encontra a loja mesmo com o PV zero-padded no arquivo', () => {
    expect(resolverEmpresa('0002895579967', '0002837031318', mapa)).toBe(17);
  });

  it('nao adivinha quando o PV e desconhecido e a matriz cobre duas lojas', () => {
    // Devolver nulo vira "estabelecimento sem loja associada" na importacao —
    // um problema visivel. Chutar a matriz jogaria a venda na loja errada em
    // silencio.
    expect(resolverEmpresa('9999999999', '2837031318', mapa)).toBeNull();
  });
});

describe('matriz que cobre uma loja so', () => {
  const mapa = montarMapaPv([UNIAO]);

  it('usa a matriz como fallback quando o PV nao esta cadastrado', () => {
    // Sem ambiguidade, atribuir e melhor que descartar: a venda existe e
    // pertence aquela loja.
    expect(resolverEmpresa('7777777777', '2838722330', mapa)).toBe(6);
  });

  it('ainda prefere o PV quando ele existe', () => {
    expect(resolverEmpresa('1048250935', '2838722330', mapa)).toBe(6);
  });
});

describe('cadastro inconsistente', () => {
  it('acusa PV cadastrado em duas lojas em vez de escolher uma', () => {
    const duplicado: CieloConfigLoja = {
      cod_empresa: 99,
      cielo_estabelecimento_matriz: '2837031318',
      cielo_pvs: ['2895579967'], // ja pertence a loja 17
    };

    const mapa = montarMapaPv([STO_ANTONIO, duplicado]);

    expect(mapa.colisoes).toHaveLength(1);
    expect(mapa.colisoes[0]).toContain('2895579967');
    // A primeira leitura vence, e a colisao fica registrada para aparecer na
    // tela de importacao.
    expect(resolverEmpresa('2895579967', '2837031318', mapa)).toBe(17);
  });

  it('nao acusa colisao quando a mesma loja repete o PV', () => {
    const mapa = montarMapaPv([STO_ANTONIO, { ...STO_ANTONIO }]);
    expect(mapa.colisoes).toEqual([]);
  });

  it('tolera loja sem PV e sem matriz', () => {
    const vazia: CieloConfigLoja = {
      cod_empresa: 13,
      cielo_estabelecimento_matriz: null,
      cielo_pvs: null,
    };
    const mapa = montarMapaPv([vazia, UNIAO]);
    expect(mapa.colisoes).toEqual([]);
    expect(resolverEmpresa('1048250935', '2838722330', mapa)).toBe(6);
  });
});

describe('grupo completo', () => {
  it('resolve cada loja pelo seu proprio PV', () => {
    const configs = [ANTONIO_AGU, STO_ANTONIO, UNIAO];
    const mapa = montarMapaPv(configs);

    expect(matrizesDistintas(configs)).toHaveLength(2);
    expect(mapa.colisoes).toEqual([]);

    const esperado: Array<[string, string, number]> = [
      ['2837031318', '2837031318', 9],
      ['2809988441', '2837031318', 9],
      ['2895579967', '2837031318', 17],
      ['2838722330', '2838722330', 6],
      ['1048250935', '2838722330', 6],
    ];

    for (const [pv, matriz, loja] of esperado) {
      expect(resolverEmpresa(pv, matriz, mapa)).toBe(loja);
    }
  });
});
