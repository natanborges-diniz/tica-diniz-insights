// src/components/stock-dashboard/StockDashboardLayout.tsx

import { useMemo } from "react";
import { Package, RefreshCw, AlertCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { AnaliseEstoqueAcao } from "@/services/estoqueService";
import { Empresa } from "@/services/empresaService";
import { StockFiltersState } from "@/hooks/useEstoqueDashboard";
import { useChartFilter, ChartFilter } from "@/hooks/useChartFilter";
import { ActiveFilterBadges } from "@/components/ui/active-filter-badges";
import { StockFilters } from "./StockFilters";
import { StockKPICards } from "./StockKPICards";
import { StockActionChart } from "./StockActionChart";
import { StockTable } from "./StockTable";

interface StockDashboardLayoutProps {
  // Empresas
  empresas: Empresa[];
  loadingEmpresas: boolean;
  errorEmpresas: string | null;
  // Dados
  dados: AnaliseEstoqueAcao[];
  filteredData: AnaliseEstoqueAcao[];
  loading: boolean;
  error: string | null;
  // Filtros
  filters: StockFiltersState;
  setFilters: React.Dispatch<React.SetStateAction<StockFiltersState>>;
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
  acao: "Ação",
  fornecedor: "Fornecedor",
  marca: "Marca",
};

export function StockDashboardLayout({
  empresas,
  loadingEmpresas,
  errorEmpresas,
  dados,
  filteredData,
  loading,
  error,
  filters,
  setFilters,
  reload,
}: StockDashboardLayoutProps) {
  // Hook para filtros interativos dos gráficos
  const chartFilter = useChartFilter<string>({
    onChange: (newFilters) => {
      // Sincroniza filtros do gráfico com filtros globais
      const acaoFilter = newFilters.find(f => f.field === 'acao');
      setFilters(prev => ({
        ...prev,
        acao: acaoFilter?.value || 'TODAS',
      }));
    },
  });

  // Dados filtrados considerando filtros do gráfico
  const chartFilteredData = useMemo(() => {
    let result = filteredData;
    
    // Aplica filtro de ação do gráfico
    const acaoValue = chartFilter.getFilterValue('acao');
    if (acaoValue) {
      result = result.filter(item => (item.acaoSugerida || 'SEM AÇÃO') === acaoValue);
    }
    
    return result;
  }, [filteredData, chartFilter]);

  const handleEmpresaChange = (value: string) => {
    chartFilter.clearAllFilters();
    setFilters((prev) => ({
      ...prev,
      empresa: Number(value),
      fornecedor: "TODOS",
      marca: "TODAS",
      acao: "TODAS",
      busca: "",
    }));
  };

  const handleChartAcaoClick = (acao: string) => {
    chartFilter.toggleFilter('acao', acao, acao);
  };

  const handleRemoveFilter = (field: string, value: string) => {
    chartFilter.toggleFilter(field, value);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Package className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Painel de Estoque / OTB</h1>
            <p className="text-sm text-muted-foreground">Análise de estoque por loja</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Loading Empresas */}
      {loadingEmpresas && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Carregando empresas...</p>
          </div>
        </div>
      )}

      {/* Erro Empresas */}
      {errorEmpresas && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Erro ao carregar empresas: {errorEmpresas}</AlertDescription>
        </Alert>
      )}

      {/* Conteúdo quando empresas carregadas */}
      {!loadingEmpresas && !errorEmpresas && empresas.length > 0 && (
        <>
          {/* Seletor de Empresa */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Selecione a Loja</CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={filters.empresa !== null ? String(filters.empresa) : ""}
                onValueChange={handleEmpresaChange}
              >
                <SelectTrigger className="w-full max-w-xs">
                  <SelectValue placeholder="Selecione uma empresa" />
                </SelectTrigger>
                <SelectContent>
                  {empresas.map((emp) => (
                    <SelectItem key={emp.codEmpresa} value={emp.codEmpresa.toString()}>
                      {emp.codEmpresa} - {emp.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Erro Dados */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Estado vazio - empresa não selecionada */}
          {filters.empresa === null && !loading && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Info className="h-12 w-12 text-muted-foreground mb-4" />
                <CardTitle className="text-lg mb-2">Selecione uma empresa</CardTitle>
                <p className="text-sm text-muted-foreground text-center max-w-md">
                  Escolha uma empresa no seletor acima para visualizar a análise de estoque.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Loading ou Dados */}
          {loading ? (
            <LoadingSkeleton />
          ) : filters.empresa !== null && (
            <>
              {/* Filtros */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Filtros</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <StockFilters
                    dados={dados}
                    fornecedorSelecionado={filters.fornecedor}
                    setFornecedorSelecionado={(v) => setFilters((p) => ({ ...p, fornecedor: v }))}
                    marcaSelecionada={filters.marca}
                    setMarcaSelecionada={(v) => setFilters((p) => ({ ...p, marca: v }))}
                    acaoSelecionada={filters.acao}
                    setAcaoSelecionada={(v) => {
                      chartFilter.clearFilter('acao');
                      setFilters((p) => ({ ...p, acao: v }));
                    }}
                    buscaTexto={filters.busca}
                    setBuscaTexto={(v) => setFilters((p) => ({ ...p, busca: v }))}
                  />
                  
                  {/* Badges de filtros ativos do gráfico */}
                  <ActiveFilterBadges
                    filters={chartFilter.activeFilters}
                    onRemove={handleRemoveFilter}
                    onClearAll={chartFilter.clearAllFilters}
                    fieldLabels={FILTER_LABELS}
                  />
                </CardContent>
              </Card>

              <StockKPICards dados={chartFilteredData} />
              <StockActionChart 
                dados={filteredData}
                selectedAcao={chartFilter.getFilterValue('acao')}
                onAcaoClick={handleChartAcaoClick}
              />

              <Card>
                <CardHeader>
                  <CardTitle>Detalhamento do Estoque</CardTitle>
                </CardHeader>
                <CardContent>
                  <StockTable dados={chartFilteredData} />
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}

      {/* Sem empresas */}
      {!loadingEmpresas && !errorEmpresas && empresas.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-center">Nenhuma empresa encontrada</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
