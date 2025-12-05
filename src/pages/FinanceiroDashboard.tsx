import { Link } from "react-router-dom";
import { ArrowLeft, Wallet, RefreshCw, AlertCircle } from "lucide-react";
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
            <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
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
