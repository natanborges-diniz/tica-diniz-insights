import { useState, useCallback, useEffect, useMemo } from "react";
import { getMetasPorPeriodo, MetaVenda } from "@/services/metasService";
import { getEmpresas, Empresa } from "@/services/empresaService";
import { getResumoEmpresaVendedor, ResumoEmpresaVendedor } from "@/services/vendasService";
import {
  getMetaPeriodo,
  getFeriados,
  getLojasConfiguracao,
  getLojasExcecoes,
  calcularDiasUteis,
  getDatasDoPeriodo,
  MetaPeriodo,
  Feriado,
  LojaConfiguracao,
  LojaExcecao,
} from "@/services/calendarioService";
import { formatLocalDate } from "@/utils/dateValidation";

export interface AcompanhamentoMeta {
  codEmpresa: number;
  nomeEmpresa: string;
  metaTotal: number;
  totalVendido: number;
  percentualAtingido: number;
  valorRestante: number;
  diasUteisTotal: number;
  diasUteisRestantes: number;
  diasComVenda: number;
  mediaDiariaReal: number;
  metaDiariaNecessaria: number;
  status: 'ACIMA_MEDIA' | 'NO_RITMO' | 'EM_RISCO' | 'CRITICO';
  alertas: string[];
}

export interface AcompanhamentoFilters {
  ano: number;
  mes: number;
  empresa: number | 'ALL';
}

export interface AcompanhamentoMetrics {
  metaTotal: number;
  totalVendido: number;
  percentualAtingido: number;
  valorRestante: number;
  mediaDiariaGeral: number;
  metaDiariaGeral: number;
  lojasAcimaMedia: number;
  lojasEmRisco: number;
}

export function useAcompanhamentoMetas() {
  const anoAtual = new Date().getFullYear();
  const mesAtual = new Date().getMonth() + 1;

  const [filters, setFilters] = useState<AcompanhamentoFilters>({
    ano: anoAtual,
    mes: mesAtual,
    empresa: 'ALL',
  });

  const [metas, setMetas] = useState<MetaVenda[]>([]);
  const [vendas, setVendas] = useState<ResumoEmpresaVendedor[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [periodoConfig, setPeriodoConfig] = useState<MetaPeriodo | null>(null);
  const [feriados, setFeriados] = useState<Feriado[]>([]);
  const [lojasConfig, setLojasConfig] = useState<LojaConfiguracao[]>([]);
  const [excecoes, setExcecoes] = useState<LojaExcecao[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Carregar dados iniciais
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [empresasData, lojasConfigData, feriadosData] = await Promise.all([
          getEmpresas(),
          getLojasConfiguracao(),
          getFeriados(filters.ano),
        ]);
        setEmpresas(empresasData);
        setLojasConfig(lojasConfigData);
        setFeriados(feriadosData);
      } catch (err) {
        console.error("Erro ao carregar dados iniciais:", err);
      }
    };
    fetchInitialData();
  }, [filters.ano]);

  // Buscar dados de acompanhamento
  const fetchAcompanhamento = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Buscar configuração do período
      const periodo = await getMetaPeriodo(filters.ano, filters.mes);
      setPeriodoConfig(periodo);

      // 2. Calcular datas do período
      const { dataInicio, dataFim } = getDatasDoPeriodo(filters.ano, filters.mes, periodo);
      const dataInicioStr = formatLocalDate(dataInicio);
      const dataFimStr = formatLocalDate(dataFim);

      // 3. Buscar metas, vendas e exceções em paralelo
      const [metasData, vendasData, excecoesData] = await Promise.all([
        getMetasPorPeriodo('LOJA', filters.ano, filters.mes),
        getResumoEmpresaVendedor({
          empresa: filters.empresa === 'ALL' ? 'ALL' : String(filters.empresa),
          dataInicio: dataInicioStr,
          dataFim: dataFimStr,
        }),
        getLojasExcecoes(undefined, dataInicioStr, dataFimStr),
      ]);

      setMetas(metasData);
      setVendas(vendasData);
      setExcecoes(excecoesData);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao buscar dados";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Calcular acompanhamento por loja
  const acompanhamento = useMemo((): AcompanhamentoMeta[] => {
    if (!metas.length) return [];

    const hoje = new Date();
    const { dataInicio, dataFim } = getDatasDoPeriodo(filters.ano, filters.mes, periodoConfig);
    
    // Se a data atual está antes do período, usar data de início
    // Se está depois, usar data fim
    const dataAtual = hoje < dataInicio ? dataInicio : (hoje > dataFim ? dataFim : hoje);

    return metas
      .filter(m => m.tipo === 'LOJA')
      .map(meta => {
        const empresa = empresas.find(e => e.codEmpresa === meta.codReferencia);
        const config = lojasConfig.find(c => c.codEmpresa === meta.codReferencia) || null;
        const excecoesLoja = excecoes.filter(e => e.codEmpresa === meta.codReferencia);
        
        // Total vendido pela loja - usar empresaCodLogico para match
        const vendasLoja = vendas.filter(v => v.empresaCodLogico === meta.codReferencia);
        const totalVendido = vendasLoja.reduce((sum, v) => sum + (v.totalVendidoSemCreditos || 0), 0);
        
        // Dias com venda (para média real)
        const diasComVenda = vendasLoja.length > 0 ? vendasLoja.length : 0;
        
        // Dias úteis
        const diasUteisTotal = calcularDiasUteis(dataInicio, dataFim, config, feriados, excecoesLoja);
        const diasUteisRestantes = calcularDiasUteis(dataAtual, dataFim, config, feriados, excecoesLoja);
        
        // Cálculos
        const metaTotal = meta.metaFaturamento || 0;
        const percentualAtingido = metaTotal > 0 ? (totalVendido / metaTotal) * 100 : 0;
        const valorRestante = Math.max(0, metaTotal - totalVendido);
        const mediaDiariaReal = diasComVenda > 0 ? totalVendido / diasComVenda : 0;
        const metaDiariaNecessaria = diasUteisRestantes > 0 ? valorRestante / diasUteisRestantes : 0;

        // Determinar status
        let status: AcompanhamentoMeta['status'] = 'NO_RITMO';
        const alertas: string[] = [];

        if (metaDiariaNecessaria > mediaDiariaReal * 1.5) {
          status = 'CRITICO';
          alertas.push('Meta diária necessária muito acima da média atual');
        } else if (metaDiariaNecessaria > mediaDiariaReal * 1.2) {
          status = 'EM_RISCO';
          alertas.push('Meta diária necessária acima da média atual');
        } else if (percentualAtingido >= 100) {
          status = 'ACIMA_MEDIA';
        } else if (mediaDiariaReal >= metaDiariaNecessaria) {
          status = 'ACIMA_MEDIA';
        }

        if (diasUteisRestantes <= 5 && valorRestante > 0) {
          alertas.push('Poucos dias úteis restantes');
        }

        return {
          codEmpresa: meta.codReferencia,
          nomeEmpresa: empresa?.nome || meta.nomeReferencia || `Loja ${meta.codReferencia}`,
          metaTotal,
          totalVendido,
          percentualAtingido,
          valorRestante,
          diasUteisTotal,
          diasUteisRestantes,
          diasComVenda,
          mediaDiariaReal,
          metaDiariaNecessaria,
          status,
          alertas,
        };
      })
      .sort((a, b) => b.percentualAtingido - a.percentualAtingido);
  }, [metas, vendas, empresas, lojasConfig, excecoes, feriados, periodoConfig, filters]);

  // Métricas consolidadas
  const metrics = useMemo((): AcompanhamentoMetrics => {
    if (!acompanhamento.length) {
      return {
        metaTotal: 0,
        totalVendido: 0,
        percentualAtingido: 0,
        valorRestante: 0,
        mediaDiariaGeral: 0,
        metaDiariaGeral: 0,
        lojasAcimaMedia: 0,
        lojasEmRisco: 0,
      };
    }

    const metaTotal = acompanhamento.reduce((sum, a) => sum + a.metaTotal, 0);
    const totalVendido = acompanhamento.reduce((sum, a) => sum + a.totalVendido, 0);
    const valorRestante = acompanhamento.reduce((sum, a) => sum + a.valorRestante, 0);
    const totalDiasComVenda = acompanhamento.reduce((sum, a) => sum + a.diasComVenda, 0);
    const totalDiasRestantes = acompanhamento.reduce((sum, a) => sum + a.diasUteisRestantes, 0);

    return {
      metaTotal,
      totalVendido,
      percentualAtingido: metaTotal > 0 ? (totalVendido / metaTotal) * 100 : 0,
      valorRestante,
      mediaDiariaGeral: totalDiasComVenda > 0 ? totalVendido / totalDiasComVenda : 0,
      metaDiariaGeral: totalDiasRestantes > 0 ? valorRestante / totalDiasRestantes : 0,
      lojasAcimaMedia: acompanhamento.filter(a => a.status === 'ACIMA_MEDIA' || a.status === 'NO_RITMO').length,
      lojasEmRisco: acompanhamento.filter(a => a.status === 'EM_RISCO' || a.status === 'CRITICO').length,
    };
  }, [acompanhamento]);

  // Período formatado
  const periodoInfo = useMemo(() => {
    const { dataInicio, dataFim } = getDatasDoPeriodo(filters.ano, filters.mes, periodoConfig);
    return {
      dataInicio: formatLocalDate(dataInicio),
      dataFim: formatLocalDate(dataFim),
      descricao: periodoConfig?.descricao || null,
    };
  }, [filters, periodoConfig]);

  return {
    filters,
    setFilters,
    acompanhamento,
    metrics,
    empresas,
    periodoInfo,
    loading,
    error,
    fetchAcompanhamento,
  };
}
