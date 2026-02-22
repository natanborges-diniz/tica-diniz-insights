// src/pages/FluxoCaixaDashboard.tsx


import { TrendingUp, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ModuleHeader } from "@/components/system/ModuleHeader";

import { useFluxoCaixa } from "@/hooks/useFluxoCaixa";
import { FluxoCaixaFilters } from "@/components/financeiro-fluxo/FluxoCaixaFilters";
import { FluxoCaixaResumoCards } from "@/components/financeiro-fluxo/FluxoCaixaResumoCards";
import { FluxoCaixaChart } from "@/components/financeiro-fluxo/FluxoCaixaChart";

export default function FluxoCaixaDashboard() {
  const {
    filters,
    setFilters,
    fluxoAgrupado,
    resumo,
    loading,
    error,
    reload,
  } = useFluxoCaixa();

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Fluxo de Caixa"
        icon={<TrendingUp className="h-6 w-6 text-primary" />}
        actions={
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        }
      />

      <FluxoCaixaFilters
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

        <FluxoCaixaResumoCards resumo={resumo} fluxoAgrupado={fluxoAgrupado} />
        <FluxoCaixaChart data={fluxoAgrupado} />
    </div>
  );
}
