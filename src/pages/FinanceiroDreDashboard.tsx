// src/pages/FinanceiroDreDashboard.tsx


import { FileText, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ModuleHeader } from "@/components/system/ModuleHeader";

import { useFinanceiroDre } from "@/hooks/useFinanceiroDre";
import { DreFilters } from "@/components/financeiro-dre/DreFilters";
import { DreResumoCards } from "@/components/financeiro-dre/DreResumoCards";
import { DreCompetenciaChart } from "@/components/financeiro-dre/DreCompetenciaChart";
import { DreTable } from "@/components/financeiro-dre/DreTable";

export default function FinanceiroDreDashboard() {
  const {
    filters,
    setFilters,
    data,
    resumo,
    resumoRealizado,
    dadosPorCompetencia,
    loading,
    error,
    reload,
  } = useFinanceiroDre();

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="DRE Gerencial"
        icon={<FileText className="h-6 w-6 text-primary" />}
        actions={
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        }
      />

      <DreFilters
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

        <DreResumoCards resumo={resumo} />
        <DreCompetenciaChart data={dadosPorCompetencia} />
        <DreTable data={data} />
    </div>
  );
}
