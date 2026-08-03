// src/hooks/useComparativoPeriodos.ts
// Comparação de dois períodos (Base vs Comparação) com quebra opcional por loja.
// Reaproveita `buscarAgregadosPeriodo` já exposta em useComparativoAnual.

import { useState, useCallback, useEffect } from 'react';
import { EmpresaParam } from '@/services/firebirdBridge';
import { buscarAgregadosPeriodo, IndicadorComparativo } from './useComparativoAnual';
import { unificarCatalogoLojas } from '@/lib/metas/lojas';

export type { IndicadorComparativo } from './useComparativoAnual';
export { INDICADORES_LABELS } from './useComparativoAnual';

export interface EmpresaCatalog {
  codEmpresa: number;
  nome: string;
}

export interface AgregadoPeriodo {
  totalVendido: number;
  totalBruto: number;
  totalDesconto: number;
  percentualDesconto: number;
  qtdVendas: number;
  ticketMedio: number;
}

export interface LinhaComparativa {
  chave: string;            // "loja-<cod>" | "total"
  empresaCod: number | null;
  empresaNome: string;      // "Todas as lojas" quando total
  base: AgregadoPeriodo;
  comp: AgregadoPeriodo;
}

export interface UseComparativoPeriodosParams {
  baseInicio: string;
  baseFim: string;
  compInicio: string;
  compFim: string;
  empresa: EmpresaParam;           // filtro global
  agruparPorLoja: boolean;
  empresasCatalogo: EmpresaCatalog[];
}

export interface UseComparativoPeriodosResult {
  linhas: LinhaComparativa[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

function toAgregado(r: {
  totalVendido: number; totalBruto: number; totalDesconto: number; qtdVendas: number;
}): AgregadoPeriodo {
  const percentualDesconto = r.totalBruto > 0 ? (r.totalDesconto / r.totalBruto) * 100 : 0;
  const ticketMedio = r.qtdVendas > 0 ? r.totalVendido / r.qtdVendas : 0;
  return { ...r, percentualDesconto, ticketMedio };
}

interface UnidadeLoja {
  codEmpresa: number;
  nome: string;
  cods: number[];
}

/**
 * Resolve as UNIDADES de loja a iterar quando agrupamos por loja.
 * Regra 13/18: as duas empresas viram UMA unidade "DINIZ SUPER SHOPPING"
 * (soma da movimentação, nome atual).
 */
function resolveUnidades(empresa: EmpresaParam, catalogo: EmpresaCatalog[]): UnidadeLoja[] {
  const unificado = unificarCatalogoLojas(catalogo);
  if (empresa === 'ALL' || empresa === null || empresa === undefined) {
    return unificado;
  }
  const cods = Array.isArray(empresa)
    ? empresa
    : [typeof empresa === 'string' ? parseInt(empresa, 10) : empresa].filter(
        (n) => !Number.isNaN(n as number)
      ) as number[];
  return unificado.filter((u) => u.cods.some((c) => cods.includes(c)));
}

export function useComparativoPeriodos(
  params: UseComparativoPeriodosParams
): UseComparativoPeriodosResult {
  const {
    baseInicio, baseFim, compInicio, compFim,
    empresa, agruparPorLoja, empresasCatalogo,
  } = params;

  const [linhas, setLinhas] = useState<LinhaComparativa[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  useEffect(() => {
    if (!baseInicio || !baseFim || !compInicio || !compFim) return;

    let cancel = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        let resultado: LinhaComparativa[] = [];

        if (agruparPorLoja) {
          const unidades = resolveUnidades(empresa, empresasCatalogo);
          if (unidades.length === 0) {
            const [b, c] = await Promise.all([
              buscarAgregadosPeriodo(baseInicio, baseFim, empresa),
              buscarAgregadosPeriodo(compInicio, compFim, empresa),
            ]);
            resultado = [{
              chave: 'total',
              empresaCod: null,
              empresaNome: 'Todas as lojas',
              base: toAgregado(b),
              comp: toAgregado(c),
            }];
          } else {
            const pares = await Promise.all(
              unidades.map(async (u) => {
                const [b, c] = await Promise.all([
                  buscarAgregadosPeriodo(baseInicio, baseFim, u.cods),
                  buscarAgregadosPeriodo(compInicio, compFim, u.cods),
                ]);
                return {
                  chave: `loja-${u.codEmpresa}`,
                  empresaCod: u.codEmpresa,
                  empresaNome: u.nome,
                  base: toAgregado(b),
                  comp: toAgregado(c),
                } as LinhaComparativa;
              })
            );
            // Ordena por faturamento base decrescente
            resultado = pares.sort((a, b) => b.base.totalVendido - a.base.totalVendido);
          }
        } else {
          const [b, c] = await Promise.all([
            buscarAgregadosPeriodo(baseInicio, baseFim, empresa),
            buscarAgregadosPeriodo(compInicio, compFim, empresa),
          ]);
          resultado = [{
            chave: 'total',
            empresaCod: null,
            empresaNome: 'Todas as lojas',
            base: toAgregado(b),
            comp: toAgregado(c),
          }];
        }

        if (!cancel) setLinhas(resultado);
      } catch (e) {
        if (!cancel) {
          setError(e instanceof Error ? e.message : 'Erro ao buscar comparativo');
          setLinhas([]);
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => { cancel = true; };
  }, [
    baseInicio, baseFim, compInicio, compFim,
    JSON.stringify(empresa), agruparPorLoja,
    JSON.stringify(empresasCatalogo.map((e) => e.codEmpresa)),
    reloadTick,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  return { linhas, loading, error, reload };
}

/** Presets de deslocamento do período base. */
export function shiftPeriodoAnos(inicio: string, fim: string, anos: number) {
  const ini = new Date(inicio + 'T12:00:00');
  const fmi = new Date(fim + 'T12:00:00');
  ini.setFullYear(ini.getFullYear() + anos);
  fmi.setFullYear(fmi.getFullYear() + anos);
  return { inicio: ini.toISOString().split('T')[0], fim: fmi.toISOString().split('T')[0] };
}

export function shiftPeriodoMeses(inicio: string, fim: string, meses: number) {
  const ini = new Date(inicio + 'T12:00:00');
  const fmi = new Date(fim + 'T12:00:00');
  ini.setMonth(ini.getMonth() + meses);
  fmi.setMonth(fmi.getMonth() + meses);
  return { inicio: ini.toISOString().split('T')[0], fim: fmi.toISOString().split('T')[0] };
}

export type PresetComparacao = 'anoAnterior' | 'mesAnterior' | 'personalizado';

export function calcPeriodoPreset(
  baseInicio: string, baseFim: string, preset: PresetComparacao
): { inicio: string; fim: string } | null {
  switch (preset) {
    case 'anoAnterior': return shiftPeriodoAnos(baseInicio, baseFim, -1);
    case 'mesAnterior': return shiftPeriodoMeses(baseInicio, baseFim, -1);
    default: return null;
  }
}
