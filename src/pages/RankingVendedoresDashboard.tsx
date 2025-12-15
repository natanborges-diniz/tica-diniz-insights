import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users } from "lucide-react";
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container flex h-16 items-center gap-4 px-4">
          <Link to="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-semibold">Ranking de Vendedores</h1>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container px-4 py-6 space-y-6">
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
      </main>
    </div>
  );
}
