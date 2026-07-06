// src/hooks/useComparativoMensal.ts
// Hook para comparar múltiplos meses (ano+mês) arbitrários.
// Suporta multi-empresa: gera uma série por (mês × empresa) quando N > 1.

import { useState, useCallback, useMemo } from 'react';
import { EmpresaParam } from '@/services/firebirdBridge';
import {
  IndicadorComparativo,
  INDICADORES_LABELS,
  EmpresaCatalog,
  buscarAgregadosPeriodo,
} from './useComparativoAnual';

export type { IndicadorComparativo, EmpresaCatalog };
export { INDICADORES_LABELS };

export interface MesRef {
  ano: number;
  mes: number; // 1-12
}

export interface DadosMensais {
  key: string;
  label: string;
  ano: number;
  mes: number;
  empresaCod: number | null;
  empresaNome: string | null;
  totalVendido: number;
  totalBruto: number;
  totalDesconto: number;
  percentualDesconto: number;
  qtdVendas: number;
  ticketMedio: number;
}

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function rangeMes(ano: number, mes: number): { inicio: string; fim: string } {
  const inicio = `${ano}-${pad(mes)}-01`;
  const ultimoDia = new Date(ano, mes, 0).getDate();
  return { inicio, fim: `${ano}-${pad(mes)}-${pad(ultimoDia)}` };
}
function labelMes(ano: number, mes: number): string {
  return `${MESES_ABREV[mes - 1]}/${String(ano).slice(-2)}`;
}

export interface UseComparativoMensalReturn {
  dados: DadosMensais[];
  loading: boolean;
  error: string | null;
  anosDisponiveis: number[];
  fetchComparativo: (params: {
    empresa: EmpresaParam;
    meses: MesRef[];
    empresasCatalogo?: EmpresaCatalog[];
  }) => Promise<void>;
}

export function useComparativoMensal(): UseComparativoMensalReturn {
  const [dados, setDados] = useState<DadosMensais[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const anosDisponiveis = useMemo(() => {
    const anoAtual = new Date().getFullYear();
    return [anoAtual, anoAtual - 1, anoAtual - 2, anoAtual - 3];
  }, []);

  const fetchComparativo = useCallback(async (params: {
    empresa: EmpresaParam;
    meses: MesRef[];
    empresasCatalogo?: EmpresaCatalog[];
  }) => {
    const { empresa, meses, empresasCatalogo = [] } = params;
    if (!meses || meses.length === 0) {
      setDados([]);
      return;
    }

    setLoading(true);
    setError(null);

    const multiEmpresa = Array.isArray(empresa) && empresa.length > 1;
    const empresasIter: (number | null)[] = multiEmpresa ? (empresa as number[]) : [null];

    try {
      const tasks: Promise<DadosMensais>[] = [];
      for (const { ano, mes } of meses) {
        const { inicio, fim } = rangeMes(ano, mes);
        for (const emp of empresasIter) {
          const empParaFetch: EmpresaParam = emp === null ? empresa : emp;
          const nome = emp === null
            ? null
            : empresasCatalogo.find((e) => e.codEmpresa === emp)?.nome ?? `Loja ${emp}`;
          const baseLabel = labelMes(ano, mes);
          const label = emp === null ? baseLabel : `${baseLabel} · ${nome}`;
          tasks.push(
            buscarAgregadosPeriodo(inicio, fim, empParaFetch).then((r) => {
              const percentualDesconto = r.totalBruto > 0 ? (r.totalDesconto / r.totalBruto) * 100 : 0;
              const ticketMedio = r.qtdVendas > 0 ? r.totalVendido / r.qtdVendas : 0;
              return {
                key: `${ano}-${mes}-${emp ?? 'all'}`,
                label,
                ano,
                mes,
                empresaCod: emp,
                empresaNome: nome,
                totalVendido: r.totalVendido,
                totalBruto: r.totalBruto,
                totalDesconto: r.totalDesconto,
                percentualDesconto,
                qtdVendas: r.qtdVendas,
                ticketMedio,
              } as DadosMensais;
            })
          );
        }
      }

      const resultados = await Promise.all(tasks);
      resultados.sort((a, b) =>
        (a.ano - b.ano) || (a.mes - b.mes) || ((a.empresaCod ?? 0) - (b.empresaCod ?? 0))
      );
      setDados(resultados);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao buscar comparativo mensal');
      setDados([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { dados, loading, error, anosDisponiveis, fetchComparativo };
}
