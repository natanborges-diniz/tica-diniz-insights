import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  DollarSign, 
  TrendingDown,
  TrendingUp,
  Percent, 
  ShoppingCart, 
  Receipt, 
  CreditCard,
  BadgeCheck,
  RotateCcw,
  AlertCircle,
  Download,
  Image,
  FileText,
  Loader2
} from 'lucide-react';
import { VendasMetrics, ProjecaoFechamento } from '@/hooks/useVendasDashboard';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRef, useState } from 'react';
import { exportToImage, exportVisualToPDF } from '@/utils/exportVisual';
import { toast } from 'sonner';

interface SalesKPICardsProps {
  metrics: VendasMetrics;
  projecao?: ProjecaoFechamento;
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

export function SalesKPICards({ 
  metrics, 
  projecao,
  isLoading, 
  usarVendasSemCreditos = true 
}: SalesKPICardsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const kpiPrincipal = usarVendasSemCreditos 
    ? metrics.totalVendidoSemCreditos 
    : metrics.totalVendido;

  const handleExportImage = async () => {
    if (!containerRef.current) return;
    setExporting(true);
    try {
      await exportToImage(containerRef.current, { 
        filename: `kpi_vendas_${new Date().toISOString().split('T')[0]}`, 
        title: 'Resumo de Vendas' 
      });
      toast.success('Imagem exportada com sucesso!');
    } catch (error) {
      toast.error('Erro ao exportar imagem');
    } finally {
      setExporting(false);
    }
  };

  const handleExportPDF = async () => {
    if (!containerRef.current) return;
    setExporting(true);
    try {
      await exportVisualToPDF(containerRef.current, { 
        filename: `kpi_vendas_${new Date().toISOString().split('T')[0]}`, 
        title: 'Resumo de Vendas' 
      });
      toast.success('PDF exportado com sucesso!');
    } catch (error) {
      toast.error('Erro ao exportar PDF');
    } finally {
      setExporting(false);
    }
  };

  // Cards sempre visíveis (dados do endpoint rápido)
  const cardsVendas = [
    {
      title: usarVendasSemCreditos ? 'Vendas Válidas' : 'Total Vendido',
      value: formatCurrency(kpiPrincipal),
      icon: BadgeCheck,
      iconClass: 'text-success',
      bgClass: 'bg-success-soft',
      highlight: true,
    },
    {
      title: 'Créditos Utilizados',
      value: formatCurrency(metrics.totalCreditos),
      icon: CreditCard,
      iconClass: 'text-chart-4',
      bgClass: 'bg-chart-4/10',
    },
    {
      title: 'Devoluções',
      value: formatCurrency(metrics.totalDevolucoes),
      subtitle: '(apenas indicador)',
      icon: RotateCcw,
      iconClass: 'text-danger',
      bgClass: 'bg-danger-soft',
    },
    {
      title: 'Qtd. Transações',
      value: formatNumber(metrics.qtdTransacoes),
      icon: ShoppingCart,
      iconClass: 'text-info',
      bgClass: 'bg-info-soft',
    },
    {
      title: 'Ticket Médio',
      value: formatCurrency(metrics.ticketMedio),
      icon: Receipt,
      iconClass: 'text-chart-6',
      bgClass: 'bg-chart-6/10',
    },
  ];

  // Card de projeção (somente se houver datas futuras no período)
  const cardProjecao = projecao?.temProjecao ? {
    title: 'Projeção Fechamento',
    value: formatCurrency(projecao.projecaoFechamento),
    subtitle: `${projecao.diasDecorridos}/${projecao.diasTotais} dias (${projecao.percentualPeriodo.toFixed(0)}%)`,
    icon: TrendingUp,
    iconClass: 'text-info',
    bgClass: 'bg-info-soft',
    isProjecao: true,
  } : null;

  // Cards de desconto
  const cardsDesconto = [
    {
      title: 'Total Desconto',
      value: metrics.descontoDisponivel ? formatCurrency(metrics.totalDesconto) : '—',
      icon: TrendingDown,
      iconClass: 'text-warning',
      bgClass: 'bg-warning-soft',
      indisponivel: !metrics.descontoDisponivel,
    },
    {
      title: '% Desconto',
      value: metrics.descontoDisponivel ? formatPercent(metrics.percentualDesconto) : '—',
      icon: Percent,
      iconClass: 'text-chart-8',
      bgClass: 'bg-chart-8/10',
      indisponivel: !metrics.descontoDisponivel,
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
    <div className="space-y-2">
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={exporting}>
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Exportar KPIs
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleExportImage}>
              <Image className="h-4 w-4 mr-2" />
              Exportar Imagem
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExportPDF}>
              <FileText className="h-4 w-4 mr-2" />
              Exportar PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div ref={containerRef} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 p-1">
        {/* Cards de vendas */}
        {cardsVendas.map((card, i) => (
          <Card key={i} className={card.highlight ? 'ring-2 ring-success ring-offset-2' : ''}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
              <div className={`p-2 rounded-full ${card.bgClass}`}>
                <card.icon className={`h-4 w-4 ${card.iconClass}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className={`text-xl font-bold ${card.highlight ? 'text-success' : ''}`}>
                {card.value}
              </div>
              {card.subtitle && (
                <p className="text-xs text-muted-foreground mt-1">{card.subtitle}</p>
              )}
            </CardContent>
          </Card>
        ))}

        {/* Card de projeção (somente se houver datas futuras) */}
        {cardProjecao && (
          <Card className="ring-2 ring-info ring-offset-2 bg-info-soft">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-info">{cardProjecao.title}</CardTitle>
              <div className={`p-2 rounded-full ${cardProjecao.bgClass}`}>
                <TrendingUp className={`h-4 w-4 ${cardProjecao.iconClass}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-info">{cardProjecao.value}</div>
              {cardProjecao.subtitle && (
                <p className="text-xs text-info/80 mt-1">{cardProjecao.subtitle}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Cards de desconto */}
        {cardsDesconto.map((card, i) => (
          <Card key={`desc-${i}`} className={card.indisponivel ? 'opacity-60' : ''}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
              <div className={`p-2 rounded-full ${card.bgClass}`}>
                {card.indisponivel ? (
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <card.icon className={`h-4 w-4 ${card.iconClass}`} />
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">{card.value}</div>
              {card.indisponivel && (
                <p className="text-xs text-muted-foreground mt-1">Sem dados de desconto</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
