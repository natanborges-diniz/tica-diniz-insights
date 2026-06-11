// Testes — Sub-Entrega Wizard:
// Serializer de plano_compra_historico + regras do Wizard.

import { describe, it, expect } from 'vitest';
import {
  serializarPlanoSugerido,
  derivarPlanoFinalInicial,
  aplicarAjustePlanoFinal,
  totalLacunaSugerida,
  totalPlanoFinal,
  montarPayloadInsert,
  podeAvancarStep,
  type ParametrosPlano,
} from '../plano-compra-payload';
import type { MixMarcaV2 } from '../mix-ideal-v2';

// Mix fictício deduzido das saídas reais de calcularMixIdealV2.
const MIX: MixMarcaV2[] = [
  {
    marca: 'RAYBAN',
    participacao: 0.56,
    pctPecas: 0.6,
    pctFaturamento: 0.5,
    pecasVendidas: 60,
    faturamento: 6000,
    mixTotal: 112,
    mixRX: 78,
    mixSolar: 34,
    pctSolar: 30,
    estoqueEfetivo: 50,
    lacuna: 62,
    status: 'OK',
    estrategica: false,
    skusAlocados: [
      { codSku: 1, descricao: 'RB 4105', diasGiroUltimaPeca: 10, qtdSugerida: 40 },
      { codSku: 2, descricao: 'RB 3025', diasGiroUltimaPeca: 12, qtdSugerida: 22 },
    ],
  },
  {
    marca: 'SILHOUETTE',
    participacao: 0.127,
    pctPecas: 0.1,
    pctFaturamento: 0.167,
    pecasVendidas: 10,
    faturamento: 2000,
    mixTotal: 25,
    mixRX: 18,
    mixSolar: 7,
    pctSolar: 30,
    estoqueEfetivo: 30,
    lacuna: 0,
    status: 'ABAIXO_MINIMO_ESTRATEGICA',
    estrategica: true,
    skusAlocados: [],
  },
];

const PARAMETROS: ParametrosPlano = {
  capacidadeTotal: 200,
  pctSolarDefault: 30,
  pesoPecas: 0.6,
  pesoFaturamento: 0.4,
  janelaParticipacaoDias: 180,
  janelaCandidatosDias: 90,
  mixMinimoMarca: 25,
  dataInicio: '2026-01-01',
  dataFim: '2026-06-30',
};

describe('serializarPlanoSugerido', () => {
  it('mapeia todas as marcas com campos esperados', () => {
    const sug = serializarPlanoSugerido(MIX);
    expect(sug).toHaveLength(2);
    const rayban = sug.find(m => m.marca === 'RAYBAN');
    expect(rayban).toMatchObject({
      marca: 'RAYBAN',
      mixTotal: 112,
      mixRX: 78,
      mixSolar: 34,
      lacuna: 62,
      status: 'OK',
      estrategica: false,
    });
    expect(rayban?.skusAlocados).toHaveLength(2);
    expect(rayban?.skusAlocados[0]).toEqual({
      codSku: 1,
      descricao: 'RB 4105',
      diasGiroUltimaPeca: 10,
      qtdSugerida: 40,
    });
  });

  it('marca estratégica preserva flag estrategica=true', () => {
    const sug = serializarPlanoSugerido(MIX);
    const sil = sug.find(m => m.marca === 'SILHOUETTE');
    expect(sil?.estrategica).toBe(true);
    expect(sil?.status).toBe('ABAIXO_MINIMO_ESTRATEGICA');
  });

  it('input vazio → []', () => {
    expect(serializarPlanoSugerido([])).toEqual([]);
  });
});

describe('derivarPlanoFinalInicial', () => {
  it('cria plano final igual ao sugerido com ajusteUsuario=false', () => {
    const plano = derivarPlanoFinalInicial(MIX);
    expect(plano).toEqual([
      { marca: 'RAYBAN', qtdComprar: 62, ajusteUsuario: false },
      { marca: 'SILHOUETTE', qtdComprar: 0, ajusteUsuario: false },
    ]);
  });
});

describe('aplicarAjustePlanoFinal', () => {
  it('quantidade diferente da sugerida marca ajusteUsuario=true', () => {
    const inicial = derivarPlanoFinalInicial(MIX);
    const ajustado = aplicarAjustePlanoFinal(inicial, MIX, 'RAYBAN', 50);
    expect(ajustado[0]).toEqual({ marca: 'RAYBAN', qtdComprar: 50, ajusteUsuario: true });
    expect(ajustado[1]).toEqual({ marca: 'SILHOUETTE', qtdComprar: 0, ajusteUsuario: false });
  });

  it('voltar ao valor sugerido limpa ajusteUsuario', () => {
    const inicial = derivarPlanoFinalInicial(MIX);
    const ajustado = aplicarAjustePlanoFinal(inicial, MIX, 'RAYBAN', 50);
    const voltado = aplicarAjustePlanoFinal(ajustado, MIX, 'RAYBAN', 62);
    expect(voltado[0]).toEqual({ marca: 'RAYBAN', qtdComprar: 62, ajusteUsuario: false });
  });

  it('valores negativos saturam em 0', () => {
    const inicial = derivarPlanoFinalInicial(MIX);
    const ajustado = aplicarAjustePlanoFinal(inicial, MIX, 'RAYBAN', -10);
    expect(ajustado[0].qtdComprar).toBe(0);
    expect(ajustado[0].ajusteUsuario).toBe(true);
  });

  it('valores fracionários são truncados', () => {
    const inicial = derivarPlanoFinalInicial(MIX);
    const ajustado = aplicarAjustePlanoFinal(inicial, MIX, 'RAYBAN', 50.9);
    expect(ajustado[0].qtdComprar).toBe(50);
  });

  it('marca inexistente é ignorada (plano preservado)', () => {
    const inicial = derivarPlanoFinalInicial(MIX);
    const result = aplicarAjustePlanoFinal(inicial, MIX, 'INEXISTENTE', 99);
    expect(result).toEqual(inicial);
  });
});

describe('totais', () => {
  it('totalLacunaSugerida soma lacunas', () => {
    expect(totalLacunaSugerida(MIX)).toBe(62);
  });

  it('totalPlanoFinal soma qtdComprar', () => {
    const plano = derivarPlanoFinalInicial(MIX);
    expect(totalPlanoFinal(plano)).toBe(62);
    const ajustado = aplicarAjustePlanoFinal(plano, MIX, 'RAYBAN', 40);
    expect(totalPlanoFinal(ajustado)).toBe(40);
  });
});

describe('montarPayloadInsert', () => {
  it('produz row compatível com schema plano_compra_historico', () => {
    const dataGeracao = new Date('2026-05-29T12:00:00.000Z');
    const planoFinal = derivarPlanoFinalInicial(MIX);
    const row = montarPayloadInsert({
      codEmpresa: 42,
      mix: MIX,
      planoFinal,
      parametros: PARAMETROS,
      dataGeracao,
    });
    expect(row).toMatchObject({
      cod_empresa: 42,
      data_geracao: '2026-05-29T12:00:00.000Z',
      total_sugerido: 62,
      total_final: 62,
    });
    expect(Array.isArray(row.plano_sugerido)).toBe(true);
    expect(row.plano_sugerido).toHaveLength(2);
    expect(row.plano_final).toHaveLength(2);
    expect(row.parametros.capacidadeTotal).toBe(200);
    expect(row).not.toHaveProperty('loja_codigo');
  });

  it('plano_final pode divergir de plano_sugerido após ajuste', () => {
    const planoBase = derivarPlanoFinalInicial(MIX);
    const planoAjustado = aplicarAjustePlanoFinal(planoBase, MIX, 'RAYBAN', 40);
    const row = montarPayloadInsert({
      codEmpresa: 7,
      mix: MIX,
      planoFinal: planoAjustado,
      parametros: PARAMETROS,
    });
    expect(row.total_sugerido).toBe(62);
    expect(row.total_final).toBe(40);
    expect(row.plano_final.find(p => p.marca === 'RAYBAN')?.ajusteUsuario).toBe(true);
  });
});

describe('podeAvancarStep', () => {
  const base = {
    loadingDados: false,
    qtdItens: 100,
    capacidadeTotal: 200,
    mixVazio: false,
  };

  it('step 1 — empresa null bloqueia', () => {
    expect(podeAvancarStep({ ...base, step: 1, empresaId: null })).toBe(false);
  });

  it('step 1 — empresa "ALL" bloqueia (Wizard exige empresa específica)', () => {
    expect(podeAvancarStep({ ...base, step: 1, empresaId: 'ALL' })).toBe(false);
  });

  it('step 1 — empresa numérica libera', () => {
    expect(podeAvancarStep({ ...base, step: 1, empresaId: 42 })).toBe(true);
  });

  it('step 2 — loading bloqueia', () => {
    expect(podeAvancarStep({ ...base, step: 2, empresaId: 42, loadingDados: true })).toBe(false);
  });

  it('step 2 — sem itens bloqueia', () => {
    expect(podeAvancarStep({ ...base, step: 2, empresaId: 42, qtdItens: 0 })).toBe(false);
  });

  it('step 3 (Mix Ideal) — capacidade=0 bloqueia (não avança pro Plano)', () => {
    expect(podeAvancarStep({ ...base, step: 3, empresaId: 42, capacidadeTotal: 0 })).toBe(false);
  });

  it('step 3 (Mix Ideal) — mix vazio bloqueia', () => {
    expect(podeAvancarStep({ ...base, step: 3, empresaId: 42, mixVazio: true })).toBe(false);
  });

  it('step 4 e 5+ — sempre liberados (etapas read-only / locais)', () => {
    expect(podeAvancarStep({ ...base, step: 4, empresaId: 42 })).toBe(true);
    expect(podeAvancarStep({ ...base, step: 5, empresaId: 42 })).toBe(true);
    expect(podeAvancarStep({ ...base, step: 6, empresaId: 42 })).toBe(true);
  });
});
