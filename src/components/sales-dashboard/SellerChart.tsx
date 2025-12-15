import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { BarChart3 } from 'lucide-react';
import { ResumoEmpresaVendedor } from '@/services/vendasService';

interface SellerChartProps {
  dados: ResumoEmpresaVendedor[];
  isLoading?: boolean;
}

// Cores para diferentes empresas
const COLORS = [
  '#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'
];

function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `R$ ${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `R$ ${(value / 1000).toFixed(1)}k`;
  }
  return `R$ ${value.toFixed(0)}`;
}

export function SellerChart({ dados, isLoading }: SellerChartProps) {
  // Preparar dados agrupados por vendedor com empresa para cor
  const empresas = [...new Set(dados.map(d => d.empresaNomeLogico || d.empresa))];
  const empresaColorMap = Object.fromEntries(
    empresas.map((empresa, index) => [empresa, COLORS[index % COLORS.length]])
  );

  // Ordenar por faturamento real decrescente
  const chartData = [...dados]
    .sort((a, b) => (b.totalLiquidoComDevolucoes || 0) - (a.totalLiquidoComDevolucoes || 0))
    .slice(0, 15) // Limitar a 15 para visualização
    .map(item => ({
      vendedor: item.vendedor?.length > 12 
        ? item.vendedor.substring(0, 12) + '...' 
        : item.vendedor,
      vendedorFull: item.vendedor,
      empresa: item.empresaNomeLogico || item.empresa,
      totalLiquidoComDevolucoes: item.totalLiquidoComDevolucoes || 0,
      cor: empresaColorMap[item.empresaNomeLogico || item.empresa],
    }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          Faturamento Real por Vendedor
        </CardTitle>
        <div className="flex flex-wrap gap-2 mt-2">
          {empresas.map((empresa, index) => (
            <div key={empresa} className="flex items-center gap-1 text-xs">
              <div 
                className="w-3 h-3 rounded" 
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              />
              <span className="text-muted-foreground">{empresa}</span>
            </div>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[350px] w-full" />
        ) : chartData.length === 0 ? (
          <div className="h-[350px] flex items-center justify-center text-muted-foreground">
            Sem dados no período
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 20 }}>
              <XAxis 
                type="number" 
                tickFormatter={formatCurrency}
                tick={{ fontSize: 12 }}
              />
              <YAxis 
                type="category" 
                dataKey="vendedor" 
                width={100}
                tick={{ fontSize: 11 }}
              />
              <Tooltip 
                formatter={(value: number) => [
                  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value),
                  'Faturamento Real'
                ]}
                labelFormatter={(label, payload) => {
                  if (payload && payload[0]) {
                    return `${payload[0].payload.vendedorFull} - ${payload[0].payload.empresa}`;
                  }
                  return label;
                }}
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--background))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px'
                }}
              />
              <Bar dataKey="totalLiquidoComDevolucoes" radius={[0, 4, 4, 0]}>
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
