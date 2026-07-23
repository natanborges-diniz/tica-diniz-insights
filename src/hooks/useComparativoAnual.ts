// src/hooks/useComparativoAnual.ts
// Hook para comparativo entre períodos equivalentes em anos diferentes.
// Suporta multi-empresa: gera uma série por combinação (ano × empresa)
// quando mais de uma empresa é selecionada.

import { useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { EmpresaParam, aplicarFiltroEmpresaSupabase } from '@/services/firebirdBridge';

// ============================================
// TIPOS
// ============================================

export type IndicadorComparativo =
  | 'totalVendido'
  | 'totalBruto'
  | 'totalDesconto'
  | 'percentualDesconto'
  | 'qtdVendas'
  | 'ticketMedio';

export const INDICADORES_LABELS: Record<IndicadorComparativo, string> = {
  totalVendido: 'Faturamento (Vendas Válidas)',
  totalBruto: 'Venda Bruta',
  totalDesconto: 'Total Desconto',
  percentualDesconto: '% Desconto',
  qtdVendas: 'Qtd. Transações',
  ticketMedio: 'Ticket Médio',
};

export interface EmpresaCatalog {
  codEmpresa: number;
  nome: string;
}

export interface DadosAnuais {
  key: string;
  label: string;
  ano: number;
  empresaCod: number | null; // null => todas somadas
  empresaNome: string | null;
  totalVendido: number;
  totalBruto: number;
  totalDesconto: number;
  percentualDesconto: number;
  qtdVendas: number;
  ticketMedio: number;
}

export interface ComparativoResult {
  dados: DadosAnuais[];
  loading: boolean;
  error: string | null;
  anosDisponiveis: number[];
  fetchComparativo: (params: {
    dataInicio: string;
    dataFim: string;
    empresa: EmpresaParam;
    anosComparar: number[];
    empresasCatalogo?: EmpresaCatalog[];
  }) => Promise<void>;
}

// ============================================
// HELPERS
// ============================================

function deslocarPeriodoParaAno(dataInicio: string, dataFim: string, anoAlvo: number): { inicio: string; fim: string } {
  const ini = new Date(dataInicio + 'T12:00:00');
  const fim = new Date(dataFim + 'T12:00:00');
  const diff = anoAlvo - ini.getFullYear();
  const novoIni = new Date(ini);
  novoIni.setFullYear(novoIni.getFullYear() + diff);
  const novoFim = new Date(fim);
  novoFim.setFullYear(novoFim.getFullYear() + diff);
  return {
    inicio: novoIni.toISOString().split('T')[0],
    fim: novoFim.toISOString().split('T')[0],
  };
}

export async function buscarAgregadosPeriodo(
  dataInicio: string,
  dataFim: string,
  empresa: EmpresaParam
): Promise<{
  totalVendido: number;
  totalBruto: number;
  totalDesconto: number;
  qtdVendas: number;
}> {
  let query = supabase
    .from('vendas_agregado_diario')
    .select('total_vendido, total_bruto, total_desconto, qtd_vendas, forma_pagamento')
    .gte('data', dataInicio)
    .lte('data', dataFim);

  query = aplicarFiltroEmpresaSupabase(query, empresa);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let totalVendido = 0;
  let totalBruto = 0;
  let totalDesconto = 0;
  let qtdVendas = 0;

  (data || []).forEach((d) => {
    const fp = (d.forma_pagamento || '').toUpperCase().trim();
    const isDevolucao = fp === 'DEVOLUCAO';
    const isCredito = fp === 'CREDITOS' || fp === 'CREDITO';
    if (!isDevolucao && !isCredito) {
      totalVendido += Number(d.total_vendido) || 0;
      totalBruto += Number(d.total_bruto) || 0;
      totalDesconto += Number(d.total_desconto) || 0;
      qtdVendas += Number(d.qtd_vendas) || 0;
    }
  });

  return { totalVendido, totalBruto, totalDesconto, qtdVendas };
}

// ============================================
// HOOK
// ============================================

export function useComparativoAnual(): ComparativoResult {
  const [dados, setDados] = useState<DadosAnuais[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const anosDisponiveis = useMemo(() => {
    const anoAtual = new Date().getFullYear();
    return [anoAtual, anoAtual - 1, anoAtual - 2, anoAtual - 3];
  }, []);

  const fetchComparativo = useCallback(async (params: {
    dataInicio: string;
    dataFim: string;
    empresa: EmpresaParam;
    anosComparar: number[];
    empresasCatalogo?: EmpresaCatalog[];
  }) => {
    const { dataInicio, dataFim, empresa, anosComparar, empresasCatalogo = [] } = params;
    if (anosComparar.length === 0) {
      setDados([]);
      return;
    }

    setLoading(true);
    setError(null);

    // Determinar empresas a iterar
    const multiEmpresa = Array.isArray(empresa) && empresa.length > 1;
    const empresasIter: (number | null)[] = multiEmpresa ? (empresa as number[]) : [null];

    try {
      const tasks: Promise<DadosAnuais>[] = [];
      for (const ano of anosComparar) {
        const periodo = deslocarPeriodoParaAno(dataInicio, dataFim, ano);
        for (const emp of empresasIter) {
          const empParaFetch: EmpresaParam = emp === null ? empresa : emp;
          const nome = emp === null
            ? null
            : empresasCatalogo.find((e) => e.codEmpresa === emp)?.nome ?? `Loja ${emp}`;
          const label = emp === null ? String(ano) : `${ano} · ${nome}`;
          tasks.push(
            buscarAgregadosPeriodo(periodo.inicio, periodo.fim, empParaFetch).then((r) => {
              const percentualDesconto = r.totalBruto > 0 ? (r.totalDesconto / r.totalBruto) * 100 : 0;
              const ticketMedio = r.qtdVendas > 0 ? r.totalVendido / r.qtdVendas : 0;
              return {
                key: `${ano}-${emp ?? 'all'}`,
                label,
                ano,
                empresaCod: emp,
                empresaNome: nome,
                totalVendido: r.totalVendido,
                totalBruto: r.totalBruto,
                totalDesconto: r.totalDesconto,
                percentualDesconto,
                qtdVendas: r.qtdVendas,
                ticketMedio,
              } as DadosAnuais;
            })
          );
        }
      }

      const resultados = await Promise.all(tasks);
      resultados.sort((a, b) => (a.ano - b.ano) || ((a.empresaCod ?? 0) - (b.empresaCod ?? 0)));
      setDados(resultados);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao buscar comparativo');
      setDados([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { dados, loading, error, anosDisponiveis, fetchComparativo };
}
