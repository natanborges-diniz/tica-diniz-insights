// src/components/financeiro-dashboard/FinanceiroKPICards.tsx

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FinanceiroMetrics } from "../../hooks/useFinanceiroParcelas";
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle } from "lucide-react";

interface FinanceiroKPICardsProps {
  metrics: FinanceiroMetrics;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function FinanceiroKPICards({ metrics }: FinanceiroKPICardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* A Receber em Aberto */}
      <Card>
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
      <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">A Receber (Atraso)</CardTitle>
          <AlertTriangle className="h-4 w-4 text-amber-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-amber-600">
            {formatCurrency(metrics.totalReceberAtraso)}
          </div>
          <p className="text-xs text-muted-foreground">
            Valores vencidos não recebidos
          </p>
        </CardContent>
      </Card>

      {/* A Pagar em Aberto */}
      <Card>
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
      <Card className="border-destructive/50 bg-destructive/5">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">A Pagar (Atraso)</CardTitle>
          <AlertTriangle className="h-4 w-4 text-destructive" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-destructive">
            {formatCurrency(metrics.totalPagarAtraso)}
          </div>
          <p className="text-xs text-muted-foreground">
            {metrics.qtdParcelasAtraso} parcelas em atraso total
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
