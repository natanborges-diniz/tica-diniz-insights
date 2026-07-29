import { describe, it, expect } from 'vitest';
import {
  gerarSemanasDoPeriodo,
  gerarSemanasDeCortes,
  validarCortes,
  calcularMetaSemanalLoja,
  derivarMetaVendedor,
  sugerirMetaMensal,
  calcularRitmo,
} from '../metasSemanais';
import { getDatasDoPeriodo } from '@/lib/metas/calendario';
import type { LojaConfiguracao, Feriado, LojaExcecao } from '@/lib/metas/calendario';

const configRua: LojaConfiguracao = {
  id: '1',
  codEmpresa: 1,
  tipoLoja: 'RUA',
  abreDomingo: false,
  abreFeriado: false,
  numVendedores: 4,
  percentualAceitavel: 100,
};

const semFeriados: Feriado[] = [];
const semExcecoes: LojaExcecao[] = [];

describe('gerarSemanasDoPeriodo', () => {
  // período comercial 21/jun/2027 (segunda) a 20/jul/2027 (terça)
  const ini = new Date('2027-06-21T12:00:00Z');
  const fim = new Date('2027-07-20T12:00:00Z');

  it('divide o período 21→20 em semanas comerciais truncadas nas bordas', () => {
    const semanas = gerarSemanasDoPeriodo(ini, fim, configRua, semFeriados, semExcecoes);
    expect(semanas[0].semanaInicio).toBe('2027-06-21'); // segunda
    expect(semanas[0].inicioNoPeriodo).toBe('2027-06-21');
    const ultima = semanas[semanas.length - 1];
    expect(ultima.fimNoPeriodo).toBe('2027-07-20');
    // todas as semanas começam em segunda-feira
    semanas.forEach((s) => {
      expect(new Date(s.semanaInicio + 'T12:00:00Z').getUTCDay()).toBe(1);
    });
  });

  it('semana que cruza o fim do período conta só os dias dentro dele', () => {
    const semanas = gerarSemanasDoPeriodo(ini, fim, configRua, semFeriados, semExcecoes);
    const ultima = semanas[semanas.length - 1];
    // 19/jul/2027 = segunda; período termina terça 20/jul → 2 dias úteis
    expect(ultima.semanaInicio).toBe('2027-07-19');
    expect(ultima.diasUteis).toBe(2);
  });

  it('feriado nacional no meio do período reduz os dias úteis (loja fechada)', () => {
    const feriados: Feriado[] = [
      {
        id: 'f1',
        data: '2027-06-24',
        descricao: 'São João',
        tipo: 'NACIONAL',
        uf: null,
        cidade: null,
        recorrente: false,
      },
    ];
    const sem = gerarSemanasDoPeriodo(ini, fim, configRua, semFeriados, semExcecoes);
    const com = gerarSemanasDoPeriodo(ini, fim, configRua, feriados, semExcecoes);
    expect(com[0].diasUteis).toBe(sem[0].diasUteis - 1);
  });

  it('feriado MUNICIPAL só fecha lojas da própria cidade', () => {
    const feriadoOsasco: Feriado[] = [
      {
        id: 'f2',
        data: '2027-06-24',
        descricao: 'Feriado de Osasco',
        tipo: 'MUNICIPAL',
        uf: 'SP',
        cidade: 'Osasco',
        recorrente: false,
      },
    ];
    const lojaOsasco = { ...configRua, cidade: 'Osasco' };
    const lojaItapevi = { ...configRua, cidade: 'Itapevi' };
    const lojaSemCidade = configRua; // sem cidade → municipal não aplica
    const base = gerarSemanasDoPeriodo(ini, fim, lojaOsasco, semFeriados, semExcecoes)[0].diasUteis;
    expect(gerarSemanasDoPeriodo(ini, fim, lojaOsasco, feriadoOsasco, semExcecoes)[0].diasUteis).toBe(base - 1);
    expect(gerarSemanasDoPeriodo(ini, fim, lojaItapevi, feriadoOsasco, semExcecoes)[0].diasUteis).toBe(base);
    expect(gerarSemanasDoPeriodo(ini, fim, lojaSemCidade, feriadoOsasco, semExcecoes)[0].diasUteis).toBe(base);
  });

  it('período que cruza a virada do mês/ano funciona', () => {
    const semanas = gerarSemanasDoPeriodo(
      new Date('2026-12-21T12:00:00Z'),
      new Date('2027-01-20T12:00:00Z'),
      configRua,
      semFeriados,
      semExcecoes
    );
    expect(semanas.length).toBeGreaterThan(3);
    expect(semanas[0].semanaInicio).toBe('2026-12-21');
    expect(semanas[semanas.length - 1].fimNoPeriodo).toBe('2027-01-20');
  });
});

describe('calcularMetaSemanalLoja', () => {
  it('a soma das semanas fecha exatamente na meta mensal (arredondamento)', () => {
    const semanas = [
      { semanaInicio: 'a', semanaFim: 'a', inicioNoPeriodo: 'a', fimNoPeriodo: 'a', diasUteis: 6 },
      { semanaInicio: 'b', semanaFim: 'b', inicioNoPeriodo: 'b', fimNoPeriodo: 'b', diasUteis: 6 },
      { semanaInicio: 'c', semanaFim: 'c', inicioNoPeriodo: 'c', fimNoPeriodo: 'c', diasUteis: 5 },
      { semanaInicio: 'd', semanaFim: 'd', inicioNoPeriodo: 'd', fimNoPeriodo: 'd', diasUteis: 6 },
      { semanaInicio: 'e', semanaFim: 'e', inicioNoPeriodo: 'e', fimNoPeriodo: 'e', diasUteis: 2 },
    ];
    const metas = calcularMetaSemanalLoja(100000, semanas);
    const soma = metas.reduce((s, m) => s + m.metaValor, 0);
    expect(Math.round(soma * 100) / 100).toBe(100000);
    // proporcional: semana de 6 dias > semana de 2 dias
    expect(metas[0].metaValor).toBeGreaterThan(metas[4].metaValor);
  });

  it('meta zero ou sem dias úteis retorna zeros', () => {
    const semanas = [
      { semanaInicio: 'a', semanaFim: 'a', inicioNoPeriodo: 'a', fimNoPeriodo: 'a', diasUteis: 0 },
    ];
    expect(calcularMetaSemanalLoja(0, semanas)[0].metaValor).toBe(0);
    expect(calcularMetaSemanalLoja(50000, semanas)[0].metaValor).toBe(0);
  });
});

describe('derivarMetaVendedor', () => {
  it('divide a meta da loja pelo divisor com percentual', () => {
    // loja 20.000 na semana, 80% distribuído, 4 vendedores → 4.000
    expect(derivarMetaVendedor(20000, 80, 4)).toBe(4000);
  });
  it('100% e 1 vendedor = meta da loja', () => {
    expect(derivarMetaVendedor(12345.67, 100, 1)).toBe(12345.67);
  });
  it('divisor inválido retorna 0', () => {
    expect(derivarMetaVendedor(10000, 100, 0)).toBe(0);
  });
});

describe('sugerirMetaMensal', () => {
  it('ano anterior + 10%', () => {
    expect(sugerirMetaMensal(100000)).toBe(110000);
    expect(sugerirMetaMensal(87654.32)).toBe(96419.75);
  });
});

describe('getDatasDoPeriodo — padrão da casa 21→20', () => {
  it('sem config: julho = 21/06 a 20/07', () => {
    const { dataInicio, dataFim } = getDatasDoPeriodo(2026, 7, null);
    expect(dataInicio.getDate()).toBe(21);
    expect(dataInicio.getMonth()).toBe(5); // junho
    expect(dataFim.getDate()).toBe(20);
    expect(dataFim.getMonth()).toBe(6); // julho
  });
  it('janeiro = 21/12 do ano anterior a 20/01', () => {
    const { dataInicio, dataFim } = getDatasDoPeriodo(2027, 1, null);
    expect(dataInicio.getFullYear()).toBe(2026);
    expect(dataInicio.getMonth()).toBe(11); // dezembro
    expect(dataInicio.getDate()).toBe(21);
    expect(dataFim.getFullYear()).toBe(2027);
    expect(dataFim.getMonth()).toBe(0);
    expect(dataFim.getDate()).toBe(20);
  });
});

describe('cortes manuais', () => {
  const cortes = [
    { semanaInicio: '2026-06-21', semanaFim: '2026-06-28' },
    { semanaInicio: '2026-06-29', semanaFim: '2026-07-05' },
    { semanaInicio: '2026-07-06', semanaFim: '2026-07-12' },
    { semanaInicio: '2026-07-13', semanaFim: '2026-07-20' },
  ];

  it('validarCortes aceita cortes contíguos cobrindo o período', () => {
    expect(validarCortes(cortes, '2026-06-21', '2026-07-20')).toEqual([]);
  });

  it('validarCortes acusa buraco/borda errada', () => {
    expect(
      validarCortes(cortes.slice(1), '2026-06-21', '2026-07-20').length
    ).toBeGreaterThan(0);
    const comBuraco = [cortes[0], { semanaInicio: '2026-07-01', semanaFim: '2026-07-20' }];
    expect(validarCortes(comBuraco, '2026-06-21', '2026-07-20').length).toBeGreaterThan(0);
  });

  it('gerarSemanasDeCortes calcula dias úteis por corte (fecha domingo)', () => {
    const semanas = gerarSemanasDeCortes(cortes, configRua, semFeriados, semExcecoes);
    expect(semanas).toHaveLength(4);
    // 1º corte 21/06(dom) a 28/06(dom): 8 dias corridos, 2 domingos fechados = 6 úteis
    expect(semanas[0].diasUteis).toBe(6);
    expect(semanas[0].semanaInicio).toBe('2026-06-21');
    expect(semanas[0].semanaFim).toBe('2026-06-28');
  });
});

describe('calcularRitmo', () => {
  it('calcula %, faltante e necessário por dia', () => {
    const r = calcularRitmo(10000, 6000, 2);
    expect(r.percentual).toBe(60);
    expect(r.faltante).toBe(4000);
    expect(r.necessarioPorDia).toBe(2000);
  });
  it('meta batida: faltante 0', () => {
    const r = calcularRitmo(10000, 12000, 1);
    expect(r.percentual).toBe(120);
    expect(r.faltante).toBe(0);
  });
});
