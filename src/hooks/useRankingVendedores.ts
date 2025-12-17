import { useState, useMemo, useCallback } from "react";
import { getResumoEmpresaVendedor, ResumoEmpresaVendedor } from "@/services/vendasService";
import { getMetasPorPeriodo, MetaVenda } from "@/services/metasService";
import { gerarDiretrizes } from "@/services/aiDiretrizesService";
import { EmpresaParam } from "@/services/firebirdBridge";
import { getDefaultPeriodoMesAtual } from "@/utils/dateValidation";

export interface RankingVendedor {
  posicao: number;
  vendedor: string;
  empresa: string;
  codEmpresa: number;
  totalVendido: number;
  totalVendidoSemCreditos: number;
  ticketMedio: number;
  qtdTransacoes: number;
  percentualDesconto: number;
  meta?: MetaVenda;
  percentualMeta?: number;
  comparativoMediaLoja?: number;
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
    const mediasMap = new Map<string, { totalVendidoSemCreditos: number; qtdVendedores: number; mediaVendedor: number }>();
    
    dados.forEach(d => {
      const key = d.empresaNomeLogico || d.empresa;
      const existing = mediasMap.get(key);
      if (existing) {
        existing.totalVendidoSemCreditos += d.totalVendidoSemCreditos || 0;
        existing.qtdVendedores += 1;
      } else {
        mediasMap.set(key, {
          totalVendidoSemCreditos: d.totalVendidoSemCreditos || 0,
          qtdVendedores: 1,
          mediaVendedor: 0,
        });
      }
    });

    // Calcular médias
    mediasMap.forEach((value) => {
      value.mediaVendedor = value.qtdVendedores > 0 ? value.totalVendidoSemCreditos / value.qtdVendedores : 0;
    });

    return mediasMap;
  }, [dados]);

  const ranking = useMemo<RankingVendedor[]>(() => {
    const lista = dados
      .filter(d => d.vendedor && d.vendedor.trim() !== '')
      .map(d => {
        const ticketMedio = d.qtdTransacao > 0 ? d.totalVendidoSemCreditos / d.qtdTransacao : 0;
        const empresaKey = d.empresaNomeLogico || d.empresa;
        const mediaLoja = mediasPorLoja.get(empresaKey);
        const mediaVendedorLoja = mediaLoja?.mediaVendedor || 0;
        
        return {
          vendedor: d.vendedor,
          empresa: empresaKey,
          codEmpresa: d.empresaCodLogico || 0,
          totalVendido: d.totalVendido || 0,
          totalVendidoSemCreditos: d.totalVendidoSemCreditos || 0,
          ticketMedio,
          qtdTransacoes: d.qtdTransacao || 0,
          percentualDesconto: d.percentualDesconto || 0,
          comparativoMediaLoja: mediaVendedorLoja > 0 
            ? ((d.totalVendidoSemCreditos - mediaVendedorLoja) / mediaVendedorLoja) * 100 
            : 0,
        };
      })
      .sort((a, b) => b.totalVendidoSemCreditos - a.totalVendidoSemCreditos);

    // Adicionar posição e metas
    return lista.map((vendedor, index) => {
      // Metas de vendedor não têm referência direta, usar posição
      return {
        posicao: index + 1,
        ...vendedor,
      };
    });
  }, [dados, mediasPorLoja]);

  const totais = useMemo(() => {
    const qtdVendedores = ranking.length;
    const totalVendido = ranking.reduce((acc, r) => acc + r.totalVendido, 0);
    const totalVendidoSemCreditos = ranking.reduce((acc, r) => acc + r.totalVendidoSemCreditos, 0);
    const totalTransacoes = ranking.reduce((acc, r) => acc + r.qtdTransacoes, 0);
    
    return {
      qtdVendedores,
      totalVendido,
      totalVendidoSemCreditos,
      totalTransacoes,
      ticketMedioGeral: totalTransacoes > 0 ? totalVendidoSemCreditos / totalTransacoes : 0,
      mediaVendaPorVendedor: qtdVendedores > 0 ? totalVendidoSemCreditos / qtdVendedores : 0,
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
          faturamento: r.totalVendidoSemCreditos,
          ticketMedio: r.ticketMedio,
          qtdVendas: r.qtdTransacoes,
          percentualDesconto: r.percentualDesconto.toFixed(1) + '%',
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
