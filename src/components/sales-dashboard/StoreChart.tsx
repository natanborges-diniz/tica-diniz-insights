import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { ResumoLoja } from '@/hooks/useVendasDashboard';
import { Store } from 'lucide-react';
import { ExportableCard } from '@/components/ui/exportable-card';
import { cn } from '@/lib/utils';

interface StoreChartProps {
  dados: ResumoLoja[];
  isLoading: boolean;
  usarVendasSemCreditos?: boolean;
  selectedLoja?: string | null;
  onLojaClick?: (loja: string) => void;
}

const COLORS = {
  default: 'hsl(var(--primary))',
  selected: 'hsl(var(--primary))',
  dimmed: 'hsl(var(--muted))',
};

export function StoreChart({ 
  dados, 
  isLoading, 
  usarVendasSemCreditos = true,
  selectedLoja,
  onLojaClick,
}: StoreChartProps) {
  const chartData = dados
    .filter(d => (usarVendasSemCreditos ? d.totalVendidoSemCreditos : d.totalVendido) > 0)
    .sort((a, b) => 
      usarVendasSemCreditos 
        ? b.totalVendidoSemCreditos - a.totalVendidoSemCreditos
        : b.totalVendido - a.totalVendido
    )
    .slice(0, 15)
    .map(d => ({
      loja: d.empresa.replace('DINIZ ', ''),
      lojaFull: d.empresa,
      total: usarVendasSemCreditos ? d.totalVendidoSemCreditos : d.totalVendido,
      quantidade: d.qtdTransacao,
    }));

  const titulo = usarVendasSemCreditos ? 'Vendas Válidas por Loja' : 'Vendas Totais por Loja';
  const tooltipLabel = usarVendasSemCreditos ? 'Vendas Válidas' : 'Vendas Totais';

  const handleBarClick = (data: any) => {
    if (onLojaClick && data?.lojaFull) {
      onLojaClick(data.lojaFull);
    }
  };

  const getBarColor = (lojaFull: string) => {
    if (!selectedLoja) return COLORS.default;
    return lojaFull === selectedLoja ? COLORS.selected : COLORS.dimmed;
  };

  if (isLoading) {
    return (
      <ExportableCard
        title={titulo}
        filename={`vendas_loja_${new Date().toISOString().split('T')[0]}`}
        icon={<Store className="h-5 w-5" />}
      >
        <Skeleton className="h-[300px] w-full" />
      </ExportableCard>
    );
  }

  return (
    <ExportableCard
      title={titulo}
      filename={`vendas_loja_${new Date().toISOString().split('T')[0]}`}
      icon={<Store className="h-5 w-5" />}
      subtitle={onLojaClick ? "Clique em uma barra para filtrar" : undefined}
    >
      <ResponsiveContainer width="100%" height={300}>
        <BarChart 
          data={chartData} 
          layout="vertical" 
          margin={{ left: 80 }}
          className={cn(onLojaClick && "cursor-pointer")}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" tickFormatter={(value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact' }).format(value)} />
          <YAxis dataKey="loja" type="category" width={75} tick={{ fontSize: 12 }} />
          <Tooltip 
            formatter={(value: number) => [new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value), tooltipLabel]}
            cursor={{ fill: 'hsl(var(--muted)/0.3)' }}
          />
          <Bar 
            dataKey="total" 
            radius={[0, 4, 4, 0]}
            onClick={handleBarClick}
            style={{ cursor: onLojaClick ? 'pointer' : 'default' }}
          >
            {chartData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={getBarColor(entry.lojaFull)}
                className="transition-all duration-200"
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ExportableCard>
  );
}
