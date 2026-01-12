import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  DollarSign, 
  TrendingDown, 
  Percent, 
  ShoppingCart, 
  Receipt, 
  CreditCard,
  BadgeCheck,
  RotateCcw,
  AlertCircle
} from 'lucide-react';
import { VendasMetrics } from '@/hooks/useVendasDashboard';

interface SalesKPICardsProps {
  metrics: VendasMetrics;
  isLoading?: boolean;
  loadingDesconto?: boolean;
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

export function SalesKPICards({ 
  metrics, 
  isLoading, 
  loadingDesconto,
  usarVendasSemCreditos = true 
}: SalesKPICardsProps) {
  const kpiPrincipal = usarVendasSemCreditos 
    ? metrics.totalVendidoSemCreditos 
    : metrics.totalVendido;

  // Cards sempre visíveis (dados do endpoint rápido)
  const cardsVendas = [
    {
      title: usarVendasSemCreditos ? 'Vendas Válidas' : 'Total Vendido',
      value: formatCurrency(kpiPrincipal),
      icon: BadgeCheck,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50 dark:bg-emerald-950/20',
      highlight: true,
    },
    {
      title: 'Créditos Utilizados',
      value: formatCurrency(metrics.totalCreditos),
      icon: CreditCard,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50 dark:bg-purple-950/20',
    },
    {
      title: 'Devoluções',
      value: formatCurrency(metrics.totalDevolucoes),
      subtitle: '(apenas indicador)',
      icon: RotateCcw,
      color: 'text-rose-600',
      bgColor: 'bg-rose-50 dark:bg-rose-950/20',
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

  // Cards de desconto (podem estar carregando ou indisponíveis)
  const cardsDesconto = [
    {
      title: 'Total Bruto',
      value: metrics.descontoDisponivel ? formatCurrency(metrics.totalBruto) : '—',
      icon: DollarSign,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50 dark:bg-blue-950/20',
      loading: loadingDesconto,
      indisponivel: !metrics.descontoDisponivel && !loadingDesconto,
    },
    {
      title: 'Total Desconto',
      value: metrics.descontoDisponivel ? formatCurrency(metrics.totalDesconto) : '—',
      icon: TrendingDown,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50 dark:bg-amber-950/20',
      loading: loadingDesconto,
      indisponivel: !metrics.descontoDisponivel && !loadingDesconto,
    },
    {
      title: '% Desconto',
      value: metrics.descontoDisponivel ? formatPercent(metrics.percentualDesconto) : '—',
      icon: Percent,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50 dark:bg-orange-950/20',
      loading: loadingDesconto,
      indisponivel: !metrics.descontoDisponivel && !loadingDesconto,
    },
  ];

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {[...cardsVendas, ...cardsDesconto].map((_, i) => (
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
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
      {/* Cards de vendas */}
      {cardsVendas.map((card, i) => (
        <Card key={i} className={card.highlight ? 'ring-2 ring-emerald-500 ring-offset-2' : ''}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
            <div className={`p-2 rounded-full ${card.bgColor}`}>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className={`text-xl font-bold ${card.highlight ? 'text-emerald-600' : ''}`}>
              {card.value}
            </div>
            {card.subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{card.subtitle}</p>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Cards de desconto */}
      {cardsDesconto.map((card, i) => (
        <Card key={`desc-${i}`} className={card.indisponivel ? 'opacity-60' : ''}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
            <div className={`p-2 rounded-full ${card.bgColor}`}>
              {card.indisponivel ? (
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
              ) : (
                <card.icon className={`h-4 w-4 ${card.color}`} />
              )}
            </div>
          </CardHeader>
          <CardContent>
            {card.loading ? (
              <Skeleton className="h-7 w-24" />
            ) : (
              <div className="text-xl font-bold">{card.value}</div>
            )}
            {card.indisponivel && (
              <p className="text-xs text-muted-foreground mt-1">Filtre por loja</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
