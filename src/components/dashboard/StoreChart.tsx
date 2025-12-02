import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';

interface StoreChartProps {
  data: { loja: string; faturamento: number }[];
  isLoading?: boolean;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
  }).format(value);
}

function truncateName(name: string, maxLength: number = 15): string {
  if (name.length <= maxLength) return name;
  return name.substring(0, maxLength) + '...';
}

export function StoreChart({ data, isLoading }: StoreChartProps) {
  const chartData = data.slice(0, 10).map(d => ({
    ...d,
    lojaShort: truncateName(d.loja),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Faturamento por Loja</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : data.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            Sem dados para o período selecionado
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                type="number"
                tickFormatter={formatCurrency}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              />
              <YAxis 
                type="category"
                dataKey="lojaShort"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                width={75}
              />
              <Tooltip 
                formatter={(value: number) => [formatCurrency(value), 'Faturamento']}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.loja || ''}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Bar 
                dataKey="faturamento" 
                fill="hsl(var(--primary))"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
