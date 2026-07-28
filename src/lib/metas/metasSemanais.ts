// src/lib/metas/metasSemanais.ts
// Fase 2 — Metas semanais (docs/REVISAO_VENDAS_METAS.md §5.3).
// Lógica PURA (testável em vitest, sem Supabase), mesmo padrão de
// src/lib/recebimentos/semanaComercial.ts.
//
// Regras (Natan, 2026-07-28):
//   * meta diária = meta mensal da LOJA ÷ dias úteis do período comercial
//   * meta semanal = meta diária × dias úteis daquela semana (semanas que
//     cruzam o mês contam só os dias úteis DENTRO do período)
//   * meta VENDEDOR = meta_loja(semana) × percentual_divisao/100 ÷ num_vendedores
//   * sugestão de meta mensal = realizado do mesmo mês do ano anterior × 1,10

import {
  addDaysISO,
  inicioSemanaComercial,
} from '@/lib/recebimentos/semanaComercial';
import {
  calcularDiasUteis,
  type Feriado,
  type LojaConfiguracao,
  type LojaExcecao,
} from '@/lib/metas/calendario';

export interface SemanaDoPeriodo {
  /** Segunda-feira da semana comercial (YYYY-MM-DD) */
  semanaInicio: string;
  /** Domingo (YYYY-MM-DD) */
  semanaFim: string;
  /** Primeiro dia da semana DENTRO do período (>= início do período) */
  inicioNoPeriodo: string;
  /** Último dia da semana DENTRO do período (<= fim do período) */
  fimNoPeriodo: string;
  /** Dias úteis da semana dentro do período, pelas regras da loja */
  diasUteis: number;
}

export interface MetaSemanalCalculada extends SemanaDoPeriodo {
  metaValor: number;
}

function toISO(d: Date): string {
  return d.toISOString().split('T')[0];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Divide o período comercial (ex.: 21/06→20/07) em semanas comerciais
 * (segunda→domingo), truncadas nas bordas do período, com dias úteis por
 * semana segundo o calendário da loja.
 */
export function gerarSemanasDoPeriodo(
  dataInicio: Date,
  dataFim: Date,
  config: LojaConfiguracao | null,
  feriados: Feriado[],
  excecoes: LojaExcecao[]
): SemanaDoPeriodo[] {
  const inicioISO = toISO(dataInicio);
  const fimISO = toISO(dataFim);
  const semanas: SemanaDoPeriodo[] = [];

  let cursor = inicioSemanaComercial(inicioISO);
  while (cursor <= fimISO) {
    const semanaFim = addDaysISO(cursor, 6);
    const inicioNoPeriodo = cursor < inicioISO ? inicioISO : cursor;
    const fimNoPeriodo = semanaFim > fimISO ? fimISO : semanaFim;

    const diasUteis = calcularDiasUteis(
      new Date(inicioNoPeriodo + 'T12:00:00Z'),
      new Date(fimNoPeriodo + 'T12:00:00Z'),
      config,
      feriados,
      excecoes
    );

    semanas.push({ semanaInicio: cursor, semanaFim, inicioNoPeriodo, fimNoPeriodo, diasUteis });
    cursor = addDaysISO(cursor, 7);
  }

  return semanas;
}

/**
 * Distribui a meta mensal entre as semanas proporcionalmente aos dias úteis.
 * Garante que a SOMA das semanas == meta mensal (ajuste de arredondamento na
 * última semana com dias úteis).
 */
export function calcularMetaSemanalLoja(
  metaMensal: number,
  semanas: SemanaDoPeriodo[]
): MetaSemanalCalculada[] {
  const totalDiasUteis = semanas.reduce((s, w) => s + w.diasUteis, 0);
  if (totalDiasUteis <= 0 || metaMensal <= 0) {
    return semanas.map((w) => ({ ...w, metaValor: 0 }));
  }

  const metaDiaria = metaMensal / totalDiasUteis;
  const result = semanas.map((w) => ({
    ...w,
    metaValor: round2(metaDiaria * w.diasUteis),
  }));

  // fechar a soma exatamente na meta mensal (ajuste na última semana útil)
  const soma = round2(result.reduce((s, w) => s + w.metaValor, 0));
  const diff = round2(metaMensal - soma);
  if (diff !== 0) {
    for (let i = result.length - 1; i >= 0; i--) {
      if (result[i].diasUteis > 0) {
        result[i].metaValor = round2(result[i].metaValor + diff);
        break;
      }
    }
  }
  return result;
}

/**
 * meta VENDEDOR = meta da loja na semana × (percentualDivisao/100) ÷ numVendedores
 */
export function derivarMetaVendedor(
  metaSemanaLoja: number,
  percentualDivisao: number,
  numVendedores: number
): number {
  if (numVendedores <= 0) return 0;
  return round2((metaSemanaLoja * (percentualDivisao / 100)) / numVendedores);
}

/** Sugestão de meta mensal: realizado do mesmo mês do ano anterior + 10%. */
export function sugerirMetaMensal(realizadoAnoAnterior: number): number {
  return round2(realizadoAnoAnterior * 1.1);
}

/**
 * % de atingimento e ritmo: quanto falta por dia útil restante para bater a
 * meta da semana.
 */
export function calcularRitmo(
  metaSemana: number,
  realizadoSemana: number,
  diasUteisRestantes: number
): { percentual: number; faltante: number; necessarioPorDia: number } {
  const faltante = Math.max(0, round2(metaSemana - realizadoSemana));
  return {
    percentual: metaSemana > 0 ? round2((realizadoSemana / metaSemana) * 100) : 0,
    faltante,
    necessarioPorDia:
      diasUteisRestantes > 0 ? round2(faltante / diasUteisRestantes) : faltante,
  };
}
