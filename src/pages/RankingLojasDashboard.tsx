import { Store } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useRankingLojas } from "@/hooks/useRankingLojas";
import { RankingFilters } from "@/components/ranking/RankingFilters";
import { RankingKPICards } from "@/components/ranking/RankingKPICards";
import { RankingLojasTable } from "@/components/ranking/RankingLojasTable";
import { DiretrizesIA } from "@/components/ranking/DiretrizesIA";

export default function RankingLojasDashboard() {
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
  } = useRankingLojas();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Store className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Ranking de Lojas</h1>
          <p className="text-sm text-muted-foreground">Análise comparativa de desempenho por loja</p>
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
      />

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* KPIs */}
      {dataLoaded && (
        <RankingKPICards totais={totais} tipo="loja" />
      )}

      {/* Table */}
      {dataLoaded && (
        <RankingLojasTable ranking={ranking} />
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
          <Store className="h-16 w-16 mx-auto mb-4 opacity-50" />
          <p className="text-lg">Selecione o período e clique em "Carregar Dados"</p>
          <p className="text-sm mt-2">O ranking será gerado com base nas vendas do período selecionado</p>
        </div>
      )}
    </div>
  );
}
