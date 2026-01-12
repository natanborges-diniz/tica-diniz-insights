import { Skeleton } from '@/components/ui/skeleton';
import { ResumoFormaPagamento } from '@/services/vendasService';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, Sector } from 'recharts';
import { PieChart as PieChartIcon } from 'lucide-react';
import { useState, useCallback } from 'react';
import { ExportableCard } from '@/components/ui/exportable-card';

interface PaymentMethodsChartProps {
  dados: ResumoFormaPagamento[];
  isLoading?: boolean;
}

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  '#8884d8',
  '#82ca9d',
  '#ffc658',
  '#ff7300',
  '#00C49F',
];

function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `R$ ${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `R$ ${(value / 1000).toFixed(0)}k`;
  }
  return `R$ ${value.toFixed(0)}`;
}

// Componente para renderizar setor ativo (hover)
const renderActiveShape = (props: any) => {
  const RADIAN = Math.PI / 180;
  const {
    cx, cy, midAngle, innerRadius, outerRadius, startAngle, endAngle,
    fill, payload, percent, value
  } = props;
  const sin = Math.sin(-RADIAN * midAngle);
  const cos = Math.cos(-RADIAN * midAngle);
  const sx = cx + (outerRadius + 10) * cos;
  const sy = cy + (outerRadius + 10) * sin;
  const mx = cx + (outerRadius + 30) * cos;
  const my = cy + (outerRadius + 30) * sin;
  const ex = mx + (cos >= 0 ? 1 : -1) * 22;
  const ey = my;
  const textAnchor = cos >= 0 ? 'start' : 'end';

  return (
    <g>
      <text x={cx} y={cy} dy={8} textAnchor="middle" fill="hsl(var(--foreground))" className="text-sm font-medium">
        {payload.name}
      </text>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cx}
        cy={cy}
        startAngle={startAngle}
        endAngle={endAngle}
        innerRadius={outerRadius + 6}
        outerRadius={outerRadius + 10}
        fill={fill}
      />
      <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={fill} fill="none" />
      <circle cx={ex} cy={ey} r={2} fill={fill} stroke="none" />
      <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} textAnchor={textAnchor} fill="hsl(var(--foreground))" className="text-xs">
        {formatCurrency(value)}
      </text>
      <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} dy={14} textAnchor={textAnchor} fill="hsl(var(--muted-foreground))" className="text-xs">
        {`(${(percent * 100).toFixed(1)}%)`}
      </text>
    </g>
  );
};

export function PaymentMethodsChart({ dados, isLoading }: PaymentMethodsChartProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  const onPieEnter = useCallback((_: any, index: number) => {
    setActiveIndex(index);
  }, []);

  // Agrupa por forma de pagamento (soma de todas empresas)
  const chartData = dados.reduce((acc, item) => {
    const existing = acc.find(d => d.name === item.formaPagamento);
    if (existing) {
      existing.value += item.totalGeral;
      existing.qtd += item.qtdVendas;
    } else {
      acc.push({ name: item.formaPagamento, value: item.totalGeral, qtd: item.qtdVendas });
    }
    return acc;
  }, [] as { name: string; value: number; qtd: number }[]);

  // Ordena por valor decrescente
  chartData.sort((a, b) => b.value - a.value);

  return (
    <ExportableCard
      title="Distribuição por Forma de Pagamento"
      filename={`distribuicao_pagamento_${new Date().toISOString().split('T')[0]}`}
      icon={<PieChartIcon className="h-5 w-5" />}
    >
      {isLoading ? (
        <Skeleton className="h-[320px] w-full" />
      ) : chartData.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">Nenhum dado para exibir</p>
      ) : (
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                activeIndex={activeIndex}
                activeShape={renderActiveShape}
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                fill="#8884d8"
                dataKey="value"
                onMouseEnter={onPieEnter}
              >
                {chartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number, name: string, props: any) => [
                  `${formatCurrency(value)} (${props.payload.qtd} vendas)`,
                  name
                ]}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Legend 
                layout="horizontal" 
                verticalAlign="bottom" 
                align="center"
                wrapperStyle={{ paddingTop: '10px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </ExportableCard>
  );
}
