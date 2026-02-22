import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Percent } from 'lucide-react';
import { ResumoEmpresaVendedor } from '@/services/vendasService';

interface DescontoChartProps {
  dados: ResumoEmpresaVendedor[];
  isLoading?: boolean;
  erro?: string | null;
}

// Chart tokens
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

export function DescontoChart({ dados, isLoading, erro }: DescontoChartProps) {
  const empresas = [...new Set(dados.map(d => d.empresaNomeLogico || d.empresa))];
  const empresaColorMap = Object.fromEntries(
    empresas.map((empresa, index) => [empresa, CHART_COLORS[index % CHART_COLORS.length]])
  );

  const chartData = [...dados]
    .filter(d => d.totalBruto > 0)
    .sort((a, b) => (b.percentualDesconto || 0) - (a.percentualDesconto || 0))
    .slice(0, 15)
    .map(item => ({
      vendedor: item.vendedor?.length > 12 ? item.vendedor.substring(0, 12) + '...' : item.vendedor,
      vendedorFull: item.vendedor,
      empresa: item.empresaNomeLogico || item.empresa,
      percentualDesconto: item.percentualDesconto || 0,
      cor: empresaColorMap[item.empresaNomeLogico || item.empresa],
    }));

  if (erro) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Percent className="h-5 w-5 text-warning" />
            % Desconto por Vendedor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[350px] flex flex-col items-center justify-center text-muted-foreground">
            <p className="text-center mb-2">⏱️ Timeout ao carregar dados de desconto.</p>
            <p className="text-sm text-center">Tente filtrar por uma loja específica para reduzir o volume de dados.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Percent className="h-5 w-5 text-warning" />
          % Desconto por Vendedor
        </CardTitle>
        <div className="flex flex-wrap gap-2 mt-2">
          {empresas.map((empresa, index) => (
            <div key={empresa} className="flex items-center gap-1 text-xs">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
              <span className="text-muted-foreground">{empresa}</span>
            </div>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[350px] w-full" />
        ) : chartData.length === 0 ? (
          <div className="h-[350px] flex items-center justify-center text-muted-foreground">Sem dados no período</div>
        ) : (
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 20 }}>
              <XAxis type="number" tickFormatter={(v) => `${v.toFixed(1)}%`} tick={{ fontSize: 12 }} domain={[0, 'auto']} />
              <YAxis type="category" dataKey="vendedor" width={100} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value: number) => [`${value.toFixed(2)}%`, '% Desconto']}
                labelFormatter={(label, payload) => {
                  if (payload && payload[0]) return `${payload[0].payload.vendedorFull} - ${payload[0].payload.empresa}`;
                  return label;
                }}
                contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
              />
              <Bar dataKey="percentualDesconto" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.cor} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
