import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, ShoppingCart, Ticket, RotateCcw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ResumoEmpresaVendedor } from '@/services/firebirdBridge';

interface SalesKPICardsProps {
  dados: ResumoEmpresaVendedor[];
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

export function SalesKPICards({ dados, isLoading }: SalesKPICardsProps) {
  // Calcular KPIs agregados
  const faturamentoTotal = dados.reduce((acc, item) => acc + (item.TOTALVENDIDO || 0), 0);
  const quantidadeVendas = dados.reduce((acc, item) => acc + (item.QTDTRANSACAO || 0), 0);
  const totalDevolucoes = dados.reduce((acc, item) => acc + (item.TOTALDEVOLUCAO || 0), 0);
  const qtdDevolucoes = dados.reduce((acc, item) => acc + (item.QTDDEVOLUCAO || 0), 0);
  
  // Ticket médio ponderado: total vendido / quantidade de transações
  const ticketMedio = quantidadeVendas > 0 ? faturamentoTotal / quantidadeVendas : 0;

  const cards = [
    {
      title: 'Faturamento Total',
      value: formatCurrency(faturamentoTotal),
      icon: DollarSign,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
    },
    {
      title: 'Ticket Médio',
      value: formatCurrency(ticketMedio),
      icon: Ticket,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Quantidade de Vendas',
      value: formatNumber(quantidadeVendas),
      icon: ShoppingCart,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      title: 'Devoluções',
      value: `${formatCurrency(totalDevolucoes)} (${formatNumber(qtdDevolucoes)})`,
      icon: RotateCcw,
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
