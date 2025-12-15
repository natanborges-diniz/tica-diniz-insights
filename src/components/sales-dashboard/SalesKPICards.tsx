import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, Percent, ShoppingCart, RotateCcw, TrendingDown, Calculator } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { VendasMetrics } from '@/hooks/useVendasDashboard';

interface SalesKPICardsProps {
  metrics: VendasMetrics;
  isLoading?: boolean;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function SalesKPICards({ metrics, isLoading }: SalesKPICardsProps) {
  const cards = [
    {
      title: 'Total Bruto',
      value: formatCurrency(metrics.totalBruto),
      icon: DollarSign,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Total Desconto',
      value: formatCurrency(metrics.totalDesconto),
      icon: TrendingDown,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
    },
    {
      title: '% Desconto',
      value: formatPercent(metrics.percentualDesconto),
      icon: Percent,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
    },
    {
      title: 'Total Vendido (Líquido)',
      value: formatCurrency(metrics.totalVendido),
      icon: ShoppingCart,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
    },
    {
      title: 'Total Devolução',
      value: formatCurrency(metrics.totalDevolucao),
      icon: RotateCcw,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
    },
    {
      title: 'Líquido sem Devoluções',
      value: formatCurrency(metrics.totalLiquidoSemDevolucoes),
      icon: Calculator,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <Card key={card.title} className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
            <div className={`p-2 rounded-lg ${card.bgColor}`}>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-7 w-24" />
            ) : (
              <p className="text-xl font-bold">{card.value}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
