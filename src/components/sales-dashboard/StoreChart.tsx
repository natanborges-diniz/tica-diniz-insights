import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { ResumoLoja } from '@/hooks/useVendasDashboard';

interface StoreChartProps {
  dados: ResumoLoja[];
  isLoading: boolean;
}

export function StoreChart({ dados, isLoading }: StoreChartProps) {
  const chartData = dados
    .filter(d => d.totalVendido > 0)
    .sort((a, b) => b.totalVendido - a.totalVendido)
    .slice(0, 15)
    .map(d => ({
      loja: d.empresa.replace('DINIZ ', ''),
      total: d.totalVendido,
      quantidade: d.qtdTransacao,
    }));

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Vendas por Loja</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vendas por Loja</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 80 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              type="number" 
              tickFormatter={(value) => 
                new Intl.NumberFormat('pt-BR', { 
                  style: 'currency', 
                  currency: 'BRL',
                  notation: 'compact'
                }).format(value)
              } 
            />
            <YAxis dataKey="loja" type="category" width={75} tick={{ fontSize: 12 }} />
            <Tooltip
              formatter={(value: number) => [
                new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value),
                'Total Vendido'
              ]}
            />
            <Bar dataKey="total" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
