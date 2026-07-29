// src/services/acompanhamentoSemanalService.ts
// Fase 2 (base da Fase 3) — meta × realizado por semana comercial.
// Junta metas_semanais (LOJA materializada + derivações) com
// recebimentos_agregado_diario. Realizado = recebido sem CREDITOS (regra §2);
// a subtração de devoluções com RESTITUIÇÃO é aplicada no FECHAMENTO (Fase 4),
// via bridge /vendas/devolucoes-restituicao — aqui é acompanhamento de ritmo.

import { derivarMetaVendedor, calcularRitmo } from '@/lib/metas/metasSemanais';
import { addDaysISO } from '@/lib/recebimentos/semanaComercial';
import {
  getMetasSemanais,
  getDivisaoSemanal,
  getPremiosConfig,
  type MetaSemanal,
  type DivisaoSemanal,
} from './metasSemanaisService';
import { getRecebimentosAgregado } from './recebimentosService';

export type StatusRitmo = 'ATINGIDA' | 'NO_RITMO' | 'ATENCAO' | 'CRITICO';

export interface AcompanhamentoVendedor {
  codVendedor: number;
  vendedorNome: string | null;
  meta: number;
  metaAjustada: boolean;
  realizado: number;
  percentual: number;
  faltante: number;
  status: StatusRitmo;
  /** Detalhamento obrigatório por origem (§2 do plano) */
  porOrigem: { vendaPeriodo: number; saldoAnterior: number };
  /** Faixa de prêmio ativa atingida (premios_config tipo FAIXA), se houver */
  premioFaixa: {
    percentualMetaMin: number;
    percentualPremio: number;
    tipoValor?: 'PERCENTUAL' | 'FIXO';
    valorFixo?: number;
  } | null;
}

export interface AcompanhamentoLoja {
  codEmpresa: number;
  nomeReferencia: string | null;
  semanaInicio: string;
  semanaFim: string;
  meta: number;
  realizado: number;
  percentual: number;
  faltante: number;
  necessarioPorDia: number;
  diasUteisTotal: number;
  status: StatusRitmo;
  porOrigem: { vendaPeriodo: number; saldoAnterior: number };
  divisao: DivisaoSemanal;
  vendedores: AcompanhamentoVendedor[];
}

export interface SemanaDisponivel {
  semanaInicio: string;
  semanaFim: string;
  ano: number;
  mes: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Semáforo: compara o % realizado com o esperado pro-rata (fração da semana já
 * decorrida em dias corridos).
 */
function statusRitmo(percentual: number, fracaoDecorrida: number): StatusRitmo {
  if (percentual >= 100) return 'ATINGIDA';
  const esperado = fracaoDecorrida * 100;
  if (percentual >= esperado * 0.95) return 'NO_RITMO';
  if (percentual >= esperado * 0.75) return 'ATENCAO';
  return 'CRITICO';
}

/** Semanas com metas geradas (para o seletor da tela), mais recente primeiro. */
export async function listarSemanasDisponiveis(): Promise<SemanaDisponivel[]> {
  const metas = await getMetasSemanais({ tipo: 'LOJA' });
  const vistas = new Map<string, SemanaDisponivel>();
  metas.forEach((m) => {
    if (!vistas.has(m.semanaInicio)) {
      vistas.set(m.semanaInicio, {
        semanaInicio: m.semanaInicio,
        semanaFim: m.semanaFim,
        ano: m.ano,
        mes: m.mes,
      });
    }
  });
  return Array.from(vistas.values()).sort((a, b) => b.semanaInicio.localeCompare(a.semanaInicio));
}

/**
 * Acompanhamento da semana comercial: uma entrada por loja com meta,
 * realizado (sem CREDITOS), % e ritmo, mais o detalhamento por vendedor com a
 * meta derivada (ou ajustada) de cada um.
 *
 * `diasUteisRestantes` é aproximado pelos dias úteis proporcionais restantes
 * da semana (dias corridos até semana_fim ÷ 7 × dias úteis) — o cálculo exato
 * por calendário fica na UI se necessário.
 */
export async function getAcompanhamentoSemanal(
  semanaInicio: string,
  codEmpresas?: number[]
): Promise<AcompanhamentoLoja[]> {
  const metasLoja = (
    await getMetasSemanais({ tipo: 'LOJA', semanaInicio })
  ).filter((m) => !codEmpresas?.length || codEmpresas.includes(m.codReferencia));
  if (!metasLoja.length) return [];

  // cortes manuais podem ter semanas ≠ 7 dias — usar o fim gravado na meta
  const semanaFim = metasLoja[0].semanaFim || addDaysISO(semanaInicio, 6);
  const hoje = new Date().toISOString().split('T')[0];

  const recebimentos = await getRecebimentosAgregado({
    empresa: codEmpresas?.length ? codEmpresas.join(',') : 'ALL',
    dataInicio: semanaInicio,
    dataFim: semanaFim,
  });

  // metas VENDEDOR ajustadas da semana (precedem a derivada)
  const ajustadasVendedor = new Map<number, number>();
  (await getMetasSemanais({ tipo: 'VENDEDOR', semanaInicio }))
    .filter((m) => m.origem === 'AJUSTADA')
    .forEach((m) => ajustadasVendedor.set(m.codReferencia, m.metaValor));

  // faixas de prêmio ativas (maior mínimo primeiro = melhor faixa atingida)
  const faixasPremio = (await getPremiosConfig())
    .filter((p) => p.ativo && p.tipo === 'FAIXA' && p.percentualMetaMin != null)
    .sort((a, b) => (b.percentualMetaMin ?? 0) - (a.percentualMetaMin ?? 0));
  const premioPara = (percentual: number) => {
    const faixa = faixasPremio.find((f) => percentual >= (f.percentualMetaMin ?? Infinity));
    return faixa
      ? {
          percentualMetaMin: faixa.percentualMetaMin!,
          percentualPremio: faixa.percentualPremio,
          tipoValor: faixa.tipoValor,
          valorFixo: faixa.valorFixo,
        }
      : null;
  };

  // fração da semana já decorrida (dias corridos), para o semáforo pro-rata
  const totalDiasSemana =
    Math.round(
      (new Date(semanaFim + 'T12:00:00Z').getTime() -
        new Date(semanaInicio + 'T12:00:00Z').getTime()) / 86400000
    ) + 1;
  const diasDecorridos =
    hoje >= semanaFim
      ? totalDiasSemana
      : hoje < semanaInicio
        ? 0
        : Math.round(
            (new Date(hoje + 'T12:00:00Z').getTime() -
              new Date(semanaInicio + 'T12:00:00Z').getTime()) / 86400000
          ) + 1;
  const fracaoDecorrida = totalDiasSemana > 0 ? diasDecorridos / totalDiasSemana : 1;

  const resultado: AcompanhamentoLoja[] = [];
  for (const metaLoja of metasLoja) {
    const codEmpresa = metaLoja.codReferencia;
    const daLoja = recebimentos.filter((r) => r.codEmpresa === codEmpresa);
    const realizado = round2(
      daLoja
        .filter((r) => r.formaCategoria !== 'CREDITOS')
        .reduce((s, r) => s + r.valorRecebido, 0)
    );

    const divisao = await getDivisaoSemanal(codEmpresa, semanaInicio);
    const metaVendedorPadrao = derivarMetaVendedor(
      metaLoja.metaValor,
      divisao.percentualDivisao,
      divisao.numVendedores
    );

    // dias úteis restantes aproximados (proporcional aos dias corridos)
    const diasCorridosRestantes =
      hoje >= semanaFim
        ? 0
        : Math.max(
            0,
            Math.round(
              (new Date(semanaFim + 'T12:00:00Z').getTime() -
                new Date((hoje > semanaInicio ? hoje : semanaInicio) + 'T12:00:00Z').getTime()) /
                86400000
            )
          );
    const diasUteisRestantes = Math.min(
      metaLoja.diasUteis,
      Math.round((diasCorridosRestantes / 7) * metaLoja.diasUteis)
    );

    const ritmo = calcularRitmo(metaLoja.metaValor, realizado, diasUteisRestantes);

    // por vendedor (com detalhamento por origem — obrigação do §2)
    const porVendedor = new Map<number, AcompanhamentoVendedor>();
    for (const r of daLoja) {
      if (r.formaCategoria === 'CREDITOS') continue;
      let v = porVendedor.get(r.codVendedor);
      if (!v) {
        const metaAjustada = ajustadasVendedor.get(r.codVendedor);
        v = {
          codVendedor: r.codVendedor,
          vendedorNome: r.vendedorNome,
          meta: metaAjustada ?? metaVendedorPadrao,
          metaAjustada: metaAjustada != null,
          realizado: 0,
          percentual: 0,
          faltante: 0,
          status: 'CRITICO',
          porOrigem: { vendaPeriodo: 0, saldoAnterior: 0 },
          premioFaixa: null,
        };
        porVendedor.set(r.codVendedor, v);
      }
      v.realizado += r.valorRecebido;
      if (r.origem === 'SALDO_ANTERIOR') v.porOrigem.saldoAnterior += r.valorRecebido;
      else v.porOrigem.vendaPeriodo += r.valorRecebido;
    }
    const vendedores = Array.from(porVendedor.values())
      .map((v) => {
        const realizadoV = round2(v.realizado);
        const percentual = v.meta > 0 ? round2((realizadoV / v.meta) * 100) : 0;
        return {
          ...v,
          realizado: realizadoV,
          percentual,
          faltante: Math.max(0, round2(v.meta - realizadoV)),
          status: statusRitmo(percentual, fracaoDecorrida),
          porOrigem: {
            vendaPeriodo: round2(v.porOrigem.vendaPeriodo),
            saldoAnterior: round2(v.porOrigem.saldoAnterior),
          },
          premioFaixa: premioPara(percentual),
        };
      })
      .sort((a, b) => b.realizado - a.realizado);

    const porOrigemLoja = daLoja
      .filter((r) => r.formaCategoria !== 'CREDITOS')
      .reduce(
        (acc, r) => {
          if (r.origem === 'SALDO_ANTERIOR') acc.saldoAnterior += r.valorRecebido;
          else acc.vendaPeriodo += r.valorRecebido;
          return acc;
        },
        { vendaPeriodo: 0, saldoAnterior: 0 }
      );

    resultado.push({
      codEmpresa,
      nomeReferencia: metaLoja.nomeReferencia,
      semanaInicio,
      semanaFim,
      meta: metaLoja.metaValor,
      realizado,
      percentual: ritmo.percentual,
      faltante: ritmo.faltante,
      necessarioPorDia: ritmo.necessarioPorDia,
      diasUteisTotal: metaLoja.diasUteis,
      status: statusRitmo(ritmo.percentual, fracaoDecorrida),
      porOrigem: {
        vendaPeriodo: round2(porOrigemLoja.vendaPeriodo),
        saldoAnterior: round2(porOrigemLoja.saldoAnterior),
      },
      divisao,
      vendedores,
    });
  }

  return resultado.sort((a, b) => b.realizado - a.realizado);
}
