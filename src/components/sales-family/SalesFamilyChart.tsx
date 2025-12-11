import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { AnaliseFamiliaVendedor } from '@/services/firebirdBridge';

interface SalesFamilyChartProps {
  dados: AnaliseFamiliaVendedor[];
}

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
      total: valores.total,
      qtd: valores.qtd,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10); // Top 10 famílias

  const formatCurrency = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vendas por Família (Top 10)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 100 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              type="number"
              tickFormatter={(value) => formatCurrency(value)}
            />
            <YAxis dataKey="familia" type="category" width={90} tick={{ fontSize: 12 }} />
            <Tooltip
              formatter={(value: number, name: string) => [
                name === 'total' ? formatCurrency(value) : value.toLocaleString('pt-BR') + ' un.',
                name === 'total' ? 'Total Vendido' : 'Qtd. Produtos',
              ]}
            />
            <Bar dataKey="total" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
