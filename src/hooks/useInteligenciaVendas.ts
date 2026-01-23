import { useState, useMemo, useCallback, useEffect } from "react";
import { gerarDiretrizes } from "@/services/aiDiretrizesService";
import { getEmpresas, Empresa } from "@/services/empresaService";
import {
  getMetasPorPeriodo,
  MetaVenda,
} from "@/services/metasService";
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
import { formatLocalDate, getPeriodoComercial } from "@/utils/dateValidation";
import { EmpresaParam } from "@/services/firebirdBridge";
import { getVendasAgregado, AgregadoFormaPagamento } from "@/services/agregadosService";
import { sincronizarCache } from "@/services/syncCacheService";

// ========================
// Interfaces
// ========================

export type TipoPeriodo = 'comercial' | 'personalizado';
export type TabAtiva = 'visao-geral' | 'por-loja' | 'por-vendedor';

export interface InteligenciaFilters {
  tipoPeriodo: TipoPeriodo;
  ano: number;
  mes: number;
  dataInicio: string;
  dataFim: string;
  empresa: EmpresaParam;
}

export interface LojaInteligencia {
  posicao: number;
  codEmpresa: number;
  empresa: string;
  totalVendido: number;
  totalVendidoSemCreditos: number;
  ticketMedio: number;
  qtdTransacoes: number;
  percentualDesconto: number;
  meta?: MetaVenda;
  percentualMeta?: number;
  diasUteisRestantes?: number;
  metaDiariaNecessaria?: number;
  status?: 'ACIMA_MEDIA' | 'NO_RITMO' | 'EM_RISCO' | 'CRITICO';
}

export interface VendedorInteligencia {
  posicao: number;
  vendedor: string;
  empresa: string;
  codEmpresa: number;
  totalVendido: number;
  totalVendidoSemCreditos: number;
  ticketMedio: number;
  qtdTransacoes: number;
  percentualDesconto: number;
  comparativoMediaLoja?: number;
  meta?: MetaVenda;
  percentualMeta?: number;
}

export interface TotaisInteligencia {
  totalVendido: number;
  totalVendidoSemCreditos: number;
  totalTransacoes: number;
  ticketMedioGeral: number;
  metaTotal: number;
  percentualMetaGeral: number;
  qtdLojas: number;
  qtdVendedores: number;
  lojasAcimaMedia: number;
  lojasEmRisco: number;
}

// Interface interna para dados processados
interface DadoProcessado {
  codEmpresa: number;
  empresa: string;
  vendedor: string;
  totalVendido: number;
  totalVendidoSemCreditos: number;
  totalDesconto: number;
  totalBruto: number;
  qtdTransacao: number;
  percentualDesconto: number;
}

// ========================
// Hook Principal
// ========================

export function useInteligenciaVendas() {
  const defaultPeriodo = getPeriodoComercial();
  const anoAtual = new Date().getFullYear();
  const mesAtual = new Date().getMonth() + 1;

  // NÃO seleciona empresa por padrão (evita timeout)
  const [filters, setFilters] = useState<InteligenciaFilters>({
    tipoPeriodo: 'comercial',
    ano: anoAtual,
    mes: mesAtual,
    dataInicio: defaultPeriodo.dataIni,
    dataFim: defaultPeriodo.dataFim,
    empresa: '', // Vazio = não carrega automaticamente
  });

  const [tabAtiva, setTabAtiva] = useState<TabAtiva>('visao-geral');

  // Dados brutos (do cache Supabase)
  const [dados, setDados] = useState<DadoProcessado[]>([]);
  const [metasLojas, setMetasLojas] = useState<MetaVenda[]>([]);
  const [metasVendedores, setMetasVendedores] = useState<MetaVenda[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  
  // Calendário
  const [periodoConfig, setPeriodoConfig] = useState<MetaPeriodo | null>(null);
  const [feriados, setFeriados] = useState<Feriado[]>([]);
  const [lojasConfig, setLojasConfig] = useState<LojaConfiguracao[]>([]);
  const [excecoes, setExcecoes] = useState<LojaExcecao[]>([]);

  // Estados
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);

  // IA
  const [diretrizes, setDiretrizes] = useState<string | null>(null);
  const [loadingDiretrizes, setLoadingDiretrizes] = useState(false);
  const [errorDiretrizes, setErrorDiretrizes] = useState<string | null>(null);

  // Mapa de empresas para lookup
  const [empresasMap, setEmpresasMap] = useState<Map<number, string>>(new Map());

  // Carregar dados iniciais (empresas, configurações)
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
        
        // Criar mapa de empresas
        const map = new Map<number, string>();
        empresasData.forEach(e => map.set(e.codEmpresa, e.nome));
        setEmpresasMap(map);
      } catch (err) {
        console.error("Erro ao carregar dados iniciais:", err);
      }
    };
    fetchInitialData();
  }, [filters.ano]);

  // Calcular datas baseado no tipo de período
  const periodoDatas = useMemo(() => {
    if (filters.tipoPeriodo === 'personalizado') {
      return {
        dataInicio: filters.dataInicio,
        dataFim: filters.dataFim,
      };
    }
    
    if (periodoConfig) {
      const { dataInicio, dataFim } = getDatasDoPeriodo(filters.ano, filters.mes, periodoConfig);
      return {
        dataInicio: formatLocalDate(dataInicio),
        dataFim: formatLocalDate(dataFim),
      };
    }
    
    return {
      dataInicio: filters.dataInicio,
      dataFim: filters.dataFim,
    };
  }, [filters, periodoConfig]);

  // Converter AgregadoFormaPagamento para DadoProcessado
  const converterAgregados = useCallback((agregados: AgregadoFormaPagamento[]): DadoProcessado[] => {
    // Agrupar por empresa + vendedor
    const mapaVendedor = new Map<string, DadoProcessado>();
    
    agregados.forEach(a => {
      const key = `${a.codEmpresa}|${a.vendedor}`;
      const nomeEmpresa = empresasMap.get(a.codEmpresa) || String(a.codEmpresa);
      
      // Ignorar devoluções no total
      const isDevolucao = a.formaPagamento === 'DEVOLUCAO';
      const isCredito = a.formaPagamento === 'CREDITO';
      
      const existing = mapaVendedor.get(key);
      if (existing) {
        if (!isDevolucao) {
          existing.totalVendido += a.totalGeral;
          existing.totalBruto += a.totalBruto;
          existing.totalDesconto += a.totalDesconto;
          existing.qtdTransacao += a.qtdVendas;
        }
        if (!isDevolucao && !isCredito) {
          existing.totalVendidoSemCreditos += a.totalGeral;
        }
      } else {
        mapaVendedor.set(key, {
          codEmpresa: a.codEmpresa,
          empresa: nomeEmpresa,
          vendedor: a.vendedor,
          totalVendido: isDevolucao ? 0 : a.totalGeral,
          totalVendidoSemCreditos: (isDevolucao || isCredito) ? 0 : a.totalGeral,
          totalDesconto: isDevolucao ? 0 : a.totalDesconto,
          totalBruto: isDevolucao ? 0 : a.totalBruto,
          qtdTransacao: isDevolucao ? 0 : a.qtdVendas,
          percentualDesconto: 0,
        });
      }
    });
    
    // Calcular percentual de desconto
    return Array.from(mapaVendedor.values()).map(d => ({
      ...d,
      percentualDesconto: d.totalBruto > 0 ? (d.totalDesconto / d.totalBruto) * 100 : 0,
    }));
  }, [empresasMap]);

  // Buscar dados usando cache-first pattern
  const fetchData = useCallback(async (options?: { bypassCache?: boolean }) => {
    // Não buscar se empresa não foi selecionada
    if (!filters.empresa) {
      console.log('[useInteligenciaVendas] Empresa não selecionada, aguardando...');
      return;
    }
    
    setLoading(true);
    setError(null);

    try {
      // 1. Se período comercial, buscar config
      if (filters.tipoPeriodo === 'comercial') {
        const periodo = await getMetaPeriodo(filters.ano, filters.mes);
        setPeriodoConfig(periodo);
      }

      // 2. Calcular datas
      let dataInicioStr = filters.dataInicio;
      let dataFimStr = filters.dataFim;

      if (filters.tipoPeriodo === 'comercial' && periodoConfig) {
        const { dataInicio, dataFim } = getDatasDoPeriodo(filters.ano, filters.mes, periodoConfig);
        dataInicioStr = formatLocalDate(dataInicio);
        dataFimStr = formatLocalDate(dataFim);
      }

      console.log('[useInteligenciaVendas] Buscando dados do cache:', {
        empresa: filters.empresa,
        dataInicio: dataInicioStr,
        dataFim: dataFimStr,
      });

      // 3. Buscar do cache Supabase (cache-first)
      const [agregados, metasLojasData, metasVendedoresData, excecoesData] = await Promise.all([
        getVendasAgregado({
          empresa: filters.empresa,
          dataInicio: dataInicioStr,
          dataFim: dataFimStr,
        }),
        getMetasPorPeriodo('LOJA', filters.ano, filters.mes),
        getMetasPorPeriodo('VENDEDOR', filters.ano, filters.mes),
        getLojasExcecoes(undefined, dataInicioStr, dataFimStr),
      ]);

      // 4. Se cache vazio, tentar sincronizar
      if (agregados.length === 0) {
        console.log('[useInteligenciaVendas] Cache vazio, sincronizando...');
        setSincronizando(true);
        
        try {
          await sincronizarCache();
          
          // Buscar novamente após sync
          const agregadosAposSync = await getVendasAgregado({
            empresa: filters.empresa,
            dataInicio: dataInicioStr,
            dataFim: dataFimStr,
          });
          
          const dadosConvertidos = converterAgregados(agregadosAposSync);
          setDados(dadosConvertidos);
        } catch (syncErr) {
          console.error('[useInteligenciaVendas] Erro ao sincronizar:', syncErr);
          setDados([]);
        } finally {
          setSincronizando(false);
        }
      } else {
        const dadosConvertidos = converterAgregados(agregados);
        setDados(dadosConvertidos);
      }

      setMetasLojas(metasLojasData);
      setMetasVendedores(metasVendedoresData);
      setExcecoes(excecoesData);
      setDataLoaded(true);
      setDiretrizes(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao buscar dados";
      setError(message);
      setDados([]);
    } finally {
      setLoading(false);
    }
  }, [filters, periodoConfig, converterAgregados]);

  // Ranking de Lojas
  const rankingLojas = useMemo<LojaInteligencia[]>(() => {
    const porLoja = new Map<string, {
      codEmpresa: number;
      empresa: string;
      totalVendido: number;
      totalVendidoSemCreditos: number;
      totalDesconto: number;
      totalBruto: number;
      qtdTransacoes: number;
    }>();

    dados.forEach(d => {
      const key = d.empresa;
      const existing = porLoja.get(key);
      if (existing) {
        existing.totalVendido += d.totalVendido || 0;
        existing.totalVendidoSemCreditos += d.totalVendidoSemCreditos || 0;
        existing.totalDesconto += d.totalDesconto || 0;
        existing.totalBruto += d.totalBruto || 0;
        existing.qtdTransacoes += d.qtdTransacao || 0;
      } else {
        porLoja.set(key, {
          codEmpresa: d.codEmpresa,
          empresa: key,
          totalVendido: d.totalVendido || 0,
          totalVendidoSemCreditos: d.totalVendidoSemCreditos || 0,
          totalDesconto: d.totalDesconto || 0,
          totalBruto: d.totalBruto || 0,
          qtdTransacoes: d.qtdTransacao || 0,
        });
      }
    });

    const hoje = new Date();
    const { dataInicio, dataFim } = filters.tipoPeriodo === 'comercial' && periodoConfig
      ? getDatasDoPeriodo(filters.ano, filters.mes, periodoConfig)
      : { dataInicio: new Date(filters.dataInicio), dataFim: new Date(filters.dataFim) };
    
    const dataAtual = hoje < dataInicio ? dataInicio : (hoje > dataFim ? dataFim : hoje);

    const lista = Array.from(porLoja.values())
      .map(loja => {
        const ticketMedio = loja.qtdTransacoes > 0 ? loja.totalVendidoSemCreditos / loja.qtdTransacoes : 0;
        const percentualDesconto = loja.totalBruto > 0 ? (loja.totalDesconto / loja.totalBruto) * 100 : 0;
        
        const meta = metasLojas.find(m => m.codReferencia === loja.codEmpresa);
        const metaTotal = meta?.metaFaturamento || 0;
        const percentualMeta = metaTotal > 0 ? (loja.totalVendidoSemCreditos / metaTotal) * 100 : undefined;
        
        // Cálculo de dias úteis restantes
        const config = lojasConfig.find(c => c.codEmpresa === loja.codEmpresa) || null;
        const excecoesLoja = excecoes.filter(e => e.codEmpresa === loja.codEmpresa);
        const diasUteisRestantes = calcularDiasUteis(dataAtual, dataFim, config, feriados, excecoesLoja);
        
        const valorRestante = Math.max(0, metaTotal - loja.totalVendidoSemCreditos);
        const metaDiariaNecessaria = diasUteisRestantes > 0 ? valorRestante / diasUteisRestantes : 0;
        
        // Calcular média diária real baseada nos dias passados
        const diasPassados = calcularDiasUteis(dataInicio, dataAtual, config, feriados, excecoesLoja);
        const mediaDiariaReal = diasPassados > 0 ? loja.totalVendidoSemCreditos / diasPassados : 0;
        
        // Determinar status
        let status: LojaInteligencia['status'] = 'NO_RITMO';
        if (percentualMeta !== undefined) {
          if (metaDiariaNecessaria > mediaDiariaReal * 1.5) {
            status = 'CRITICO';
          } else if (metaDiariaNecessaria > mediaDiariaReal * 1.2) {
            status = 'EM_RISCO';
          } else if (percentualMeta >= 100 || mediaDiariaReal >= metaDiariaNecessaria) {
            status = 'ACIMA_MEDIA';
          }
        }

        return {
          ...loja,
          ticketMedio,
          percentualDesconto,
          meta,
          percentualMeta,
          diasUteisRestantes,
          metaDiariaNecessaria,
          status,
        };
      })
      .sort((a, b) => b.totalVendidoSemCreditos - a.totalVendidoSemCreditos);

    return lista.map((loja, index) => ({
      posicao: index + 1,
      ...loja,
    }));
  }, [dados, metasLojas, lojasConfig, excecoes, feriados, periodoConfig, filters]);

  // Média por loja para comparativo de vendedores
  const mediasPorLoja = useMemo(() => {
    const mediasMap = new Map<string, { totalVendidoSemCreditos: number; qtdVendedores: number; mediaVendedor: number }>();
    
    dados.forEach(d => {
      const key = d.empresa;
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

    mediasMap.forEach((value) => {
      value.mediaVendedor = value.qtdVendedores > 0 ? value.totalVendidoSemCreditos / value.qtdVendedores : 0;
    });

    return mediasMap;
  }, [dados]);

  // Ranking de Vendedores
  const rankingVendedores = useMemo<VendedorInteligencia[]>(() => {
    const lista = dados
      .filter(d => d.vendedor && d.vendedor.trim() !== '')
      .map(d => {
        const ticketMedio = d.qtdTransacao > 0 ? d.totalVendidoSemCreditos / d.qtdTransacao : 0;
        const empresaKey = d.empresa;
        const mediaLoja = mediasPorLoja.get(empresaKey);
        const mediaVendedorLoja = mediaLoja?.mediaVendedor || 0;
        
        return {
          vendedor: d.vendedor,
          empresa: empresaKey,
          codEmpresa: d.codEmpresa,
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

    return lista.map((vendedor, index) => ({
      posicao: index + 1,
      ...vendedor,
    }));
  }, [dados, mediasPorLoja]);

  // Totais consolidados
  const totais = useMemo<TotaisInteligencia>(() => {
    const totalVendido = rankingLojas.reduce((acc, r) => acc + r.totalVendido, 0);
    const totalVendidoSemCreditos = rankingLojas.reduce((acc, r) => acc + r.totalVendidoSemCreditos, 0);
    const totalTransacoes = rankingLojas.reduce((acc, r) => acc + r.qtdTransacoes, 0);
    const metaTotal = metasLojas.reduce((acc, m) => acc + (m.metaFaturamento || 0), 0);
    
    return {
      totalVendido,
      totalVendidoSemCreditos,
      totalTransacoes,
      ticketMedioGeral: totalTransacoes > 0 ? totalVendidoSemCreditos / totalTransacoes : 0,
      metaTotal,
      percentualMetaGeral: metaTotal > 0 ? (totalVendidoSemCreditos / metaTotal) * 100 : 0,
      qtdLojas: rankingLojas.length,
      qtdVendedores: rankingVendedores.length,
      lojasAcimaMedia: rankingLojas.filter(l => l.status === 'ACIMA_MEDIA' || l.status === 'NO_RITMO').length,
      lojasEmRisco: rankingLojas.filter(l => l.status === 'EM_RISCO' || l.status === 'CRITICO').length,
    };
  }, [rankingLojas, rankingVendedores, metasLojas]);

  // Gerar análise IA
  const gerarAnaliseIA = useCallback(async () => {
    if (tabAtiva === 'por-loja' && rankingLojas.length === 0) return;
    if (tabAtiva === 'por-vendedor' && rankingVendedores.length === 0) return;
    if (tabAtiva === 'visao-geral' && rankingLojas.length === 0) return;
    
    setLoadingDiretrizes(true);
    setErrorDiretrizes(null);
    
    try {
      const periodo = `${periodoDatas.dataInicio} a ${periodoDatas.dataFim}`;
      
      let tipo: 'loja' | 'vendedor' = 'loja';
      let dadosAnalise: any[] = [];

      if (tabAtiva === 'por-vendedor') {
        tipo = 'vendedor';
        dadosAnalise = rankingVendedores.slice(0, 20).map(r => ({
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
        }));
      } else {
        tipo = 'loja';
        dadosAnalise = rankingLojas.map(r => ({
          posicao: r.posicao,
          loja: r.empresa,
          faturamento: r.totalVendidoSemCreditos,
          ticketMedio: r.ticketMedio,
          qtdVendas: r.qtdTransacoes,
          percentualDesconto: r.percentualDesconto.toFixed(1) + '%',
          percentualMeta: r.percentualMeta ? r.percentualMeta.toFixed(1) + '%' : 'Sem meta',
          status: r.status || 'N/A',
        }));
      }

      const analise = await gerarDiretrizes({
        tipo,
        dados: dadosAnalise,
        periodo,
        meta: tabAtiva === 'por-loja' ? metasLojas : undefined,
      });
      
      setDiretrizes(analise);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao gerar análise";
      setErrorDiretrizes(message);
    } finally {
      setLoadingDiretrizes(false);
    }
  }, [tabAtiva, rankingLojas, rankingVendedores, periodoDatas, metasLojas]);

  // Reset diretrizes quando mudar de tab
  useEffect(() => {
    setDiretrizes(null);
    setErrorDiretrizes(null);
  }, [tabAtiva]);

  return {
    // Filtros
    filters,
    setFilters,
    tabAtiva,
    setTabAtiva,
    periodoDatas,
    
    // Dados
    rankingLojas,
    rankingVendedores,
    totais,
    empresas,
    
    // Estados
    loading,
    error,
    dataLoaded,
    fetchData,
    
    // IA
    diretrizes,
    loadingDiretrizes,
    errorDiretrizes,
    gerarAnaliseIA,
  };
}
