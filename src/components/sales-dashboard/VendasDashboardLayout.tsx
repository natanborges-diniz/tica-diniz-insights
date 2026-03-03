// src/components/sales-dashboard/VendasDashboardLayout.tsx

import { useState, useMemo, useEffect } from "react";
import { RefreshCw, AlertCircle, Building2, Users, Info, Calendar, Clock, Database } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { VendasFiltersState, ViewMode, ResumoLoja, VendasMetrics, ProjecaoFechamento, ProgressoPaginacao } from "@/hooks/useVendasDashboard";
import { UseVendasDiariasResult } from "@/hooks/useVendasDiarias";
import { ResumoEmpresaVendedor, ResumoFormaPagamento } from "@/services/vendasService";
import { useChartFilter } from "@/hooks/useChartFilter";
import { ActiveFilterBadges } from "@/components/ui/active-filter-badges";
import { SalesFilters } from "./SalesFilters";
import { SalesKPICards } from "./SalesKPICards";
import { SellerChart } from "./SellerChart";
import { DescontoChart } from "./DescontoChart";
import { SalesTable } from "./SalesTable";
import { StoreChart } from "./StoreChart";
import { StoreTable } from "./StoreTable";
import { PaymentMethodsChart } from "./PaymentMethodsChart";
import { PaymentMethodsTable } from "./PaymentMethodsTable";
import { VendasDiariasTable } from "./VendasDiariasTable";
import { useModuleInsights } from "@/hooks/useModuleInsights";
import { ModuleInsightsPanel } from "@/components/ia/ModuleInsightsPanel";
import { registerAction, unregisterAction, createNavigationHandler } from "@/lib/actionCatalog";
import { useNavigate } from "react-router-dom";
interface VendasDashboardLayoutProps {
  // Dados
  dadosPorLoja: ResumoLoja[];
  dadosFormasPagamento: ResumoFormaPagamento[];
  dadosComDesconto: ResumoEmpresaVendedor[];
  dataLoaded: boolean;
  // Fonte de dados
  fontesDados?: {
    supabase: boolean;
    firebird: boolean;
    parcial?: boolean;
    mensagem?: string;
  };
  // Loading/Error
  loading: boolean;
  loadingDesconto?: boolean;
  error: string | null;
  erroDesconto?: string | null;
  // Filtros
  filters: VendasFiltersState;
  setFilters: React.Dispatch<React.SetStateAction<VendasFiltersState>>;
  // Métricas
  metrics: VendasMetrics;
  projecao: ProjecaoFechamento;
  // Alertas
  alertaPeriodo?: string | null;
  // Progresso da paginação
  progressoPaginacao?: ProgressoPaginacao | null;
  // Ações
  reload: () => void;
  forceRefresh?: () => void;
  // Vendas diárias (tabela expansível)
  vendasDiarias?: UseVendasDiariasResult;
  // Cache disponível
  cacheDisponivel?: { minData: string; maxData: string } | null;
}

function LoadingSkeleton({ progressoPaginacao }: { progressoPaginacao?: ProgressoPaginacao | null }) {
  const progressoPercent = progressoPaginacao 
    ? Math.round((progressoPaginacao.paginaAtual / progressoPaginacao.totalEstimado) * 100) 
    : 0;

  return (
    <div className="space-y-6">
      {/* Indicador de progresso da paginação */}
      {progressoPaginacao && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm font-medium text-foreground">
                  Carregando página {progressoPaginacao.paginaAtual} de {progressoPaginacao.totalEstimado}...
                </span>
              </div>
              <div className="w-full max-w-md">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>{progressoPaginacao.registrosCarregados} registros</span>
                  <span>{progressoPercent}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-300 ease-out"
                    style={{ width: `${progressoPercent}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* KPI Cards skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32 mb-2" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
      {/* Chart skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
      {/* Table skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-24" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Labels para os campos de filtro
const FILTER_LABELS: Record<string, string> = {
  loja: "Loja",
  vendedor: "Vendedor",
  formaPagamento: "Forma de Pagamento",
};

export function VendasDashboardLayout({
  dadosPorLoja,
  dadosFormasPagamento,
  dadosComDesconto,
  dataLoaded,
  fontesDados,
  loading,
  loadingDesconto,
  error,
  erroDesconto,
  filters,
  setFilters,
  metrics,
  projecao,
  alertaPeriodo,
  progressoPaginacao,
  reload,
  forceRefresh,
  vendasDiarias,
  cacheDisponivel,
}: VendasDashboardLayoutProps) {
  const navigate = useNavigate();
  const isLoading = loading;
  const showEmptyState = !dataLoaded && !loading;
  const [usarVendasSemCreditos, setUsarVendasSemCreditos] = useState(true);
  const [viewTab, setViewTab] = useState<"resumo" | "diario">("resumo");
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<string | null>(null);

  // Buscar última atualização do cache
  useEffect(() => {
    async function fetchUltimaAtualizacao() {
      const { data: lastUpdate } = await supabase
        .from('vendas_agregado_diario')
        .select('atualizado_em')
        .order('atualizado_em', { ascending: false })
        .limit(1);
      if (lastUpdate?.[0]?.atualizado_em) {
        setUltimaAtualizacao(lastUpdate[0].atualizado_em);
      }
    }
    fetchUltimaAtualizacao();
  }, [dataLoaded]);

  // IA Insights
  const { insights, loading: insightsLoading, error: insightsError, refetch: refetchInsights } = useModuleInsights({
    module: "vendas",
    period: { from: filters.dataInicio, to: filters.dataFim },
    filters: { empresa: filters.empresa },
    enabled: dataLoaded,
  });

  // Register actions for this module
  useEffect(() => {
    registerAction("NAVIGATE_INTELIGENCIA_VENDAS", () => navigate("/vendas/inteligencia"));
    registerAction("OPEN_RANKING_STORES", () => setFilters(p => ({ ...p, viewMode: "loja" as any })));
    registerAction("OPEN_RANKING_SELLERS", () => setFilters(p => ({ ...p, viewMode: "vendedor" as any })));
    registerAction("APPLY_FILTERS", (payload) => {
      if (payload) {
        setFilters(p => ({
          ...p,
          ...(payload.loja && typeof payload.loja === "string" ? { empresa: payload.loja } : {}),
        }));
      }
    });
    registerAction("EXPORT_FILTERED_DATASET", () => {
      // Trigger export via toast notification guiding user to use export button
      console.log("[actionCatalog] EXPORT_FILTERED_DATASET triggered");
    });
    registerAction("OPEN_SALES_ROW_DETAIL_SHEET", () => {
      console.log("[actionCatalog] OPEN_SALES_ROW_DETAIL_SHEET triggered");
    });
    return () => {
      unregisterAction("NAVIGATE_INTELIGENCIA_VENDAS");
      unregisterAction("OPEN_RANKING_STORES");
      unregisterAction("OPEN_RANKING_SELLERS");
      unregisterAction("APPLY_FILTERS");
      unregisterAction("EXPORT_FILTERED_DATASET");
      unregisterAction("OPEN_SALES_ROW_DETAIL_SHEET");
    };
  }, [navigate, setFilters]);

  // Hook para filtros interativos dos gráficos
  const chartFilter = useChartFilter<string>();

  // Dados filtrados por loja (considerando filtros do gráfico)
  const filteredDadosPorLoja = useMemo(() => {
    const lojaValue = chartFilter.getFilterValue('loja');
    if (!lojaValue) return dadosPorLoja;
    return dadosPorLoja.filter(d => d.empresa === lojaValue);
  }, [dadosPorLoja, chartFilter]);

  // Dados filtrados por vendedor (considerando filtros do gráfico)
  const filteredDadosVendedor = useMemo(() => {
    const vendedorValue = chartFilter.getFilterValue('vendedor');
    if (!vendedorValue) return dadosComDesconto;
    return dadosComDesconto.filter(d => d.vendedor === vendedorValue);
  }, [dadosComDesconto, chartFilter]);

  // Dados filtrados por loja e/ou forma de pagamento
  const filteredDadosFormasPagamento = useMemo(() => {
    let dados = dadosFormasPagamento;
    
    // Filtrar por loja (se selecionada no gráfico)
    const lojaValue = chartFilter.getFilterValue('loja');
    if (lojaValue) {
      dados = dados.filter(d => d.empresa === lojaValue);
    }
    
    // Filtrar por vendedor (se selecionado no gráfico)
    const vendedorValue = chartFilter.getFilterValue('vendedor');
    if (vendedorValue) {
      dados = dados.filter(d => d.vendedor === vendedorValue);
    }
    
    // Filtrar por forma de pagamento
    const formaValue = chartFilter.getFilterValue('formaPagamento');
    if (formaValue) {
      dados = dados.filter(d => d.formaPagamento === formaValue);
    }
    
    return dados;
  }, [dadosFormasPagamento, chartFilter]);

  // Métricas recalculadas com base nos filtros do gráfico
  // Agora usa apenas filteredDadosFormasPagamento (dados de desconto corrigidos no backend)
  const filteredMetrics = useMemo<VendasMetrics>(() => {
    // Se não há filtros ativos, retorna métricas originais
    if (!chartFilter.hasActiveFilters) return metrics;

    // Recalcula métricas com dados filtrados de formas de pagamento
    let totalVendido = 0;
    let totalCreditos = 0;
    let totalDevolucoes = 0;
    let qtdTransacoes = 0;
    
    // IMPORTANTE: O backend Railway agora distribui totalBruto e totalDesconto
    // proporcionalmente por forma de pagamento. Somar diretamente sem agrupamento.
    let totalBruto = 0;
    let totalDesconto = 0;

    filteredDadosFormasPagamento.forEach((d) => {
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

    const totalVendidoSemCreditos = totalVendido - totalCreditos;
    const ticketMedio = qtdTransacoes > 0 ? totalVendidoSemCreditos / qtdTransacoes : 0;
    
    const percentualDesconto = totalBruto > 0 ? (totalDesconto / totalBruto) * 100 : 0;
    const descontoDisponivel = totalBruto > 0;

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
      descontoDisponivel,
    };
  }, [metrics, chartFilter, filteredDadosFormasPagamento]);

  const handleViewModeChange = (mode: ViewMode) => {
    chartFilter.clearAllFilters();
    setFilters((prev) => ({ ...prev, viewMode: mode }));
  };

  const handleLojaClick = (loja: string) => {
    chartFilter.clearFilter('vendedor');
    chartFilter.clearFilter('formaPagamento');
    chartFilter.toggleFilter('loja', loja, loja.replace('DINIZ ', ''));
  };

  const handleVendedorClick = (vendedor: string) => {
    chartFilter.clearFilter('loja');
    chartFilter.clearFilter('formaPagamento');
    chartFilter.toggleFilter('vendedor', vendedor, vendedor);
  };

  const handleFormaPagamentoClick = (formaPagamento: string) => {
    chartFilter.toggleFilter('formaPagamento', formaPagamento, formaPagamento);
  };

  const handleRemoveFilter = (field: string, value: string) => {
    chartFilter.toggleFilter(field, value);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard de Vendas</h1>
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-sm text-muted-foreground">Análise de vendas por loja e vendedor</p>
            {cacheDisponivel && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">
                <Database className="h-3 w-3" />
                Cache: {new Date(cacheDisponivel.minData + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} — {new Date(cacheDisponivel.maxData + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            )}
            {ultimaAtualizacao && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">
                <Clock className="h-3 w-3" />
                Sync: {new Date(ultimaAtualizacao).toLocaleDateString('pt-BR')} {new Date(ultimaAtualizacao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={reload} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* IA Insights */}
      {dataLoaded && (
        <ModuleInsightsPanel
          insights={insights}
          loading={insightsLoading}
          error={insightsError}
          onRetry={refetchInsights}
        />
      )}

      {/* Filtros */}
      <SalesFilters
        dataInicio={filters.dataInicio}
        dataFim={filters.dataFim}
        empresa={filters.empresa === "ALL" ? "ALL" : String(filters.empresa)}
        onDataInicioChange={(v) => setFilters((p) => ({ ...p, dataInicio: v }))}
        onDataFimChange={(v) => setFilters((p) => ({ ...p, dataFim: v }))}
        onEmpresaChange={(v) => setFilters((p) => ({ ...p, empresa: v === "ALL" ? "ALL" : Number(v) }))}
        onRefresh={reload}
        isLoading={isLoading}
        alertaPeriodo={alertaPeriodo}
      />

      {/* Toggle de Visão e Toggle de Créditos */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2">
          <Button
            variant={filters.viewMode === "loja" ? "default" : "outline"}
            size="sm"
            onClick={() => handleViewModeChange("loja")}
          >
            <Building2 className="h-4 w-4 mr-2" />
            Por Loja
          </Button>
          <Button
            variant={filters.viewMode === "vendedor" ? "default" : "outline"}
            size="sm"
            onClick={() => handleViewModeChange("vendedor")}
          >
            <Users className="h-4 w-4 mr-2" />
            Por Vendedor
          </Button>
        </div>
        
        {/* Toggle Vendas sem Créditos */}
        <div className="flex items-center gap-2 bg-muted/50 px-3 py-2 rounded-lg">
          <Switch
            id="vendas-sem-creditos"
            checked={usarVendasSemCreditos}
            onCheckedChange={setUsarVendasSemCreditos}
          />
          <Label htmlFor="vendas-sem-creditos" className="text-sm cursor-pointer">
            {usarVendasSemCreditos ? "Vendas sem Créditos (padrão)" : "Vendas Totais"}
          </Label>
        </div>
      </div>

      {/* Badges de filtros ativos do gráfico */}
      <ActiveFilterBadges
        filters={chartFilter.activeFilters}
        onRemove={handleRemoveFilter}
        onClearAll={chartFilter.clearAllFilters}
        fieldLabels={FILTER_LABELS}
      />

      {/* Aviso de erro ou dados indisponíveis */}

      {/* Erros */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={reload} 
              disabled={isLoading}
              className="ml-4 shrink-0"
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${isLoading ? "animate-spin" : ""}`} />
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Estado inicial - Aguardando ação do usuário */}
      {showEmptyState && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Info className="h-12 w-12 text-muted-foreground mb-4" />
            <CardTitle className="text-lg mb-2">Clique em Atualizar para carregar os dados</CardTitle>
            <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
              Selecione o período desejado e clique no botão "Atualizar" para visualizar as vendas.
              O período máximo permitido é de 1 ano.
            </p>
            <Button onClick={reload} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Carregar Dados
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Alerta: período selecionado sem dados mas cache existe em outro período */}
      {dataLoaded && !loading && dadosFormasPagamento.length === 0 && cacheDisponivel && (
        <Alert className="border-warning/50 bg-warning/10">
          <AlertCircle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-warning-foreground">
            <strong>Sem dados para o período selecionado.</strong>{' '}
            Os dados disponíveis no cache vão de{' '}
            <strong>
              {new Date(cacheDisponivel.minData + 'T12:00:00').toLocaleDateString('pt-BR')}
            </strong>{' '}
            até{' '}
            <strong>
              {new Date(cacheDisponivel.maxData + 'T12:00:00').toLocaleDateString('pt-BR')}
            </strong>.
            Ajuste o filtro de datas ou clique em Atualizar para tentar sincronizar dados novos.
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <LoadingSkeleton progressoPaginacao={progressoPaginacao} />
      ) : dataLoaded && (
        <>
          {/* KPIs */}
          <SalesKPICards 
            metrics={filteredMetrics} 
            projecao={projecao}
            isLoading={loading} 
            usarVendasSemCreditos={usarVendasSemCreditos} 
          />

          {/* Tabs para alternar entre visão resumo e diária */}
          <Tabs value={viewTab} onValueChange={(v) => setViewTab(v as "resumo" | "diario")} className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="resumo" className="gap-2">
                <Building2 className="h-4 w-4" />
                Visão Geral
              </TabsTrigger>
              <TabsTrigger value="diario" className="gap-2">
                <Calendar className="h-4 w-4" />
                Por Dia (Auditoria)
              </TabsTrigger>
            </TabsList>

            <TabsContent value="resumo" className="space-y-6 mt-6">
              {/* Gráfico e Tabela - Condicional por modo */}
              {filters.viewMode === "loja" ? (
                <>
                  <StoreChart 
                    dados={dadosPorLoja} 
                    isLoading={loading} 
                    usarVendasSemCreditos={usarVendasSemCreditos}
                    selectedLoja={chartFilter.getFilterValue('loja')}
                    onLojaClick={handleLojaClick}
                    projecao={projecao}
                  />
                  <StoreTable 
                    dados={filteredDadosPorLoja} 
                    isLoading={loading} 
                    usarVendasSemCreditos={usarVendasSemCreditos} 
                  />
                </>
              ) : (
                <>
                  <div className="grid gap-6 lg:grid-cols-2">
                    <SellerChart 
                      dados={dadosComDesconto} 
                      isLoading={loading} 
                      usarVendasSemCreditos={usarVendasSemCreditos}
                      selectedVendedor={chartFilter.getFilterValue('vendedor')}
                      onVendedorClick={handleVendedorClick}
                      projecao={projecao}
                    />
                    <DescontoChart
                      dados={filteredDadosVendedor} 
                      isLoading={loadingDesconto} 
                      erro={erroDesconto} 
                    />
                  </div>
                  <SalesTable 
                    dados={filteredDadosVendedor} 
                    isLoading={loading} 
                    loadingDesconto={loadingDesconto}
                    limiteDesconto={15} 
                    usarVendasSemCreditos={usarVendasSemCreditos} 
                  />
                </>
              )}

              {/* Seção Formas de Pagamento */}
              <div className="grid gap-6 lg:grid-cols-2">
                <PaymentMethodsChart 
                  dados={dadosFormasPagamento} 
                  isLoading={loading}
                  selectedFormaPagamento={chartFilter.getFilterValue('formaPagamento')}
                  onFormaPagamentoClick={handleFormaPagamentoClick}
                />
                <PaymentMethodsTable 
                  dados={filteredDadosFormasPagamento} 
                  isLoading={loading} 
                />
              </div>
            </TabsContent>

            <TabsContent value="diario" className="mt-6">
              {vendasDiarias ? (
                <VendasDiariasTable
                  resumosDiarios={vendasDiarias.resumosDiarios}
                  loading={vendasDiarias.loading}
                  error={vendasDiarias.error}
                  onReload={vendasDiarias.carregarResumos}
                />
              ) : (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    Dados diários não disponíveis.
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
