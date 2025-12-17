import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, Percent, ShoppingCart, RotateCcw, TrendingDown, Receipt, Hash, Ticket, CreditCard, Banknote } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
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
  // Valor principal de faturamento baseado no toggle
  const valorFaturamentoPrincipal = usarVendasSemCreditos 
    ? metrics.totalVendidoSemCreditos 
    : metrics.totalVendido;

  const cards = [
    {
      title: 'Faturamento Bruto',
      value: formatCurrency(metrics.totalBruto),
      icon: DollarSign,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Total Desconto',
      value: formatCurrency(metrics.totalDesconto),
      subtitle: formatPercent(metrics.percentualDesconto),
      icon: TrendingDown,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
    },
    {
      title: 'Faturamento Líquido',
      value: formatCurrency(metrics.totalVendido),
      icon: ShoppingCart,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
    },
    {
      title: 'Créditos Utilizados',
      value: formatCurrency(metrics.totalCreditos),
      icon: CreditCard,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
    },
    {
      title: usarVendasSemCreditos ? 'Vendas Válidas (Sem Créditos)' : 'Vendas Totais',
      value: formatCurrency(valorFaturamentoPrincipal),
      icon: Banknote,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      highlight: true,
    },
    {
      title: 'Total Devolução',
      value: formatCurrency(metrics.totalDevolucao),
      subtitle: formatPercent(metrics.percentualDevolucao),
      icon: RotateCcw,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
    },
    {
      title: 'Faturamento Real',
      value: formatCurrency(metrics.totalLiquidoComDevolucoes),
      icon: Receipt,
      color: 'text-teal-600',
      bgColor: 'bg-teal-50',
    },
    {
      title: 'Qtd. Transações',
      value: formatNumber(metrics.qtdTransacoes),
      icon: Hash,
      color: 'text-cyan-600',
      bgColor: 'bg-cyan-50',
    },
    {
      title: 'Ticket Médio',
      value: formatCurrency(metrics.ticketMedioLiquido),
      icon: Ticket,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {cards.map((card) => (
        <Card key={card.title} className={`overflow-hidden ${card.highlight ? 'ring-2 ring-purple-500' : ''}`}>
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
              <>
                <p className={`text-xl font-bold ${card.highlight ? 'text-purple-700' : ''}`}>{card.value}</p>
                {card.subtitle && (
                  <p className="text-xs text-muted-foreground">{card.subtitle}</p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
