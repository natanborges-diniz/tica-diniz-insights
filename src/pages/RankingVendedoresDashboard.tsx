import { Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useRankingVendedores } from "@/hooks/useRankingVendedores";
import { RankingFilters } from "@/components/ranking/RankingFilters";
import { RankingKPICards } from "@/components/ranking/RankingKPICards";
import { RankingVendedoresTable } from "@/components/ranking/RankingVendedoresTable";
import { DiretrizesIA } from "@/components/ranking/DiretrizesIA";

export default function RankingVendedoresDashboard() {
  const {
    filters,
    setFilters,
    ranking,
    totais,
    loading,
    error,
    dataLoaded,
    fetchData,
    diretrizes,
    loadingDiretrizes,
    errorDiretrizes,
    gerarAnaliseIA,
  } = useRankingVendedores();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Users className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Ranking de Vendedores</h1>
          <p className="text-sm text-muted-foreground">Análise comparativa de desempenho por vendedor</p>
        </div>
      </div>

      {/* Filters */}
      <RankingFilters
        dataInicio={filters.dataInicio}
        dataFim={filters.dataFim}
        onDataInicioChange={(v) => setFilters(f => ({ ...f, dataInicio: v }))}
        onDataFimChange={(v) => setFilters(f => ({ ...f, dataFim: v }))}
        onBuscar={fetchData}
        loading={loading}
        empresa={filters.empresa}
        onEmpresaChange={(v) => setFilters(f => ({ ...f, empresa: v }))}
        showEmpresaFilter
      />

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* KPIs */}
      {dataLoaded && (
        <RankingKPICards totais={totais} tipo="vendedor" />
      )}

      {/* Table */}
      {dataLoaded && (
        <RankingVendedoresTable ranking={ranking} />
      )}

      {/* AI Diretrizes */}
      {dataLoaded && (
        <DiretrizesIA
          diretrizes={diretrizes}
          loading={loadingDiretrizes}
          error={errorDiretrizes}
          onGerar={gerarAnaliseIA}
          disabled={ranking.length === 0}
        />
      )}

      {/* Empty state */}
      {!dataLoaded && !loading && (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="h-16 w-16 mx-auto mb-4 opacity-50" />
          <p className="text-lg">Selecione o período e clique em "Carregar Dados"</p>
          <p className="text-sm mt-2">O ranking será gerado com base nas vendas do período selecionado</p>
        </div>
      )}
    </div>
  );
}
