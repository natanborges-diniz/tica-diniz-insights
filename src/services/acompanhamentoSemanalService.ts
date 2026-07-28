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
  type MetaSemanal,
  type DivisaoSemanal,
} from './metasSemanaisService';
import { getRecebimentosAgregado } from './recebimentosService';

export interface AcompanhamentoVendedor {
  codVendedor: number;
  vendedorNome: string | null;
  meta: number;
  metaAjustada: boolean;
  realizado: number;
  percentual: number;
  faltante: number;
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
  divisao: DivisaoSemanal;
  vendedores: AcompanhamentoVendedor[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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

  const semanaFim = addDaysISO(semanaInicio, 6);
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

    // por vendedor
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
        };
        porVendedor.set(r.codVendedor, v);
      }
      v.realizado += r.valorRecebido;
    }
    const vendedores = Array.from(porVendedor.values())
      .map((v) => {
        const realizadoV = round2(v.realizado);
        return {
          ...v,
          realizado: realizadoV,
          percentual: v.meta > 0 ? round2((realizadoV / v.meta) * 100) : 0,
          faltante: Math.max(0, round2(v.meta - realizadoV)),
        };
      })
      .sort((a, b) => b.realizado - a.realizado);

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
      divisao,
      vendedores,
    });
  }

  return resultado.sort((a, b) => b.realizado - a.realizado);
}
