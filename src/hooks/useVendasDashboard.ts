// src/hooks/useVendasDashboard.ts
// Hook para dashboard de vendas - ESTRATÉGIA HÍBRIDA
// Dados históricos: Supabase (instantâneo, ~50ms)
// Dados do dia atual: Firebird (tempo real)

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  getResumoFormasPagamento,
  getResumoEmpresaVendedor,
  ResumoFormaPagamento,
  ResumoEmpresaVendedor as ResumoEmpresaVendedorAPI,
} from "@/services/vendasService";
import { getVendasAgregado, AgregadoFormaPagamento } from "@/services/agregadosService";
import { EmpresaParam } from "@/services/firebirdBridge";
import { getPeriodoComercial, formatLocalDate, diffInDays } from "@/utils/dateValidation";
import { supabase } from "@/integrations/supabase/client";

export type ViewMode = "loja" | "vendedor";

export interface VendasFiltersState {
  dataInicio: string;
  dataFim: string;
  viewMode: ViewMode;
  empresa: EmpresaParam;
}

// Interface para métricas globais
export interface VendasMetrics {
  // Vendas (do endpoint rápido)
  totalVendido: number;
  totalCreditos: number;
  totalDevolucoes: number;
  totalVendidoSemCreditos: number;
  qtdTransacoes: number;
  ticketMedio: number;
  // Desconto (do endpoint lento - pode estar indisponível)
  totalBruto: number;
  totalDesconto: number;
  percentualDesconto: number;
  descontoDisponivel: boolean;
}

// Interface para projeção de fechamento
export interface ProjecaoFechamento {
  temProjecao: boolean; // true se há datas futuras no período
  diasTotais: number;
  diasDecorridos: number;
  diasRestantes: number;
  mediaDiaria: number;
  projecaoFechamento: number;
  percentualPeriodo: number;
}

// Interface agregada por loja
export interface ResumoLoja {
  empresa: string;
  totalVendido: number;
  totalCreditos: number;
  totalDevolucoes: number;
  totalVendidoSemCreditos: number;
  qtdTransacao: number;
  ticketMedio: number;
  // Desconto (opcional, pode não estar disponível)
  totalBruto: number;
  totalDesconto: number;
  percentualDesconto: number;
}

// Re-export da interface do service para usar nos componentes
export type { ResumoEmpresaVendedorAPI as ResumoEmpresaVendedor };
export type { ResumoFormaPagamento };

// Cache de nomes de empresas (com TTL de 5 minutos)
let empresasCache: Map<number, string> | null = null;
let empresasCacheTime: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

async function getEmpresasMap(): Promise<Map<number, string>> {
  const now = Date.now();
  
  // Usar cache se ainda válido
  if (empresasCache && (now - empresasCacheTime) < CACHE_TTL) {
    return empresasCache;
  }
  
  const { data } = await supabase
    .from('empresa')
    .select('cod_empresa, nome_fantasia');
  
  empresasCache = new Map();
  data?.forEach((e) => {
    empresasCache!.set(e.cod_empresa, e.nome_fantasia || `Loja ${e.cod_empresa}`);
  });
  empresasCacheTime = now;
  
  return empresasCache;
}

// Converte AgregadoFormaPagamento para ResumoFormaPagamento
async function converterAgregadoParaResumo(
  agregados: AgregadoFormaPagamento[]
): Promise<ResumoFormaPagamento[]> {
  const empresasMap = await getEmpresasMap();
  
  return agregados.map((a) => ({
    codEmpresa: a.codEmpresa,
    empresa: empresasMap.get(a.codEmpresa) || `Loja ${a.codEmpresa}`,
    vendedor: a.vendedor,
    formaPagamento: a.formaPagamento,
    totalGeral: a.totalGeral,
    qtdVendas: a.qtdVendas,
    totalBruto: a.totalBruto,
    totalDesconto: a.totalDesconto,
    percentualDesconto: a.percentualDesconto,
  }));
}

// Função para calcular métricas de formas de pagamento
// NOTA IMPORTANTE: 
// - "CREDITOS" são uma forma de pagamento válida (saldo do cliente usado como pagamento)
// - "DEVOLUCAO" representa cancelamentos e deve ser excluída das vendas válidas
// - totalVendido = vendas COM créditos (inclui créditos, exclui devoluções)
// - totalVendidoSemCreditos = vendas SEM créditos (para toggle no dashboard)
// Os campos total_bruto e total_desconto agora estão corretos após correção do backend
// (usando subquery para cálculo proporcional por forma de pagamento)
function calcularMetricasFormasPagamento(dados: ResumoFormaPagamento[]) {
  let totalVendido = 0;
  let totalCreditos = 0;
  let totalDevolucoes = 0;
  let qtdTransacoes = 0;
  
  // IMPORTANTE: O backend Railway agora distribui totalBruto e totalDesconto
  // proporcionalmente por forma de pagamento. Portanto, devemos somar diretamente
  // sem agrupamento por empresa (cada linha já contém a fração correta).
  let totalBruto = 0;
  let totalDesconto = 0;

  dados.forEach((d) => {
    const formaPagamentoUpper = (d.formaPagamento || '').toUpperCase().trim();
    const isDevolucao = formaPagamentoUpper === 'DEVOLUCAO';
    const isCredito = formaPagamentoUpper === 'CREDITOS' || formaPagamentoUpper === 'CREDITO';
    
    if (isDevolucao) {
      totalDevolucoes += Math.abs(d.totalGeral);
    } else {
      totalVendido += d.totalGeral;
      if (isCredito) {
        totalCreditos += d.totalGeral;
      }
      qtdTransacoes += d.qtdVendas;
      
      // Somar diretamente - backend já distribui proporcionalmente por forma de pagamento
      totalBruto += d.totalBruto || 0;
      totalDesconto += d.totalDesconto || 0;
    }
  });

  // totalVendidoSemCreditos = vendas excluindo créditos (para toggle "vendas sem créditos")
  const totalVendidoSemCreditos = totalVendido - totalCreditos;
  const ticketMedio = qtdTransacoes > 0 ? totalVendidoSemCreditos / qtdTransacoes : 0;

  const percentualDesconto = totalBruto > 0 ? (totalDesconto / totalBruto) * 100 : 0;

  return {
    totalVendido,
    totalCreditos,
    totalDevolucoes,
    totalVendidoSemCreditos,
    qtdTransacoes,
    ticketMedio,
    totalBruto,
    totalDesconto,
    percentualDesconto,
  };
}

// NOTA: A função calcularMetricasDesconto foi removida.
// Após correção do backend (subquery proporcional), os dados de desconto
// agora vêm corretamente do endpoint resumo-formas-pagamento.

// Função para agregar dados de formas de pagamento por loja (agora inclui desconto do endpoint rápido)
// NOTA IMPORTANTE: 
// - "CREDITOS" são uma forma de pagamento válida (saldo do cliente usado como pagamento)
// - "DEVOLUCAO" representa cancelamentos/devoluções e deve ser excluída das vendas válidas
// - totalVendidoSemCreditos = vendas válidas EXCLUINDO devoluções (créditos SÃO contados como venda)
function agruparPorLoja(dados: ResumoFormaPagamento[]): ResumoLoja[] {
  // Agregar formas de pagamento por empresa
  const mapaFormas = new Map<number, {
    empresa: string;
    codEmpresa: number;
    totalVendido: number;      // Soma de TODAS as formas (exceto devoluções)
    totalCreditos: number;     // Apenas para referência/exibição
    totalDevolucoes: number;   // Valor absoluto das devoluções
    qtdTransacao: number;
    totalBruto: number;
    totalDesconto: number;
  }>();

  dados.forEach((d) => {
    const existing = mapaFormas.get(d.codEmpresa);
    
    const formaPagamentoUpper = (d.formaPagamento || '').toUpperCase().trim();
    const isDevolucao = formaPagamentoUpper === 'DEVOLUCAO';
    const isCredito = formaPagamentoUpper === 'CREDITOS' || formaPagamentoUpper === 'CREDITO';
    
    // Devoluções são excluídas do totalVendido
    // Créditos SÃO contados como venda (é uma forma de pagamento válida)
    const valorVenda = isDevolucao ? 0 : d.totalGeral;
    const valorCredito = isCredito ? d.totalGeral : 0;
    const valorDevolucao = isDevolucao ? Math.abs(d.totalGeral) : 0;
    const qtdVendas = isDevolucao ? 0 : d.qtdVendas;
    // Desconto não conta para devoluções
    const valorBruto = isDevolucao ? 0 : (d.totalBruto ?? 0);
    const valorDesconto = isDevolucao ? 0 : (d.totalDesconto ?? 0);
    
    if (existing) {
      existing.totalVendido += valorVenda;
      existing.totalCreditos += valorCredito;
      existing.totalDevolucoes += valorDevolucao;
      existing.qtdTransacao += qtdVendas;
      existing.totalBruto += valorBruto;
      existing.totalDesconto += valorDesconto;
    } else {
      mapaFormas.set(d.codEmpresa, {
        empresa: d.empresa,
        codEmpresa: d.codEmpresa,
        totalVendido: valorVenda,
        totalCreditos: valorCredito,
        totalDevolucoes: valorDevolucao,
        qtdTransacao: qtdVendas,
        totalBruto: valorBruto,
        totalDesconto: valorDesconto,
      });
    }
  });

  // Converter para array e calcular percentuais
  // totalVendidoSemCreditos = vendas excluindo créditos (para toggle "vendas sem créditos")
  return Array.from(mapaFormas.values()).map((item) => {
    // Créditos são vendas válidas, mas o toggle permite mostrar COM ou SEM
    const totalVendidoSemCreditos = item.totalVendido - item.totalCreditos;
    const ticketMedio = item.qtdTransacao > 0 ? totalVendidoSemCreditos / item.qtdTransacao : 0;
    const percentualDesconto = item.totalBruto > 0 ? (item.totalDesconto / item.totalBruto) * 100 : 0;
    
    return {
      empresa: item.empresa,
      totalVendido: item.totalVendido,
      totalCreditos: item.totalCreditos,
      totalDevolucoes: item.totalDevolucoes,
      totalVendidoSemCreditos,
      qtdTransacao: item.qtdTransacao,
      ticketMedio,
      totalBruto: item.totalBruto,
      totalDesconto: item.totalDesconto,
      percentualDesconto,
    };
  });
}

// Combina dados do Supabase (histórico) + Firebird (dia atual)
function combinarDados(
  dadosSupabase: ResumoFormaPagamento[],
  dadosFirebird: ResumoFormaPagamento[]
): ResumoFormaPagamento[] {
  // Usar mapa para agregar por empresa + vendedor + forma de pagamento
  const mapa = new Map<string, ResumoFormaPagamento>();
  
  // Adicionar dados do Supabase primeiro
  dadosSupabase.forEach((d) => {
    const key = `${d.codEmpresa}|${d.vendedor}|${d.formaPagamento}`;
    mapa.set(key, { ...d });
  });
  
  // Somar dados do Firebird (dia atual)
  dadosFirebird.forEach((d) => {
    const key = `${d.codEmpresa}|${d.vendedor}|${d.formaPagamento}`;
    const existing = mapa.get(key);
    
    if (existing) {
      existing.totalGeral += d.totalGeral;
      existing.qtdVendas += d.qtdVendas;
      existing.totalBruto = (existing.totalBruto ?? 0) + (d.totalBruto ?? 0);
      existing.totalDesconto = (existing.totalDesconto ?? 0) + (d.totalDesconto ?? 0);
      // Recalcular percentual
      existing.percentualDesconto = existing.totalBruto && existing.totalBruto > 0
        ? ((existing.totalDesconto ?? 0) / existing.totalBruto) * 100
        : 0;
    } else {
      mapa.set(key, { ...d });
    }
  });
  
  return Array.from(mapa.values());
}

export function useVendasDashboard() {
  // Período comercial: dia 21 do mês anterior ao dia 20 do mês atual
  const defaultPeriodo = getPeriodoComercial();

  const [filters, setFilters] = useState<VendasFiltersState>({
    dataInicio: defaultPeriodo.dataIni,
    dataFim: defaultPeriodo.dataFim,
    viewMode: "loja",
    empresa: 'ALL',
  });

  const [dadosFormasPagamento, setDadosFormasPagamento] = useState<ResumoFormaPagamento[]>([]);
  const [dadosComDesconto, setDadosComDesconto] = useState<ResumoEmpresaVendedorAPI[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDesconto, setLoadingDesconto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [erroDesconto, setErroDesconto] = useState<string | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [fontesDados, setFontesDados] = useState<{ 
    supabase: boolean; 
    firebird: boolean;
    parcial?: boolean;
    ultimaDataCache?: string;
  }>({ 
    supabase: false, 
    firebird: false 
  });

  const fetchData = useCallback(async (
    empresa: EmpresaParam, 
    dataInicio: string, 
    dataFim: string,
    options?: { bypassCache?: boolean }
  ) => {
    const bypassCache = options?.bypassCache ?? false;
    
    setLoading(true);
    setError(null);
    setLoadingDesconto(true);
    setErroDesconto(null);
    setFontesDados({ supabase: false, firebird: false });
    
    const hoje = formatLocalDate(new Date());
    
    // ESTRATÉGIA HÍBRIDA (reativada):
    // - Dados no Supabase estão com granularidade DIÁRIA (9.423 registros até 12/01/2026)
    // - Para período 100% histórico (até ontem): usar Supabase (instantâneo, ~50ms)
    // - Para período que inclui hoje: Supabase (histórico) + Firebird (hoje)
    // - Se bypassCache=true: forçar Firebird
    
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    const ontemStr = formatLocalDate(ontem);
    const periodoHistorico = dataFim < hoje;
    
    console.log('[useVendasDashboard] Estratégia:', {
      dataInicio,
      dataFim,
      hoje,
      ontemStr,
      periodoHistorico,
      bypassCache,
    });
    
    try {
      // NOTA: O cache Supabase atualmente só tem dados do último dia de cada mês
      // (não é diário ainda). Por isso, vamos usar Firebird para períodos recentes
      // e só usar Supabase para períodos 100% históricos COM dados suficientes.
      
      // Estratégia 1: Período 100% histórico e cache habilitado -> tentar Supabase
      if (!bypassCache && periodoHistorico) {
        console.log('[useVendasDashboard] Tentando Supabase (período 100% histórico)');
        const startSupabase = performance.now();
        
        const dadosAgregados = await getVendasAgregado({
          empresa,
          dataInicio,
          dataFim,
        });
        
        const tempoSupabase = Math.round(performance.now() - startSupabase);
        console.log(`[useVendasDashboard] Supabase: ${dadosAgregados.length} registros em ${tempoSupabase}ms`);
        
        // Verificar se Supabase tem dados suficientes (mínimo 10 registros agregados)
        if (dadosAgregados.length >= 10) {
          const dadosConvertidos = await converterAgregadoParaResumo(dadosAgregados);
          setDadosFormasPagamento(dadosConvertidos);
          setFontesDados({ supabase: true, firebird: false });
          setDataLoaded(true);
          setLoading(false);
        } else {
          // Supabase não tem dados suficientes, usar Firebird
          console.log('[useVendasDashboard] Supabase com poucos dados, usando Firebird');
          throw new Error('Supabase sem dados suficientes para o período');
        }
      }
      // Estratégia 2: Período inclui hoje -> Fallback gracioso
      // 1. Buscar Supabase primeiro (dados parciais, mas instantâneos)
      // 2. Mostrar imediatamente o que tiver disponível
      // 3. Tentar Firebird em background com timeout de 15s
      // 4. Se Firebird falhar, manter dados parciais do Supabase
      else if (!bypassCache && dataFim >= hoje) {
        console.log('[useVendasDashboard] Estratégia híbrida com fallback gracioso');
        
        // 1. Buscar Supabase primeiro (até ontem)
        let dadosSupabase: AgregadoFormaPagamento[] = [];
        let ultimaDataCache = ontemStr;
        
        try {
          const startSupabase = performance.now();
          dadosSupabase = await getVendasAgregado({
            empresa,
            dataInicio,
            dataFim: ontemStr, // até ontem
          });
          const tempoSupabase = Math.round(performance.now() - startSupabase);
          console.log(`[useVendasDashboard] Supabase: ${dadosSupabase.length} registros em ${tempoSupabase}ms`);
        } catch (e) {
          console.warn('[useVendasDashboard] Erro ao buscar Supabase:', e);
        }
        
        // 2. Se tiver algo no Supabase, mostrar imediatamente como dados parciais
        if (dadosSupabase.length > 0) {
          const dadosConvertidos = await converterAgregadoParaResumo(dadosSupabase);
          setDadosFormasPagamento(dadosConvertidos);
          setFontesDados({ 
            supabase: true, 
            firebird: false, 
            parcial: true,
            ultimaDataCache,
          });
          setDataLoaded(true);
          setLoading(false);
          console.log('[useVendasDashboard] Dados parciais do Supabase exibidos, tentando Firebird em background...');
        }
        
        // 3. Tentar Firebird em background (não bloqueia UI)
        try {
          const startFirebird = performance.now();
          const dadosFirebird = await Promise.race([
            getResumoFormasPagamento({
              empresa,
              dataInicio,
              dataFim,
              bypassCache: true,
              excluirCreditos: true,
              incluirDevolucoes: false,
            }),
            new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error('Firebird timeout (15s)')), 15000)
            )
          ]) as ResumoFormaPagamento[];
          
          const tempoFirebird = Math.round(performance.now() - startFirebird);
          console.log(`[useVendasDashboard] Firebird: ${dadosFirebird.length} registros em ${tempoFirebird}ms`);
          
          // Firebird respondeu! Usar dados completos
          setDadosFormasPagamento(dadosFirebird);
          setFontesDados({ supabase: false, firebird: true });
          setDataLoaded(true);
          setLoading(false);
        } catch (e) {
          console.warn('[useVendasDashboard] Firebird indisponível:', e);
          
          // Firebird falhou - verificar se temos dados do Supabase como fallback
          if (dadosSupabase.length > 0) {
            // Já exibimos dados parciais acima, apenas atualizar estado
            console.log('[useVendasDashboard] Mantendo dados parciais do Supabase');
            // Estado já foi setado acima, não precisa fazer nada
          } else {
            // Nem Supabase nem Firebird têm dados
            setFontesDados({ supabase: false, firebird: false, parcial: true });
            setError('Servidor indisponível e cache vazio. Tente novamente em alguns minutos.');
            setDadosFormasPagamento([]);
            setDataLoaded(true);
            setLoading(false);
          }
        }
      }
      // Estratégia 3: Bypass cache ou período apenas hoje -> Firebird direto
      else {
        console.log('[useVendasDashboard] Usando Firebird direto');
        const startFirebird = performance.now();
        
        const dadosFirebird = await getResumoFormasPagamento({
          empresa,
          dataInicio,
          dataFim,
          bypassCache: true,
          excluirCreditos: true,
          incluirDevolucoes: false,
        });
        
        const tempoFirebird = Math.round(performance.now() - startFirebird);
        console.log(`[useVendasDashboard] Firebird: ${dadosFirebird.length} registros em ${tempoFirebird}ms`);
        
        setDadosFormasPagamento(dadosFirebird);
        setFontesDados({ supabase: false, firebird: true });
        setDataLoaded(true);
        setLoading(false);
      }
      
    } catch (err) {
      // Fallback para Firebird em caso de erro do Supabase
      console.warn('[useVendasDashboard] Erro na estratégia híbrida, tentando Firebird:', err);
      
      try {
        const dadosFirebird = await getResumoFormasPagamento({
          empresa,
          dataInicio,
          dataFim,
          bypassCache: true,
          excluirCreditos: true,
          incluirDevolucoes: false,
        });
        
        setDadosFormasPagamento(dadosFirebird);
        setFontesDados({ supabase: false, firebird: true });
        setDataLoaded(true);
      } catch (errFirebird) {
        const message = errFirebird instanceof Error ? errFirebird.message : "Erro ao buscar dados de vendas";
        console.error('[useVendasDashboard] Erro Firebird:', message);
        setError(message);
        setDadosFormasPagamento([]);
      }
    } finally {
      setLoading(false);
    }

    // Buscar dados de desconto separadamente (endpoint lento, pode dar timeout)
    try {
      console.log('[useVendasDashboard] Buscando dados de desconto...', bypassCache ? '(sem cache)' : '(cache)');
      const resultDesconto = await getResumoEmpresaVendedor({ 
        empresa, 
        dataInicio, 
        dataFim,
        bypassCache,
      });
      console.log('[useVendasDashboard] Desconto recebido:', resultDesconto.length, 'registros');
      
      if (resultDesconto.length > 0) {
        const amostra = resultDesconto[0];
        console.log('[useVendasDashboard] Amostra:', {
          vendedor: amostra.vendedor,
          totalBruto: amostra.totalBruto,
          totalDesconto: amostra.totalDesconto,
          percentualDesconto: amostra.percentualDesconto,
        });
      }
      
      setDadosComDesconto(resultDesconto);
      setErroDesconto(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao buscar dados de desconto";
      console.warn('[useVendasDashboard] Erro desconto:', message);
      setErroDesconto('Dados de desconto indisponíveis. Tente filtrar por loja.');
      setDadosComDesconto([]);
    } finally {
      setLoadingDesconto(false);
    }
  }, []);

  // Métricas calculadas - agora tudo vem do endpoint resumo-formas-pagamento
  // Após correção do backend (subquery proporcional), os dados de desconto estão corretos
  const metrics = useMemo<VendasMetrics>(() => {
    const metricasFormas = calcularMetricasFormasPagamento(dadosFormasPagamento);
    
    // Desconto agora vem do mesmo endpoint (corrigido no backend)
    const descontoDisponivel = metricasFormas.totalBruto > 0;

    console.log('[Métricas] Unificadas (endpoint resumo-formas-pagamento):', {
      totalVendidoSemCreditos: metricasFormas.totalVendidoSemCreditos,
      totalBruto: metricasFormas.totalBruto,
      totalDesconto: metricasFormas.totalDesconto,
      percentualDesconto: metricasFormas.percentualDesconto,
      descontoDisponivel,
    });

    return {
      ...metricasFormas,
      descontoDisponivel,
    };
  }, [dadosFormasPagamento]);

  // Projeção de fechamento do período
  const projecao = useMemo<ProjecaoFechamento>(() => {
    const hoje = new Date();
    const hojeStr = formatLocalDate(hoje);
    const dataInicio = new Date(filters.dataInicio + 'T00:00:00');
    const dataFim = new Date(filters.dataFim + 'T00:00:00');
    
    // Calcular dias totais do período
    const diasTotais = diffInDays(filters.dataInicio, filters.dataFim) + 1;
    
    // Verificar se há datas futuras no período
    const temProjecao = hojeStr < filters.dataFim;
    
    if (!temProjecao) {
      // Período já encerrado - sem projeção
      return {
        temProjecao: false,
        diasTotais,
        diasDecorridos: diasTotais,
        diasRestantes: 0,
        mediaDiaria: 0,
        projecaoFechamento: 0,
        percentualPeriodo: 100,
      };
    }
    
    // Calcular dias decorridos (desde início até hoje ou início do período)
    let diasDecorridos = 0;
    if (hojeStr >= filters.dataInicio) {
      diasDecorridos = diffInDays(filters.dataInicio, hojeStr) + 1;
    }
    
    const diasRestantes = diasTotais - diasDecorridos;
    const percentualPeriodo = diasTotais > 0 ? (diasDecorridos / diasTotais) * 100 : 0;
    
    // Média diária baseada no faturamento atual
    const totalAtual = metrics.totalVendidoSemCreditos;
    const mediaDiaria = diasDecorridos > 0 ? totalAtual / diasDecorridos : 0;
    
    // Projeção para o fechamento do período
    const projecaoFechamento = mediaDiaria * diasTotais;
    
    return {
      temProjecao: true,
      diasTotais,
      diasDecorridos,
      diasRestantes,
      mediaDiaria,
      projecaoFechamento,
      percentualPeriodo,
    };
  }, [filters.dataInicio, filters.dataFim, metrics.totalVendidoSemCreditos]);

  // Dados agregados por loja (agora usa apenas endpoint rápido)
  const dadosPorLoja = useMemo(
    () => agruparPorLoja(dadosFormasPagamento),
    [dadosFormasPagamento]
  );

  // Reload - usa estratégia híbrida automaticamente
  // (Supabase para histórico, Firebird para hoje)
  const reload = useCallback(() => {
    fetchData(filters.empresa, filters.dataInicio, filters.dataFim);
  }, [filters.empresa, filters.dataInicio, filters.dataFim, fetchData]);

  // Auto-load on mount
  useEffect(() => {
    reload();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    // Dados brutos
    dadosFormasPagamento,
    dadosComDesconto, // Dados com desconto do endpoint lento
    dadosPorLoja,
    dataLoaded,
    fontesDados, // Indica quais fontes foram usadas (supabase/firebird)
    // Loading/Error
    loading,
    loadingFormas: loading,
    loadingDesconto,
    error,
    errorFormas: error,
    erroDesconto,
    // Filtros e ações
    filters,
    setFilters,
    metrics,
    projecao,
    reload,
  };
}
