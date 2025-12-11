// src/components/financeiro-dashboard/FinanceiroKPICards.tsx

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FinanceiroMetrics } from "../../hooks/useFinanceiroParcelas";
import { TrendingUp, TrendingDown, AlertTriangle, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export type KPIFilterType = 
  | "TODOS"
  | "RECEBER_ABERTO"
  | "RECEBER_ATRASO"
  | "PAGAR_ABERTO"
  | "PAGAR_ATRASO";

interface FinanceiroKPICardsProps {
  metrics: FinanceiroMetrics;
  activeFilter?: KPIFilterType;
  onFilterChange?: (filter: KPIFilterType) => void;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function FinanceiroKPICards({ 
  metrics, 
  activeFilter = "TODOS",
  onFilterChange 
}: FinanceiroKPICardsProps) {
  const handleClick = (filter: KPIFilterType) => {
    if (onFilterChange) {
      // Toggle: se já está ativo, volta para TODOS
      onFilterChange(activeFilter === filter ? "TODOS" : filter);
    }
  };

  const isClickable = !!onFilterChange;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* A Receber em Aberto */}
      <Card 
        className={cn(
          isClickable && "cursor-pointer transition-all hover:shadow-md",
          activeFilter === "RECEBER_ABERTO" && "ring-2 ring-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20"
        )}
        onClick={() => handleClick("RECEBER_ABERTO")}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">A Receber (Aberto)</CardTitle>
          <TrendingUp className="h-4 w-4 text-emerald-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-emerald-600">
            {formatCurrency(metrics.totalReceberAberto)}
          </div>
          <p className="text-xs text-muted-foreground">
            {metrics.qtdParcelasReceber} parcelas a receber
          </p>
        </CardContent>
      </Card>

      {/* A Receber em Atraso */}
      <Card 
        className={cn(
          "border-amber-200 bg-amber-50/50 dark:bg-amber-950/20",
          isClickable && "cursor-pointer transition-all hover:shadow-md",
          activeFilter === "RECEBER_ATRASO" && "ring-2 ring-amber-500"
        )}
        onClick={() => handleClick("RECEBER_ATRASO")}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">A Receber (Atraso)</CardTitle>
          <AlertTriangle className="h-4 w-4 text-amber-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-amber-600">
            {formatCurrency(metrics.totalReceberAtraso)}
          </div>
          <p className="text-xs text-muted-foreground">
            {metrics.qtdReceberAtraso || 0} parcelas vencidas
          </p>
        </CardContent>
      </Card>

      {/* A Pagar em Aberto */}
      <Card 
        className={cn(
          isClickable && "cursor-pointer transition-all hover:shadow-md",
          activeFilter === "PAGAR_ABERTO" && "ring-2 ring-blue-500 bg-blue-50/50 dark:bg-blue-950/20"
        )}
        onClick={() => handleClick("PAGAR_ABERTO")}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">A Pagar (Aberto)</CardTitle>
          <TrendingDown className="h-4 w-4 text-blue-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-blue-600">
            {formatCurrency(metrics.totalPagarAberto)}
          </div>
          <p className="text-xs text-muted-foreground">
            {metrics.qtdParcelasPagar} parcelas a pagar
          </p>
        </CardContent>
      </Card>

      {/* A Pagar em Atraso */}
      <Card 
        className={cn(
          "border-destructive/50 bg-destructive/5",
          isClickable && "cursor-pointer transition-all hover:shadow-md",
          activeFilter === "PAGAR_ATRASO" && "ring-2 ring-destructive"
        )}
        onClick={() => handleClick("PAGAR_ATRASO")}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">A Pagar (Atraso)</CardTitle>
          <AlertTriangle className="h-4 w-4 text-destructive" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-destructive">
            {formatCurrency(metrics.totalPagarAtraso)}
          </div>
          <p className="text-xs text-muted-foreground">
            {metrics.qtdPagarAtraso || 0} parcelas em atraso
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
