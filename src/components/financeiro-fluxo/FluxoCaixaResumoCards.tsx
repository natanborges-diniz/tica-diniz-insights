// src/components/financeiro-fluxo/FluxoCaixaResumoCards.tsx

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Wallet, BarChart3 } from "lucide-react";
import { FluxoCaixaResumo } from "@/hooks/useFluxoCaixa";
import { FluxoCaixaItem } from "@/hooks/useFluxoCaixa";

interface Props {
  resumo: FluxoCaixaResumo;
  fluxoAgrupado: FluxoCaixaItem[];
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function FluxoCaixaResumoCards({ resumo, fluxoAgrupado }: Props) {
  const saldoAcumuladoFinal = fluxoAgrupado.length > 0 
    ? fluxoAgrupado[fluxoAgrupado.length - 1].saldoAcumulado 
    : 0;

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total a Receber</CardTitle>
          <TrendingUp className="h-4 w-4 text-green-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">
            {formatCurrency(resumo.totalReceber)}
          </div>
          <p className="text-xs text-muted-foreground">
            {resumo.qtdReceber} parcelas
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total a Pagar</CardTitle>
          <TrendingDown className="h-4 w-4 text-red-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-600">
            {formatCurrency(resumo.totalPagar)}
          </div>
          <p className="text-xs text-muted-foreground">
            {resumo.qtdPagar} parcelas
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Saldo do Período</CardTitle>
          <Wallet className={`h-4 w-4 ${resumo.saldoPeriodo >= 0 ? "text-green-500" : "text-red-500"}`} />
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${resumo.saldoPeriodo >= 0 ? "text-green-600" : "text-red-600"}`}>
            {formatCurrency(resumo.saldoPeriodo)}
          </div>
          <p className="text-xs text-muted-foreground">
            Receber - Pagar
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Saldo Acumulado</CardTitle>
          <BarChart3 className={`h-4 w-4 ${saldoAcumuladoFinal >= 0 ? "text-green-500" : "text-red-500"}`} />
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${saldoAcumuladoFinal >= 0 ? "text-green-600" : "text-red-600"}`}>
            {formatCurrency(saldoAcumuladoFinal)}
          </div>
          <p className="text-xs text-muted-foreground">
            Final do período
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
