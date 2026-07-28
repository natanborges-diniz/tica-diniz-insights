// Testes da lógica pura de semana comercial e agrupamento semanal de
// recebimentos (Fase 1 — docs/REVISAO_VENDAS_METAS.md §5.2/§5.3).
import { describe, it, expect } from 'vitest';
import {
  inicioSemanaComercial,
  fimSemanaComercial,
  addDaysISO,
  agruparRecebimentosPorSemana,
  RecebimentoAgregado,
} from '../semanaComercial';

function receb(partial: Partial<RecebimentoAgregado>): RecebimentoAgregado {
  return {
    codEmpresa: 1,
    codVendedor: 10,
    vendedorNome: 'MARIA',
    dataPagamento: '2026-07-27',
    formaCategoria: 'AVISTA',
    origem: 'VENDA_PERIODO',
    valorRecebido: 100,
    qtdParcelas: 1,
    ...partial,
  };
}

describe('inicioSemanaComercial', () => {
  // 2026-07-27 é segunda-feira
  it('segunda-feira ancora nela mesma', () => {
    expect(inicioSemanaComercial('2026-07-27')).toBe('2026-07-27');
  });

  it('dias no meio da semana ancoram na segunda anterior', () => {
    expect(inicioSemanaComercial('2026-07-28')).toBe('2026-07-27'); // terça
    expect(inicioSemanaComercial('2026-07-31')).toBe('2026-07-27'); // sexta
    expect(inicioSemanaComercial('2026-08-01')).toBe('2026-07-27'); // sábado
  });

  it('domingo pertence à semana iniciada na segunda ANTERIOR', () => {
    expect(inicioSemanaComercial('2026-08-02')).toBe('2026-07-27');
  });

  it('cruza mês e ano corretamente', () => {
    expect(inicioSemanaComercial('2026-01-01')).toBe('2025-12-29'); // quinta
  });
});

describe('fimSemanaComercial / addDaysISO', () => {
  it('fim da semana é o domingo', () => {
    expect(fimSemanaComercial('2026-07-27')).toBe('2026-08-02');
    expect(fimSemanaComercial('2026-08-02')).toBe('2026-08-02');
  });

  it('addDaysISO soma e subtrai sem drift de fuso', () => {
    expect(addDaysISO('2026-07-31', 1)).toBe('2026-08-01');
    expect(addDaysISO('2026-01-01', -1)).toBe('2025-12-31');
  });
});

describe('agruparRecebimentosPorSemana', () => {
  it('retorna vazio para lista vazia', () => {
    expect(agruparRecebimentosPorSemana([])).toEqual([]);
  });

  it('agrupa dias da mesma semana comercial numa linha só', () => {
    const semanas = agruparRecebimentosPorSemana([
      receb({ dataPagamento: '2026-07-27', valorRecebido: 100 }), // seg
      receb({ dataPagamento: '2026-07-29', valorRecebido: 50 }), // qua
      receb({ dataPagamento: '2026-08-02', valorRecebido: 25 }), // dom (mesma semana)
    ]);
    expect(semanas).toHaveLength(1);
    expect(semanas[0].semanaInicio).toBe('2026-07-27');
    expect(semanas[0].semanaFim).toBe('2026-08-02');
    expect(semanas[0].totalRecebido).toBe(175);
    expect(semanas[0].qtdParcelas).toBe(3);
  });

  it('separa semanas distintas e ordena por semanaInicio', () => {
    const semanas = agruparRecebimentosPorSemana([
      receb({ dataPagamento: '2026-08-03', valorRecebido: 10 }), // semana seguinte
      receb({ dataPagamento: '2026-07-28', valorRecebido: 20 }),
    ]);
    expect(semanas.map((s) => s.semanaInicio)).toEqual(['2026-07-27', '2026-08-03']);
    expect(semanas[0].totalRecebido).toBe(20);
    expect(semanas[1].totalRecebido).toBe(10);
  });

  it('CREDITOS entra no totalRecebido mas NÃO na base de meta', () => {
    const semanas = agruparRecebimentosPorSemana([
      receb({ valorRecebido: 100, formaCategoria: 'AVISTA' }),
      receb({ valorRecebido: 40, formaCategoria: 'CREDITOS' }),
    ]);
    expect(semanas[0].totalRecebido).toBe(140);
    expect(semanas[0].totalRecebidoSemCreditos).toBe(100);
    expect(semanas[0].porCategoria.CREDITOS).toBe(40);
    expect(semanas[0].porCategoria.AVISTA).toBe(100);
  });

  it('soma por origem (VENDA_PERIODO × SALDO_ANTERIOR)', () => {
    const semanas = agruparRecebimentosPorSemana([
      receb({ valorRecebido: 70, origem: 'VENDA_PERIODO' }),
      receb({ valorRecebido: 30, origem: 'SALDO_ANTERIOR' }),
      receb({ valorRecebido: 5, origem: 'SALDO_ANTERIOR' }),
    ]);
    expect(semanas[0].porOrigem.VENDA_PERIODO).toBe(70);
    expect(semanas[0].porOrigem.SALDO_ANTERIOR).toBe(35);
  });

  it('arredonda somas a 2 casas (floats de centavos)', () => {
    const semanas = agruparRecebimentosPorSemana([
      receb({ valorRecebido: 0.1 }),
      receb({ valorRecebido: 0.2 }),
    ]);
    expect(semanas[0].totalRecebido).toBe(0.3);
    expect(semanas[0].totalRecebidoSemCreditos).toBe(0.3);
    expect(semanas[0].porCategoria.AVISTA).toBe(0.3);
  });
});
