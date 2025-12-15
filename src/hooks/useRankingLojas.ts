import { useState, useMemo, useCallback } from "react";
import { getResumoEmpresaVendedor, ResumoEmpresaVendedor } from "@/services/vendasService";
import { getMetasPorPeriodo, MetaVenda } from "@/services/metasService";
import { gerarDiretrizes } from "@/services/aiDiretrizesService";
import { getDefaultPeriodoMesAtual } from "@/utils/dateValidation";

export interface RankingLoja {
  posicao: number;
  codEmpresa: number;
  empresa: string;
  totalVendido: number;
  ticketMedio: number;
  qtdTransacoes: number;
  totalDevolucao: number;
  percentualDevolucao: number;
  meta?: MetaVenda;
  percentualMeta?: number;
  variacao?: number;
}

export interface RankingLojasFilters {
  dataInicio: string;
  dataFim: string;
}

export function useRankingLojas() {
  const defaultPeriodo = getDefaultPeriodoMesAtual();
  
  const [filters, setFilters] = useState<RankingLojasFilters>({
    dataInicio: defaultPeriodo.dataIni,
    dataFim: defaultPeriodo.dataFim,
  });

  const [dados, setDados] = useState<ResumoEmpresaVendedor[]>([]);
  const [metas, setMetas] = useState<MetaVenda[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  const [diretrizes, setDiretrizes] = useState<string | null>(null);
  const [loadingDiretrizes, setLoadingDiretrizes] = useState(false);
  const [errorDiretrizes, setErrorDiretrizes] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getResumoEmpresaVendedor({
        empresa: 'ALL',
        dataInicio: filters.dataInicio,
        dataFim: filters.dataFim
      });
      setDados(result);

      // Buscar metas do período
      const dataIni = new Date(filters.dataInicio);
      const metasPeriodo = await getMetasPorPeriodo('LOJA', dataIni.getFullYear(), dataIni.getMonth() + 1);
      setMetas(metasPeriodo);

      setDataLoaded(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao buscar ranking";
      setError(message);
      setDados([]);
    } finally {
      setLoading(false);
    }
  }, [filters.dataInicio, filters.dataFim]);

  const ranking = useMemo<RankingLoja[]>(() => {
    // Agrupar por empresa
    const porLoja = new Map<string, {
      codEmpresa: number;
      empresa: string;
      totalVendido: number;
      ticketMedio: number;
      qtdTransacoes: number;
      totalDevolucao: number;
    }>();

    dados.forEach(d => {
      const existing = porLoja.get(d.empresa);
      if (existing) {
        existing.totalVendido += d.totalVendido || 0;
        existing.qtdTransacoes += d.qtdTransacao || 0;
        existing.totalDevolucao += d.totalDevolucao || 0;
      } else {
        porLoja.set(d.empresa, {
          codEmpresa: d.codEmpresa || 0,
          empresa: d.empresa,
          totalVendido: d.totalVendido || 0,
          ticketMedio: 0,
          qtdTransacoes: d.qtdTransacao || 0,
          totalDevolucao: d.totalDevolucao || 0,
        });
      }
    });

    // Calcular métricas e ordenar
    const lista = Array.from(porLoja.values())
      .map(loja => ({
        ...loja,
        ticketMedio: loja.qtdTransacoes > 0 ? loja.totalVendido / loja.qtdTransacoes : 0,
        percentualDevolucao: loja.totalVendido > 0 
          ? (loja.totalDevolucao / (loja.totalVendido + loja.totalDevolucao)) * 100 
          : 0,
      }))
      .sort((a, b) => b.totalVendido - a.totalVendido);

    // Adicionar posição e metas
    return lista.map((loja, index) => {
      const meta = metas.find(m => m.codReferencia === loja.codEmpresa);
      return {
        posicao: index + 1,
        ...loja,
        meta,
        percentualMeta: meta && meta.metaFaturamento > 0 
          ? (loja.totalVendido / meta.metaFaturamento) * 100 
          : undefined,
      };
    });
  }, [dados, metas]);

  const totais = useMemo(() => {
    return {
      totalVendido: ranking.reduce((acc, r) => acc + r.totalVendido, 0),
      totalTransacoes: ranking.reduce((acc, r) => acc + r.qtdTransacoes, 0),
      ticketMedioGeral: ranking.length > 0 
        ? ranking.reduce((acc, r) => acc + r.totalVendido, 0) / ranking.reduce((acc, r) => acc + r.qtdTransacoes, 0) 
        : 0,
      totalDevolucao: ranking.reduce((acc, r) => acc + r.totalDevolucao, 0),
    };
  }, [ranking]);

  const gerarAnaliseIA = useCallback(async () => {
    if (ranking.length === 0) return;
    
    setLoadingDiretrizes(true);
    setErrorDiretrizes(null);
    try {
      const periodo = `${filters.dataInicio} a ${filters.dataFim}`;
      const analise = await gerarDiretrizes({
        tipo: 'loja',
        dados: ranking.map(r => ({
          posicao: r.posicao,
          loja: r.empresa,
          faturamento: r.totalVendido,
          ticketMedio: r.ticketMedio,
          qtdVendas: r.qtdTransacoes,
          percentualDevolucao: r.percentualDevolucao.toFixed(1) + '%',
          percentualMeta: r.percentualMeta ? r.percentualMeta.toFixed(1) + '%' : 'Sem meta',
        })),
        periodo,
        meta: metas.length > 0 ? metas : undefined,
      });
      setDiretrizes(analise);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao gerar análise";
      setErrorDiretrizes(message);
    } finally {
      setLoadingDiretrizes(false);
    }
  }, [ranking, filters, metas]);

  return {
    filters,
    setFilters,
    ranking,
    totais,
    loading,
    error,
    dataLoaded,
    fetchData,
    diretrizes,
    loadingDiretrizes,
    errorDiretrizes,
    gerarAnaliseIA,
  };
}
