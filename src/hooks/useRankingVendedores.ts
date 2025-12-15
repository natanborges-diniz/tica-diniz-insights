import { useState, useMemo, useCallback } from "react";
import { getResumoEmpresaVendedor, ResumoEmpresaVendedor } from "@/services/vendasService";
import { getMetasPorPeriodo, MetaVenda } from "@/services/metasService";
import { gerarDiretrizes } from "@/services/aiDiretrizesService";
import { EmpresaParam } from "@/services/firebirdBridge";
import { getDefaultPeriodoMesAtual } from "@/utils/dateValidation";

export interface RankingVendedor {
  posicao: number;
  codVendedor: number;
  vendedor: string;
  empresa: string;
  codEmpresa: number;
  totalVendido: number;
  ticketMedio: number;
  qtdTransacoes: number;
  totalDevolucao: number;
  percentualDevolucao: number;
  meta?: MetaVenda;
  percentualMeta?: number;
  comparativoMediaLoja?: number; // % acima/abaixo da média da loja
}

export interface RankingVendedoresFilters {
  dataInicio: string;
  dataFim: string;
  empresa: EmpresaParam;
}

export function useRankingVendedores() {
  const defaultPeriodo = getDefaultPeriodoMesAtual();
  
  const [filters, setFilters] = useState<RankingVendedoresFilters>({
    dataInicio: defaultPeriodo.dataIni,
    dataFim: defaultPeriodo.dataFim,
    empresa: 'ALL',
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
        empresa: filters.empresa,
        dataInicio: filters.dataInicio,
        dataFim: filters.dataFim
      });
      setDados(result);

      // Buscar metas do período
      const dataIni = new Date(filters.dataInicio);
      const metasPeriodo = await getMetasPorPeriodo('VENDEDOR', dataIni.getFullYear(), dataIni.getMonth() + 1);
      setMetas(metasPeriodo);

      setDataLoaded(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao buscar ranking";
      setError(message);
      setDados([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Calcular média por loja para comparativo
  const mediasPorLoja = useMemo(() => {
    const mediasMap = new Map<string, { totalVendido: number; qtdVendedores: number; ticketMedio: number }>();
    
    dados.forEach(d => {
      const existing = mediasMap.get(d.empresa);
      if (existing) {
        existing.totalVendido += d.totalVendido || 0;
        existing.qtdVendedores += 1;
      } else {
        mediasMap.set(d.empresa, {
          totalVendido: d.totalVendido || 0,
          qtdVendedores: 1,
          ticketMedio: 0,
        });
      }
    });

    // Calcular médias
    mediasMap.forEach((value, key) => {
      value.ticketMedio = value.qtdVendedores > 0 ? value.totalVendido / value.qtdVendedores : 0;
    });

    return mediasMap;
  }, [dados]);

  const ranking = useMemo<RankingVendedor[]>(() => {
    const lista = dados
      .filter(d => d.vendedor && d.vendedor.trim() !== '')
      .map(d => {
        const ticketMedio = d.qtdTransacao > 0 ? d.totalVendido / d.qtdTransacao : 0;
        const mediaLoja = mediasPorLoja.get(d.empresa);
        const mediaTicketLoja = mediaLoja?.ticketMedio || 0;
        
        return {
          codVendedor: d.codVendedor || 0,
          vendedor: d.vendedor,
          empresa: d.empresa,
          codEmpresa: d.codEmpresa || 0,
          totalVendido: d.totalVendido || 0,
          ticketMedio,
          qtdTransacoes: d.qtdTransacao || 0,
          totalDevolucao: d.totalDevolucao || 0,
          percentualDevolucao: d.totalVendido > 0 
            ? (d.totalDevolucao / (d.totalVendido + d.totalDevolucao)) * 100 
            : 0,
          comparativoMediaLoja: mediaTicketLoja > 0 
            ? ((ticketMedio - mediaTicketLoja) / mediaTicketLoja) * 100 
            : 0,
        };
      })
      .sort((a, b) => b.totalVendido - a.totalVendido);

    // Adicionar posição e metas
    return lista.map((vendedor, index) => {
      const meta = metas.find(m => m.codReferencia === vendedor.codVendedor);
      return {
        posicao: index + 1,
        ...vendedor,
        meta,
        percentualMeta: meta && meta.metaFaturamento > 0 
          ? (vendedor.totalVendido / meta.metaFaturamento) * 100 
          : undefined,
      };
    });
  }, [dados, metas, mediasPorLoja]);

  const totais = useMemo(() => {
    const qtdVendedores = ranking.length;
    const totalVendido = ranking.reduce((acc, r) => acc + r.totalVendido, 0);
    const totalTransacoes = ranking.reduce((acc, r) => acc + r.qtdTransacoes, 0);
    
    return {
      qtdVendedores,
      totalVendido,
      totalTransacoes,
      ticketMedioGeral: totalTransacoes > 0 ? totalVendido / totalTransacoes : 0,
      mediaVendaPorVendedor: qtdVendedores > 0 ? totalVendido / qtdVendedores : 0,
    };
  }, [ranking]);

  const gerarAnaliseIA = useCallback(async () => {
    if (ranking.length === 0) return;
    
    setLoadingDiretrizes(true);
    setErrorDiretrizes(null);
    try {
      const periodo = `${filters.dataInicio} a ${filters.dataFim}`;
      const analise = await gerarDiretrizes({
        tipo: 'vendedor',
        dados: ranking.slice(0, 20).map(r => ({
          posicao: r.posicao,
          vendedor: r.vendedor,
          loja: r.empresa,
          faturamento: r.totalVendido,
          ticketMedio: r.ticketMedio,
          qtdVendas: r.qtdTransacoes,
          percentualDevolucao: r.percentualDevolucao.toFixed(1) + '%',
          comparativoLoja: (r.comparativoMediaLoja || 0) > 0 
            ? `+${r.comparativoMediaLoja?.toFixed(1)}%` 
            : `${r.comparativoMediaLoja?.toFixed(1)}%`,
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
    mediasPorLoja,
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
