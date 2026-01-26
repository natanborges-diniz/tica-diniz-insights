// src/components/otb/OtbKPICards.tsx
// Cards de KPIs para módulo OTB

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  ShoppingCart, 
  Package, 
  AlertTriangle, 
  TrendingUp,
  DollarSign,
  BarChart3
} from "lucide-react";
import type { OtbMetrics } from "@/hooks/useOtb";

interface OtbKPICardsProps {
  metrics: OtbMetrics;
  coberturaDias: number;
}

export function OtbKPICards({ metrics, coberturaDias }: OtbKPICardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {/* Total SKUs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">SKUs Analisados</CardTitle>
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{metrics.totalSkus.toLocaleString('pt-BR')}</div>
          <p className="text-xs text-muted-foreground">
            Base: {metrics.diasPeriodo} dias
          </p>
        </CardContent>
      </Card>

      {/* OTB Total (Unidades) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">OTB Total</CardTitle>
          <ShoppingCart className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-primary">
            {metrics.totalOtb.toLocaleString('pt-BR')}
          </div>
          <p className="text-xs text-muted-foreground">
            unidades p/ {coberturaDias} dias
          </p>
        </CardContent>
      </Card>

      {/* OTB Valor */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Investimento OTB</CardTitle>
          <DollarSign className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-primary">
            R$ {(metrics.totalOtbValor / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}k
          </div>
          <p className="text-xs text-muted-foreground">
            a preço de custo
          </p>
        </CardContent>
      </Card>

      {/* Comprar Urgente */}
      <Card className="border-destructive/50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Compra Urgente</CardTitle>
          <AlertTriangle className="h-4 w-4 text-destructive" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-destructive">
            {metrics.skusComprarUrgente}
          </div>
          <p className="text-xs text-muted-foreground">
            estoque &lt; 15 dias
          </p>
        </CardContent>
      </Card>

      {/* Comprar */}
      <Card className="border-orange-500/50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Comprar</CardTitle>
          <ShoppingCart className="h-4 w-4 text-orange-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-orange-600">
            {metrics.skusComprar}
          </div>
          <p className="text-xs text-muted-foreground">
            OTB &gt; 0
          </p>
        </CardContent>
      </Card>

      {/* Estoque OK / Excesso */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Estoque OK</CardTitle>
          <Package className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {metrics.skusEstoqueOk}
          </div>
          <p className="text-xs text-muted-foreground">
            +{metrics.skusExcesso} em excesso
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
