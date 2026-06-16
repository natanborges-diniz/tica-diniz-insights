import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { AnaliseFamiliaVendedor } from '@/services/vendasService';
import { TrendingUp } from 'lucide-react';

interface SalesFamilyChartProps {
  dados: AnaliseFamiliaVendedor[];
}

// Chart tokens only
const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--chart-6))',
  'hsl(var(--chart-7))',
  'hsl(var(--chart-8))',
];

export function SalesFamilyChart({ dados }: SalesFamilyChartProps) {
  const familiaMap = new Map<string, { total: number; qtd: number }>();
  dados.forEach(item => {
    const familia = item.familia || 'SEM FAMÍLIA';
    const atual = familiaMap.get(familia) || { total: 0, qtd: 0 };
    familiaMap.set(familia, { total: atual.total + (item.totalVendido || 0), qtd: atual.qtd + (item.qtdProdutos || 0) });
  });

  const chartData = Array.from(familiaMap.entries())
    .map(([familia, valores]) => ({
      familia,
      familiaShort: familia.length > 18 ? familia.substring(0, 18) + '…' : familia,
      total: valores.total,
      qtd: valores.qtd,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const formatCurrency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const chartHeight = Math.max(350, chartData.length * 50);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <TrendingUp className="h-5 w-5 text-primary" />
          Faturamento por Família (Top 10)
        </CardTitle>
        <p className="text-xs text-muted-foreground">Barras = faturamento no período • tooltip mostra peças vendidas</p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30, top: 10, bottom: 10 }} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke="hsl(var(--border))" />
            <XAxis
              type="number"
              tickFormatter={(v) => { if (v >= 1000000) return `R$ ${(v / 1000000).toFixed(1)}M`; if (v >= 1000) return `R$ ${(v / 1000).toFixed(0)}k`; return `R$ ${v}`; }}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={{ stroke: 'hsl(var(--border))' }}
              tickLine={{ stroke: 'hsl(var(--border))' }}
            />
            <YAxis type="category" dataKey="familiaShort" width={140} tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: 'hsl(var(--muted) / 0.3)' }}
              formatter={(value: number, name: string) => [
                name === 'total' ? formatCurrency(value) : value.toLocaleString('pt-BR') + ' peças',
                name === 'total' ? 'Faturamento' : 'Peças',
              ]}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.familia || ''}
              contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
            />
            <Bar dataKey="total" radius={[0, 6, 6, 0]} maxBarSize={35}>
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
