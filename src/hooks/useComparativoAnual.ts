// src/hooks/useComparativoAnual.ts
// Hook para comparativo de indicadores entre períodos equivalentes em anos diferentes
// Utiliza cache vendas_agregado_diario (mesma lógica do dashboard principal)

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

export interface DadosAnuais {
  ano: number;
  label: string; // e.g. "2024", "2023"
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
  }) => Promise<void>;
}

// ============================================
// HELPERS
// ============================================

/**
 * Desloca um período para um ano diferente mantendo mes/dia
 */
function deslocarPeriodoParaAno(dataInicio: string, dataFim: string, anoAlvo: number): { inicio: string; fim: string } {
  const ini = new Date(dataInicio + 'T12:00:00');
  const fim = new Date(dataFim + 'T12:00:00');
  
  const anoOriginal = ini.getFullYear();
  const diff = anoAlvo - anoOriginal;
  
  const novoIni = new Date(ini);
  novoIni.setFullYear(novoIni.getFullYear() + diff);
  
  const novoFim = new Date(fim);
  novoFim.setFullYear(novoFim.getFullYear() + diff);
  
  return {
    inicio: novoIni.toISOString().split('T')[0],
    fim: novoFim.toISOString().split('T')[0],
  };
}

/**
 * Busca dados agregados do cache para um período específico
 */
async function buscarAgregadosPeriodo(
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

  if (error) {
    console.error('[useComparativoAnual] Erro:', error);
    throw new Error(error.message);
  }

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
// HOOK PRINCIPAL
// ============================================

export function useComparativoAnual(): ComparativoResult {
  const [dados, setDados] = useState<DadosAnuais[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Anos disponíveis para comparação (ano atual até 3 anos atrás)
  const anosDisponiveis = useMemo(() => {
    const anoAtual = new Date().getFullYear();
    return [anoAtual, anoAtual - 1, anoAtual - 2, anoAtual - 3];
  }, []);

  const fetchComparativo = useCallback(async (params: {
    dataInicio: string;
    dataFim: string;
    empresa: EmpresaParam;
    anosComparar: number[];
  }) => {
    const { dataInicio, dataFim, empresa, anosComparar } = params;
    
    if (anosComparar.length === 0) {
      setDados([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const anoOriginal = new Date(dataInicio + 'T12:00:00').getFullYear();
      
      const promises = anosComparar.map(async (ano) => {
        const periodo = deslocarPeriodoParaAno(dataInicio, dataFim, ano);
        const resultado = await buscarAgregadosPeriodo(periodo.inicio, periodo.fim, empresa);

        const percentualDesconto = resultado.totalBruto > 0
          ? (resultado.totalDesconto / resultado.totalBruto) * 100
          : 0;
        const ticketMedio = resultado.qtdVendas > 0
          ? resultado.totalVendido / resultado.qtdVendas
          : 0;

        return {
          ano,
          label: String(ano),
          totalVendido: resultado.totalVendido,
          totalBruto: resultado.totalBruto,
          totalDesconto: resultado.totalDesconto,
          percentualDesconto,
          qtdVendas: resultado.qtdVendas,
          ticketMedio,
        } as DadosAnuais;
      });

      const resultados = await Promise.all(promises);
      // Ordenar por ano crescente
      resultados.sort((a, b) => a.ano - b.ano);
      setDados(resultados);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao buscar comparativo';
      setError(msg);
      setDados([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { dados, loading, error, anosDisponiveis, fetchComparativo };
}
