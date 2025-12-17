import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  DollarSign, 
  TrendingDown, 
  Percent, 
  ShoppingCart, 
  Receipt, 
  CreditCard,
  BadgeCheck
} from 'lucide-react';
import { VendasMetrics } from '@/hooks/useVendasDashboard';

interface SalesKPICardsProps {
  metrics: VendasMetrics;
  isLoading?: boolean;
  usarVendasSemCreditos?: boolean;
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

function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value);
}

export function SalesKPICards({ metrics, isLoading, usarVendasSemCreditos = true }: SalesKPICardsProps) {
  const kpiPrincipal = usarVendasSemCreditos 
    ? metrics.totalVendidoSemCreditos 
    : metrics.totalVendido;
  
  const cards = [
    {
      title: usarVendasSemCreditos ? 'Vendas Válidas' : 'Total Vendido',
      value: formatCurrency(kpiPrincipal),
      icon: BadgeCheck,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50 dark:bg-emerald-950/20',
      highlight: true,
    },
    {
      title: 'Total Bruto',
      value: formatCurrency(metrics.totalBruto),
      icon: DollarSign,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50 dark:bg-blue-950/20',
    },
    {
      title: 'Total Desconto',
      value: formatCurrency(metrics.totalDesconto),
      icon: TrendingDown,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50 dark:bg-amber-950/20',
    },
    {
      title: '% Desconto',
      value: formatPercent(metrics.percentualDesconto),
      icon: Percent,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50 dark:bg-orange-950/20',
    },
    {
      title: 'Créditos Utilizados',
      value: formatCurrency(metrics.totalCreditos),
      icon: CreditCard,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50 dark:bg-purple-950/20',
    },
    {
      title: 'Qtd. Transações',
      value: formatNumber(metrics.qtdTransacoes),
      icon: ShoppingCart,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50 dark:bg-indigo-950/20',
    },
    {
      title: 'Ticket Médio',
      value: formatCurrency(metrics.ticketMedio),
      icon: Receipt,
      color: 'text-cyan-600',
      bgColor: 'bg-cyan-50 dark:bg-cyan-950/20',
    },
  ];

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {cards.map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      {cards.map((card, i) => (
        <Card key={i} className={card.highlight ? 'ring-2 ring-emerald-500 ring-offset-2' : ''}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
            <div className={`p-2 rounded-full ${card.bgColor}`}>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className={`text-xl font-bold ${card.highlight ? 'text-emerald-600' : ''}`}>{card.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
