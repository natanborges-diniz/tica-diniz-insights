import { Link } from "react-router-dom";
import { ArrowLeft, Wallet, RefreshCw, AlertCircle, Calendar, FileText, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { useFinanceiroParcelas } from "@/hooks/useFinanceiroParcelas";
import { FinanceiroFilters } from "@/components/financeiro-dashboard/FinanceiroFilters";
import { FinanceiroKPICards } from "@/components/financeiro-dashboard/FinanceiroKPICards";
import { FinanceiroVencimentoChart } from "@/components/financeiro-dashboard/FinanceiroVencimentoChart";
import { FinanceiroParcelasTable } from "@/components/financeiro-dashboard/FinanceiroParcelasTable";

export default function FinanceiroDashboard() {
  const {
    filters,
    setFilters,
    data,
    metrics,
    loading,
    error,
    reload,
  } = useFinanceiroParcelas();

  // Funções de atalho para filtros rápidos
  const hoje = new Date().toISOString().split("T")[0];
  const primeiroDiaMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
  const ultimoDiaMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split("T")[0];

  const handleHojeVencimento = () => {
    setFilters((prev) => ({
      ...prev,
      campoData: "VENCIMENTO",
      dataIni: hoje,
      dataFim: hoje,
    }));
  };

  const handleHojePagamento = () => {
    setFilters((prev) => ({
      ...prev,
      campoData: "PAGAMENTO",
      situacao: "PAGA",
      dataIni: hoje,
      dataFim: hoje,
    }));
  };

  const handleMesAtualCompetencia = () => {
    setFilters((prev) => ({
      ...prev,
      campoData: "EMISSAO",
      dataIni: primeiroDiaMes,
      dataFim: ultimoDiaMes,
    }));
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <Wallet className="h-6 w-6 text-primary" />
                <h1 className="text-xl font-bold">Financeiro – Contas a Pagar / Receber</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/financeiro/dre">
                <Button variant="outline" size="sm">
                  <FileText className="h-4 w-4 mr-2" />
                  DRE
                </Button>
              </Link>
              <Link to="/financeiro/fluxo-caixa">
                <Button variant="outline" size="sm">
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Fluxo de Caixa
                </Button>
              </Link>
              <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
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

        <FinanceiroKPICards metrics={metrics} />

        <FinanceiroVencimentoChart data={data} />

        <FinanceiroParcelasTable data={data} />
      </main>
    </div>
  );
}
