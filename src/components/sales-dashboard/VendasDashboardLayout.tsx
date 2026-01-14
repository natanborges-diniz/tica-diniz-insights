// src/components/sales-dashboard/VendasDashboardLayout.tsx

import { useState, useMemo } from "react";
import { RefreshCw, AlertCircle, Building2, Users, Info, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

import { VendasFiltersState, ViewMode, ResumoLoja, VendasMetrics, ProjecaoFechamento } from "@/hooks/useVendasDashboard";
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
    ultimaDataCache?: string;
  };
  // Loading/Error
  loading: boolean;
  loadingFormas: boolean;
  loadingDesconto?: boolean;
  error: string | null;
  errorFormas: string | null;
  erroDesconto?: string | null;
  // Filtros
  filters: VendasFiltersState;
  setFilters: React.Dispatch<React.SetStateAction<VendasFiltersState>>;
  // Métricas
  metrics: VendasMetrics;
  projecao: ProjecaoFechamento;
  // Ações
  reload: () => void;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
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
  loadingFormas,
  loadingDesconto,
  error,
  errorFormas,
  erroDesconto,
  filters,
  setFilters,
  metrics,
  projecao,
  reload,
}: VendasDashboardLayoutProps) {
  const isLoading = loading || loadingFormas;
  const showEmptyState = !dataLoaded && !loading;
  const [usarVendasSemCreditos, setUsarVendasSemCreditos] = useState(true);

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
          <p className="text-sm text-muted-foreground">Análise de vendas por loja e vendedor</p>
        </div>
        <Button variant="outline" size="sm" onClick={reload} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

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

      {/* Aviso de dados parciais (Firebird indisponível) */}
      {fontesDados?.parcial && (
        <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800 dark:text-amber-200">
            <strong>Dados parciais:</strong> Servidor de dados em tempo real indisponível. 
            Exibindo cache até {fontesDados.ultimaDataCache ? 
              new Date(fontesDados.ultimaDataCache + 'T00:00:00').toLocaleDateString('pt-BR') : 
              'ontem'
            }. Os dados de hoje serão incluídos quando o servidor estiver disponível.
          </AlertDescription>
        </Alert>
      )}

      {/* Erros */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
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

      {loading ? (
        <LoadingSkeleton />
      ) : dataLoaded && (
        <>
          {/* KPIs */}
          <SalesKPICards 
            metrics={filteredMetrics} 
            projecao={projecao}
            isLoading={loading} 
            usarVendasSemCreditos={usarVendasSemCreditos} 
          />

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
          {errorFormas && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errorFormas}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <PaymentMethodsChart 
              dados={dadosFormasPagamento} 
              isLoading={loadingFormas}
              selectedFormaPagamento={chartFilter.getFilterValue('formaPagamento')}
              onFormaPagamentoClick={handleFormaPagamentoClick}
            />
            <PaymentMethodsTable 
              dados={filteredDadosFormasPagamento} 
              isLoading={loadingFormas} 
            />
          </div>
        </>
      )}
    </div>
  );
}
