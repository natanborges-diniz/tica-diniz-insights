import { Skeleton } from '@/components/ui/skeleton';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { BarChart3 } from 'lucide-react';
import { ResumoEmpresaVendedor } from '@/services/vendasService';
import { ExportableCard } from '@/components/ui/exportable-card';

interface SellerChartProps {
  dados: ResumoEmpresaVendedor[];
  isLoading?: boolean;
  usarVendasSemCreditos?: boolean;
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

export function SellerChart({ dados, isLoading, usarVendasSemCreditos = true }: SellerChartProps) {
  // Preparar dados agrupados por vendedor com empresa para cor
  const empresas = [...new Set(dados.map(d => d.empresaNomeLogico || d.empresa))];
  const empresaColorMap = Object.fromEntries(
    empresas.map((empresa, index) => [empresa, COLORS[index % COLORS.length]])
  );

  // Ordenar por vendas (com ou sem créditos) decrescente
  const chartData = [...dados]
    .sort((a, b) => 
      usarVendasSemCreditos 
        ? (b.totalVendidoSemCreditos || 0) - (a.totalVendidoSemCreditos || 0)
        : (b.totalVendido || 0) - (a.totalVendido || 0)
    )
    .slice(0, 15) // Limitar a 15 para visualização
    .map(item => ({
      vendedor: item.vendedor?.length > 12 
        ? item.vendedor.substring(0, 12) + '...' 
        : item.vendedor,
      vendedorFull: item.vendedor,
      empresa: item.empresaNomeLogico || item.empresa,
      valorVendas: usarVendasSemCreditos ? (item.totalVendidoSemCreditos || 0) : (item.totalVendido || 0),
      cor: empresaColorMap[item.empresaNomeLogico || item.empresa],
    }));

  const titulo = usarVendasSemCreditos ? 'Vendas Válidas por Vendedor' : 'Vendas Totais por Vendedor';
  const tooltipLabel = usarVendasSemCreditos ? 'Vendas Válidas' : 'Vendas Totais';

  return (
    <ExportableCard
      title={titulo}
      filename={`vendas_vendedor_${new Date().toISOString().split('T')[0]}`}
      icon={<BarChart3 className="h-5 w-5 text-primary" />}
      actions={
        <div className="flex flex-wrap gap-2">
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
      }
    >
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
                tooltipLabel
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
            <Bar dataKey="valorVendas" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.cor} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ExportableCard>
  );
}
