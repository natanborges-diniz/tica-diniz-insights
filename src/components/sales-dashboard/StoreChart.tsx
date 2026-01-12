import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { ResumoLoja } from '@/hooks/useVendasDashboard';
import { Store } from 'lucide-react';
import { ExportableCard } from '@/components/ui/exportable-card';

interface StoreChartProps {
  dados: ResumoLoja[];
  isLoading: boolean;
  usarVendasSemCreditos?: boolean;
}

export function StoreChart({ dados, isLoading, usarVendasSemCreditos = true }: StoreChartProps) {
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
      total: usarVendasSemCreditos ? d.totalVendidoSemCreditos : d.totalVendido,
      quantidade: d.qtdTransacao,
    }));

  const titulo = usarVendasSemCreditos ? 'Vendas Válidas por Loja' : 'Vendas Totais por Loja';
  const tooltipLabel = usarVendasSemCreditos ? 'Vendas Válidas' : 'Vendas Totais';

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
    >
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 80 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" tickFormatter={(value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact' }).format(value)} />
          <YAxis dataKey="loja" type="category" width={75} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(value: number) => [new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value), tooltipLabel]} />
          <Bar dataKey="total" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ExportableCard>
  );
}
