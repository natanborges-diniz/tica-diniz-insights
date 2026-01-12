// src/components/sales-dashboard/VendasDashboardLayout.tsx

import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, BarChart3, RefreshCw, AlertCircle, Building2, Users, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

import { VendasFiltersState, ViewMode, ResumoLoja, VendasMetrics } from "@/hooks/useVendasDashboard";
import { ResumoEmpresaVendedor, ResumoFormaPagamento } from "@/services/vendasService";
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
  dados: ResumoEmpresaVendedor[];
  dadosPorLoja: ResumoLoja[];
  dadosFormasPagamento: ResumoFormaPagamento[];
  dataLoaded: boolean;
  // Loading/Error
  loading: boolean;
  loadingFormas: boolean;
  error: string | null;
  errorFormas: string | null;
  // Filtros
  filters: VendasFiltersState;
  setFilters: React.Dispatch<React.SetStateAction<VendasFiltersState>>;
  // Métricas
  metrics: VendasMetrics;
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

export function VendasDashboardLayout({
  dados,
  dadosPorLoja,
  dadosFormasPagamento,
  dataLoaded,
  loading,
  loadingFormas,
  error,
  errorFormas,
  filters,
  setFilters,
  metrics,
  reload,
}: VendasDashboardLayoutProps) {
  const isLoading = loading || loadingFormas;
  const showEmptyState = !dataLoaded && !loading;
  const [usarVendasSemCreditos, setUsarVendasSemCreditos] = useState(true);

  const handleViewModeChange = (mode: ViewMode) => {
    setFilters((prev) => ({ ...prev, viewMode: mode }));
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-bold text-foreground">Gestão de Vendas</h1>
                <p className="text-sm text-muted-foreground">Óticas Diniz Osasco e Região</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={reload} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Filtros de Data */}
        <SalesFilters
          dataInicio={filters.dataInicio}
          dataFim={filters.dataFim}
          onDataInicioChange={(v) => setFilters((p) => ({ ...p, dataInicio: v }))}
          onDataFimChange={(v) => setFilters((p) => ({ ...p, dataFim: v }))}
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
            <SalesKPICards metrics={metrics} isLoading={loading} usarVendasSemCreditos={usarVendasSemCreditos} />

            {/* Gráfico e Tabela - Condicional por modo */}
            {filters.viewMode === "loja" ? (
              <>
                <StoreChart dados={dadosPorLoja} isLoading={loading} usarVendasSemCreditos={usarVendasSemCreditos} />
                <StoreTable dados={dadosPorLoja} isLoading={loading} usarVendasSemCreditos={usarVendasSemCreditos} />
              </>
            ) : (
              <>
                <div className="grid gap-6 lg:grid-cols-2">
                  <SellerChart dados={dados} isLoading={loading} usarVendasSemCreditos={usarVendasSemCreditos} />
                  <DescontoChart dados={dados} isLoading={loading} />
                </div>
                <SalesTable dados={dados} isLoading={loading} limiteDesconto={15} usarVendasSemCreditos={usarVendasSemCreditos} />
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
              <PaymentMethodsChart dados={dadosFormasPagamento} isLoading={loadingFormas} />
              <PaymentMethodsTable dados={dadosFormasPagamento} isLoading={loadingFormas} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
