// src/pages/FinanceiroDashboard.tsx

import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Wallet, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFinanceiroParcelas } from "../hooks/useFinanceiroParcelas";
import { FinanceiroFilters } from "../components/financeiro-dashboard/FinanceiroFilters";
import { FinanceiroKPICards } from "../components/financeiro-dashboard/FinanceiroKPICards";
import { FinanceiroVencimentoChart } from "../components/financeiro-dashboard/FinanceiroVencimentoChart";
import { FinanceiroParcelasTable } from "../components/financeiro-dashboard/FinanceiroParcelasTable";

export default function FinanceiroDashboard() {
  const {
    filters,
    setFilters,
    filteredData,
    metrics,
    loading,
    error,
    reload,
  } = useFinanceiroParcelas();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
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
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Filtros */}
        <FinanceiroFilters
          filters={filters}
          onChange={(newFilters) => setFilters((prev) => ({ ...prev, ...newFilters }))}
        />

        {/* Error State */}
        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
            {error}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Carregando parcelas...</span>
          </div>
        )}

        {/* Content */}
        {!loading && !error && (
          <>
            {/* KPIs */}
            <FinanceiroKPICards metrics={metrics} />

            {/* Gráfico */}
            <FinanceiroVencimentoChart data={filteredData} />

            {/* Tabela */}
            <FinanceiroParcelasTable data={filteredData} />
          </>
        )}
      </main>
    </div>
  );
}
