// src/components/financeiro-dashboard/FinanceiroKPICards.tsx

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FinanceiroMetrics } from "../../hooks/useFinanceiroParcelas";
import { TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
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
          activeFilter === "RECEBER_ABERTO" && "ring-2 ring-success bg-success-soft"
        )}
        onClick={() => handleClick("RECEBER_ABERTO")}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">A Receber (Aberto)</CardTitle>
          <TrendingUp className="h-4 w-4 text-success" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-success">
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
          "border-warning-muted bg-warning-soft",
          isClickable && "cursor-pointer transition-all hover:shadow-md",
          activeFilter === "RECEBER_ATRASO" && "ring-2 ring-warning"
        )}
        onClick={() => handleClick("RECEBER_ATRASO")}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">A Receber (Atraso)</CardTitle>
          <AlertTriangle className="h-4 w-4 text-warning" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-warning">
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
          activeFilter === "PAGAR_ABERTO" && "ring-2 ring-info bg-info-soft"
        )}
        onClick={() => handleClick("PAGAR_ABERTO")}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">A Pagar (Aberto)</CardTitle>
          <TrendingDown className="h-4 w-4 text-info" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-info">
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
          "border-danger-muted bg-danger-soft",
          isClickable && "cursor-pointer transition-all hover:shadow-md",
          activeFilter === "PAGAR_ATRASO" && "ring-2 ring-danger"
        )}
        onClick={() => handleClick("PAGAR_ATRASO")}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">A Pagar (Atraso)</CardTitle>
          <AlertTriangle className="h-4 w-4 text-danger" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-danger">
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
