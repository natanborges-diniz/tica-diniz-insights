import { describe, it, expect } from 'vitest';
import {
  calcularFechamento,
  consolidarVendedores,
  type LinhaRecebimento,
} from '../motorComissao';

const TAXAS = {
  CARTAO_CREDITO: 2,
  AVISTA: 3,
  PIX: 3,
  CARTAO_DEBITO: 3,
  CHEQUE: 1,
  CREDIARIO: 1,
  CONVENIO: 1,
  CREDITOS: 0,
  OUTROS: 0,
};

function linha(p: Partial<LinhaRecebimento>): LinhaRecebimento {
  return {
    codVendedor: 1,
    vendedorNome: 'MARIA',
    codTransacao: 100,
    dataEmissao: '2026-07-21',
    dataPagamento: '2026-07-22',
    formaCategoria: 'AVISTA',
    origem: 'VENDA_PERIODO',
    valor: 1000,
    ...p,
  };
}

const semPremios = {
  faixasAtivas: [],
  sequenciaAtiva: null,
  semanasAtingidasAntes: new Map<number, number>(),
  restituicoes: [],
};

describe('calcularFechamento — comissão por categoria', () => {
  it('aplica a taxa configurada por categoria (2/3/1%)', () => {
    const r = calcularFechamento({
      linhas: [
        linha({ formaCategoria: 'CARTAO_CREDITO', valor: 1000 }), // 20
        linha({ formaCategoria: 'PIX', valor: 1000 }), // 30
        linha({ formaCategoria: 'CREDIARIO', valor: 1000 }), // 10
      ],
      taxas: TAXAS,
      metasPorVendedor: new Map([[1, 10000]]),
      ...semPremios,
    });
    expect(r).toHaveLength(1);
    expect(r[0].baseTotal).toBe(3000);
    expect(r[0].comissao).toBe(60);
    expect(r[0].percentualMeta).toBe(30);
    expect(r[0].detalhe).toHaveLength(3);
  });

  it('CREDITOS não comissiona e não soma na base', () => {
    const r = calcularFechamento({
      linhas: [
        linha({ formaCategoria: 'AVISTA', valor: 1000 }),
        linha({ formaCategoria: 'CREDITOS', valor: 500 }),
      ],
      taxas: TAXAS,
      metasPorVendedor: new Map([[1, 1000]]),
      ...semPremios,
    });
    expect(r[0].baseTotal).toBe(1000);
    expect(r[0].comissao).toBe(30);
    // mas aparece identificado no detalhe
    expect(r[0].detalhe.find((d) => d.formaCategoria === 'CREDITOS')?.comissao).toBe(0);
  });

  it('separa origem venda do período × saldo anterior', () => {
    const r = calcularFechamento({
      linhas: [
        linha({ valor: 600, origem: 'VENDA_PERIODO' }),
        linha({ valor: 400, origem: 'SALDO_ANTERIOR', codTransacao: 99 }),
      ],
      taxas: TAXAS,
      metasPorVendedor: new Map([[1, 1000]]),
      ...semPremios,
    });
    expect(r[0].basePorOrigem).toEqual({ vendaPeriodo: 600, saldoAnterior: 400 });
  });
});

describe('calcularFechamento — restituições', () => {
  it('abate base e comissão pela taxa média ponderada', () => {
    const r = calcularFechamento({
      linhas: [linha({ formaCategoria: 'AVISTA', valor: 2000 })], // comissão 60, taxa média 3%
      taxas: TAXAS,
      metasPorVendedor: new Map([[1, 2000]]),
      ...semPremios,
      restituicoes: [{ codVendedor: 1, valor: 500 }],
    });
    expect(r[0].baseTotal).toBe(1500); // 2000 - 500
    expect(r[0].restituicoes).toBe(500);
    expect(r[0].comissao).toBe(45); // 60 - 500×3%
    expect(r[0].percentualMeta).toBe(75); // 1500/2000
  });
});

describe('calcularFechamento — prêmios', () => {
  it('faixa: melhor faixa atingida, % sobre a base', () => {
    const r = calcularFechamento({
      linhas: [linha({ valor: 12000 })],
      taxas: TAXAS,
      metasPorVendedor: new Map([[1, 10000]]), // 120%
      ...semPremios,
      faixasAtivas: [
        { percentualMetaMin: 100, percentualPremio: 0.5 },
        { percentualMetaMin: 110, percentualPremio: 1 },
      ],
    });
    expect(r[0].premioFaixa?.percentualMetaMin).toBe(110);
    expect(r[0].premioValor).toBe(120); // 1% de 12000
    expect(r[0].totalPagar).toBe(360 + 120); // comissão 3% + prêmio
  });

  it('sequência: paga extra quando fecha as N consecutivas no mês', () => {
    const base = {
      linhas: [linha({ valor: 10000 })],
      taxas: TAXAS,
      metasPorVendedor: new Map([[1, 10000]]), // 100%
      restituicoes: [],
      faixasAtivas: [],
      sequenciaAtiva: { semanasConsecutivas: 3, percentualPremio: 1 },
    };
    // já tinha 2 antes → com esta fecha 3 → paga
    const paga = calcularFechamento({ ...base, semanasAtingidasAntes: new Map([[1, 2]]) });
    expect(paga[0].premioSequencia).not.toBeNull();
    expect(paga[0].premioValor).toBe(100);
    // só 1 antes → não paga
    const naoPaga = calcularFechamento({ ...base, semanasAtingidasAntes: new Map([[1, 1]]) });
    expect(naoPaga[0].premioSequencia).toBeNull();
    expect(naoPaga[0].premioValor).toBe(0);
  });

  it('faixa com VALOR FIXO paga o valor em R$, não %', () => {
    const r = calcularFechamento({
      linhas: [linha({ valor: 12000 })],
      taxas: TAXAS,
      metasPorVendedor: new Map([[1, 10000]]), // 120%
      restituicoes: [],
      sequenciaAtiva: null,
      semanasAtingidasAntes: new Map(),
      faixasAtivas: [
        { percentualMetaMin: 100, percentualPremio: 0, valorFixo: 250, tipoValor: 'FIXO' },
      ],
    });
    expect(r[0].premioValor).toBe(250);
  });

  it('sequência com VALOR FIXO paga o valor em R$', () => {
    const r = calcularFechamento({
      linhas: [linha({ valor: 10000 })],
      taxas: TAXAS,
      metasPorVendedor: new Map([[1, 10000]]),
      restituicoes: [],
      faixasAtivas: [],
      sequenciaAtiva: { semanasConsecutivas: 2, percentualPremio: 0, valorFixo: 500, tipoValor: 'FIXO' },
      semanasAtingidasAntes: new Map([[1, 1]]),
    });
    expect(r[0].premioValor).toBe(500);
  });

  it('sem meta atingida não há prêmio de sequência', () => {
    const r = calcularFechamento({
      linhas: [linha({ valor: 5000 })],
      taxas: TAXAS,
      metasPorVendedor: new Map([[1, 10000]]), // 50%
      restituicoes: [],
      faixasAtivas: [],
      sequenciaAtiva: { semanasConsecutivas: 2, percentualPremio: 1 },
      semanasAtingidasAntes: new Map([[1, 5]]),
    });
    expect(r[0].premioSequencia).toBeNull();
  });
});

describe('consolidarVendedores — mensal (soma das semanas)', () => {
  it('soma base/comissão/prêmio das semanas e recalcula % pela meta somada', () => {
    const s1 = calcularFechamento({
      linhas: [linha({ valor: 10000 })],
      taxas: TAXAS,
      metasPorVendedor: new Map([[1, 10000]]),
      ...semPremios,
      faixasAtivas: [{ percentualMetaMin: 100, percentualPremio: 1 }],
    });
    const s2 = calcularFechamento({
      linhas: [linha({ valor: 5000, formaCategoria: 'CARTAO_CREDITO' })],
      taxas: TAXAS,
      metasPorVendedor: new Map([[1, 10000]]),
      ...semPremios,
    });
    const mes = consolidarVendedores([s1, s2]);
    expect(mes).toHaveLength(1);
    expect(mes[0].baseTotal).toBe(15000);
    expect(mes[0].metaSemana).toBe(20000);
    expect(mes[0].percentualMeta).toBe(75);
    expect(mes[0].comissao).toBe(300 + 100); // 3% de 10k + 2% de 5k
    expect(mes[0].premioValor).toBe(100); // prêmio da semana 1 (1% de 10k)
    expect(mes[0].totalPagar).toBe(500);
    expect(mes[0].detalhe).toHaveLength(2);
  });
});

describe('calcularFechamento — múltiplos vendedores', () => {
  it('agrupa e ordena por base', () => {
    const r = calcularFechamento({
      linhas: [
        linha({ codVendedor: 1, vendedorNome: 'A', valor: 100 }),
        linha({ codVendedor: 2, vendedorNome: 'B', valor: 900 }),
      ],
      taxas: TAXAS,
      metasPorVendedor: new Map(),
      ...semPremios,
    });
    expect(r.map((v) => v.codVendedor)).toEqual([2, 1]);
  });
});
