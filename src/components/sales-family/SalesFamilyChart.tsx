import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { AnaliseFamiliaVendedor } from '@/services/vendasService';
import { TrendingUp } from 'lucide-react';

interface SalesFamilyChartProps {
  dados: AnaliseFamiliaVendedor[];
}

// Cores vibrantes para as barras
const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
];

export function SalesFamilyChart({ dados }: SalesFamilyChartProps) {
  // Agrupar por família e somar valores
  const familiaMap = new Map<string, { total: number; qtd: number }>();

  dados.forEach(item => {
    const familia = item.familia || 'SEM FAMÍLIA';
    const atual = familiaMap.get(familia) || { total: 0, qtd: 0 };
    familiaMap.set(familia, {
      total: atual.total + (item.totalVendido || 0),
      qtd: atual.qtd + (item.qtdProdutos || 0),
    });
  });

  const chartData = Array.from(familiaMap.entries())
    .map(([familia, valores]) => ({
      familia,
      familiaShort: familia.length > 18 ? familia.substring(0, 18) + '…' : familia,
      total: valores.total,
      qtd: valores.qtd,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10); // Top 10 famílias

  const formatCurrency = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Calcular altura dinâmica baseada na quantidade de itens
  const chartHeight = Math.max(350, chartData.length * 50);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <TrendingUp className="h-5 w-5 text-primary" />
          Vendas por Família (Top 10)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart 
            data={chartData} 
            layout="vertical" 
            margin={{ left: 10, right: 30, top: 10, bottom: 10 }}
            barCategoryGap="20%"
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="hsl(var(--border))" />
            <XAxis
              type="number"
              tickFormatter={(value) => {
                if (value >= 1000000) return `R$ ${(value / 1000000).toFixed(1)}M`;
                if (value >= 1000) return `R$ ${(value / 1000).toFixed(0)}k`;
                return `R$ ${value}`;
              }}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={{ stroke: 'hsl(var(--border))' }}
              tickLine={{ stroke: 'hsl(var(--border))' }}
            />
            <YAxis 
              type="category" 
              dataKey="familiaShort" 
              width={140}
              tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: 'hsl(var(--muted) / 0.3)' }}
              formatter={(value: number, name: string) => [
                name === 'total' ? formatCurrency(value) : value.toLocaleString('pt-BR') + ' un.',
                name === 'total' ? 'Total Vendido' : 'Qtd. Produtos',
              ]}
              labelFormatter={(_, payload) => {
                if (payload && payload[0]) {
                  return payload[0].payload.familia;
                }
                return '';
              }}
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              }}
            />
            <Bar 
              dataKey="total" 
              radius={[0, 6, 6, 0]}
              maxBarSize={35}
            >
              {chartData.map((_, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={COLORS[index % COLORS.length]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
