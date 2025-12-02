import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, ShoppingCart, Ticket, Store } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface KPICardsProps {
  faturamentoTotal: number;
  quantidadeVendas: number;
  ticketMedio: number;
  lojasAtivas: number;
  isLoading?: boolean;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value);
}

export function KPICards({ 
  faturamentoTotal, 
  quantidadeVendas, 
  ticketMedio, 
  lojasAtivas,
  isLoading 
}: KPICardsProps) {
  const cards = [
    {
      title: 'Faturamento Total',
      value: formatCurrency(faturamentoTotal),
      icon: DollarSign,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
    },
    {
      title: 'Quantidade de Vendas',
      value: formatNumber(quantidadeVendas),
      icon: ShoppingCart,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Ticket Médio',
      value: formatCurrency(ticketMedio),
      icon: Ticket,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      title: 'Lojas Ativas',
      value: formatNumber(lojasAtivas),
      icon: Store,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title} className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
            <div className={`p-2 rounded-lg ${card.bgColor}`}>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <p className="text-2xl font-bold">{card.value}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
