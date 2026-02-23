// src/components/financeiro-dashboard/FinanceiroDashboardLayout.tsx

import { useEffect } from "react";
import { Wallet, RefreshCw, AlertCircle, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { FinanceiroFilters as FiltersType, FinanceiroMetrics, KPIFilterType } from "@/hooks/useFinanceiroParcelas";
import { FinanceiroParcela } from "@/services/financeiroService";
import { FinanceiroFilters } from "./FinanceiroFilters";
import { FinanceiroKPICards } from "./FinanceiroKPICards";
import { FinanceiroVencimentoChart } from "./FinanceiroVencimentoChart";
import { FinanceiroParcelasTable } from "./FinanceiroParcelasTable";
import { useModuleInsights } from "@/hooks/useModuleInsights";
import { ModuleInsightsPanel } from "@/components/ia/ModuleInsightsPanel";
import { registerAction, unregisterAction } from "@/lib/actionCatalog";
import { useNavigate } from "react-router-dom";

interface FinanceiroDashboardLayoutProps {
  filters: FiltersType;
  setFilters: React.Dispatch<React.SetStateAction<FiltersType>>;
  loading: boolean;
  error: string | null;
  parcelas: FinanceiroParcela[];
  filteredParcelas: FinanceiroParcela[];
  metrics: FinanceiroMetrics;
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

const KPI_FILTER_LABELS: Record<KPIFilterType, string> = {
  TODOS: "Todas as parcelas",
  RECEBER_ABERTO: "A Receber (Aberto)",
  RECEBER_ATRASO: "A Receber (Atraso)",
  PAGAR_ABERTO: "A Pagar (Aberto)",
  PAGAR_ATRASO: "A Pagar (Atraso)",
};

export function FinanceiroDashboardLayout({
  filters,
  setFilters,
  loading,
  error,
  parcelas,
  filteredParcelas,
  metrics,
  reload,
}: FinanceiroDashboardLayoutProps) {
  // Funções de atalho para filtros rápidos (usando data local, não UTC)
  const formatLocalDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const navigate = useNavigate();
  const { insights, loading: insightsLoading, error: insightsError, refetch: refetchInsights } = useModuleInsights({
    module: "financeiro",
    period: { from: filters.dataIni, to: filters.dataFim },
    enabled: !loading && parcelas.length > 0,
  });

  useEffect(() => {
    registerAction("NAVIGATE_DRE", () => navigate("/financeiro/dre"));
    registerAction("NAVIGATE_FLUXO_CAIXA", () => navigate("/financeiro/fluxo-caixa"));
    return () => { unregisterAction("NAVIGATE_DRE"); unregisterAction("NAVIGATE_FLUXO_CAIXA"); };
  }, [navigate]);

  const hoje = formatLocalDate(new Date());
  const primeiroDiaMes = formatLocalDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const ultimoDiaMes = formatLocalDate(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0));

  const handleHojeVencimento = () => {
    setFilters((prev) => ({
      ...prev,
      campoData: "VENCIMENTO",
      dataIni: hoje,
      dataFim: hoje,
      kpiFilter: "TODOS",
    }));
  };

  const handleHojePagamento = () => {
    setFilters((prev) => ({
      ...prev,
      campoData: "PAGAMENTO",
      situacao: "PAGA",
      dataIni: hoje,
      dataFim: hoje,
      kpiFilter: "TODOS",
    }));
  };

  const handleMesAtualCompetencia = () => {
    setFilters((prev) => ({
      ...prev,
      campoData: "EMISSAO",
      dataIni: primeiroDiaMes,
      dataFim: ultimoDiaMes,
      kpiFilter: "TODOS",
    }));
  };

  const handleKPIFilterChange = (kpiFilter: KPIFilterType) => {
    setFilters((prev) => ({ ...prev, kpiFilter }));
  };

  const clearKPIFilter = () => {
    setFilters((prev) => ({ ...prev, kpiFilter: "TODOS" }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Wallet className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Contas a Pagar / Receber</h1>
            <p className="text-sm text-muted-foreground">Gestão financeira de parcelas</p>
          </div>
        </div>
        <Button variant="default" size="sm" onClick={reload} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* IA Insights */}
      {parcelas.length > 0 && (
        <ModuleInsightsPanel
          insights={insights}
          loading={insightsLoading}
          error={insightsError}
          onRetry={refetchInsights}
        />
      )}

      {/* Botões de atalho rápido */}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={handleHojeVencimento}>
          <Calendar className="h-4 w-4 mr-2" />
          Hoje (vencimento)
        </Button>
        <Button variant="secondary" size="sm" onClick={handleHojePagamento}>
          <Calendar className="h-4 w-4 mr-2" />
          Hoje (pagamento)
        </Button>
        <Button variant="secondary" size="sm" onClick={handleMesAtualCompetencia}>
          <Calendar className="h-4 w-4 mr-2" />
          Mês atual (competência)
        </Button>
      </div>

      <FinanceiroFilters
        filters={filters}
        onChange={(updates) => setFilters((prev) => ({ ...prev, ...updates }))}
      />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Aviso quando carregando dados de todas as empresas */}
      {loading && filters.empresa === null && (
        <Alert className="border-warning-muted bg-warning-soft">
          <AlertCircle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-warning-foreground">
            Carregando dados de todas as empresas. Esta consulta pode demorar até 60 segundos...
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <LoadingSkeleton />
      ) : (
        <>
          <FinanceiroKPICards 
            metrics={metrics} 
            activeFilter={filters.kpiFilter}
            onFilterChange={handleKPIFilterChange}
          />
          
          {/* Indicador de filtro ativo */}
          {filters.kpiFilter !== "TODOS" && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-sm">
                Filtro ativo: {KPI_FILTER_LABELS[filters.kpiFilter]}
              </Badge>
              <Button variant="ghost" size="sm" onClick={clearKPIFilter}>
                Limpar filtro
              </Button>
              <span className="text-sm text-muted-foreground">
                ({filteredParcelas.length} de {parcelas.length} parcelas)
              </span>
            </div>
          )}
          
          <FinanceiroVencimentoChart data={filteredParcelas} />
          <FinanceiroParcelasTable data={filteredParcelas} />
        </>
      )}
    </div>
  );
}
