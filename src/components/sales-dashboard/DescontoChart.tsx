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

// Cores para diferentes empresas
const COLORS = [
  '#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'
];

export function DescontoChart({ dados, isLoading, erro }: DescontoChartProps) {
  // Preparar dados agrupados por vendedor com empresa para cor
  const empresas = [...new Set(dados.map(d => d.empresaNomeLogico || d.empresa))];
  const empresaColorMap = Object.fromEntries(
    empresas.map((empresa, index) => [empresa, COLORS[index % COLORS.length]])
  );

  // Ordenar por % desconto decrescente
  const chartData = [...dados]
    .filter(d => d.totalBruto > 0) // Só incluir quem tem vendas
    .sort((a, b) => (b.percentualDesconto || 0) - (a.percentualDesconto || 0))
    .slice(0, 15) // Limitar a 15 para visualização
    .map(item => ({
      vendedor: item.vendedor?.length > 12 
        ? item.vendedor.substring(0, 12) + '...' 
        : item.vendedor,
      vendedorFull: item.vendedor,
      empresa: item.empresaNomeLogico || item.empresa,
      percentualDesconto: item.percentualDesconto || 0,
      cor: empresaColorMap[item.empresaNomeLogico || item.empresa],
    }));

  // Se tiver erro, mostrar mensagem amigável
  if (erro) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Percent className="h-5 w-5 text-orange-500" />
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
          <Percent className="h-5 w-5 text-orange-500" />
          % Desconto por Vendedor
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
                tickFormatter={(value) => `${value.toFixed(1)}%`}
                tick={{ fontSize: 12 }}
                domain={[0, 'auto']}
              />
              <YAxis 
                type="category" 
                dataKey="vendedor" 
                width={100}
                tick={{ fontSize: 11 }}
              />
              <Tooltip 
                formatter={(value: number) => [
                  `${value.toFixed(2)}%`,
                  '% Desconto'
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
