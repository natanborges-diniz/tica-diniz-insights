// src/hooks/useComparativoMensal.ts
// Hook para comparar múltiplos meses arbitrários (ano+mês) usando o cache
// vendas_agregado_diario. Mesma lógica de exclusão (DEVOLUCAO/CREDITOS) do
// comparativo anual.

import { useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { EmpresaParam, aplicarFiltroEmpresaSupabase } from '@/services/firebirdBridge';
import { IndicadorComparativo, INDICADORES_LABELS } from './useComparativoAnual';

export type { IndicadorComparativo };
export { INDICADORES_LABELS };

export interface MesRef {
  ano: number;
  mes: number; // 1-12
}

export interface DadosMensais {
  ano: number;
  mes: number;
  label: string;
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
  const fim = `${ano}-${pad(mes)}-${pad(ultimoDia)}`;
  return { inicio, fim };
}

function labelMes(ano: number, mes: number): string {
  return `${MESES_ABREV[mes - 1]}/${String(ano).slice(-2)}`;
}

async function buscarAgregadosPeriodo(
  dataInicio: string,
  dataFim: string,
  empresa: EmpresaParam
) {
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

export interface UseComparativoMensalReturn {
  dados: DadosMensais[];
  loading: boolean;
  error: string | null;
  anosDisponiveis: number[];
  fetchComparativo: (params: { empresa: EmpresaParam; meses: MesRef[] }) => Promise<void>;
}

export function useComparativoMensal(): UseComparativoMensalReturn {
  const [dados, setDados] = useState<DadosMensais[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const anosDisponiveis = useMemo(() => {
    const anoAtual = new Date().getFullYear();
    return [anoAtual, anoAtual - 1, anoAtual - 2, anoAtual - 3];
  }, []);

  const fetchComparativo = useCallback(async (params: { empresa: EmpresaParam; meses: MesRef[] }) => {
    const { empresa, meses } = params;
    if (!meses || meses.length === 0) {
      setDados([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const promises = meses.map(async ({ ano, mes }) => {
        const { inicio, fim } = rangeMes(ano, mes);
        const r = await buscarAgregadosPeriodo(inicio, fim, empresa);
        const percentualDesconto = r.totalBruto > 0 ? (r.totalDesconto / r.totalBruto) * 100 : 0;
        const ticketMedio = r.qtdVendas > 0 ? r.totalVendido / r.qtdVendas : 0;
        return {
          ano,
          mes,
          label: labelMes(ano, mes),
          totalVendido: r.totalVendido,
          totalBruto: r.totalBruto,
          totalDesconto: r.totalDesconto,
          percentualDesconto,
          qtdVendas: r.qtdVendas,
          ticketMedio,
        } as DadosMensais;
      });

      const resultados = await Promise.all(promises);
      resultados.sort((a, b) => (a.ano - b.ano) || (a.mes - b.mes));
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
