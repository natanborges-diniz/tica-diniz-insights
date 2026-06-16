import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  ComposedChart, Line, Legend, LabelList,
} from 'recharts';
import { AnaliseFamiliaVendedor } from '@/services/vendasService';
import { TrendingUp } from 'lucide-react';

interface SalesFamilyChartProps {
  dados: AnaliseFamiliaVendedor[];
}

const CHART_COLORS = [
  'hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))',
  'hsl(var(--chart-5))', 'hsl(var(--chart-6))', 'hsl(var(--chart-7))', 'hsl(var(--chart-8))',
];

type Metric = 'faturamento' | 'pecas' | 'ambos';

const formatCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtCurrencyShort = (v: number) => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`;
  return `R$ ${v}`;
};
const fmtIntShort = (v: number) => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
};

export function SalesFamilyChart({ dados }: SalesFamilyChartProps) {
  const [metric, setMetric] = useState<Metric>('faturamento');

  const familiaMap = new Map<string, { faturamento: number; pecas: number }>();
  dados.forEach(item => {
    const familia = item.familia || 'SEM FAMÍLIA';
    const atual = familiaMap.get(familia) || { faturamento: 0, pecas: 0 };
    familiaMap.set(familia, {
      faturamento: atual.faturamento + (item.totalVendido || 0),
      pecas: atual.pecas + (item.qtdProdutos || 0),
    });
  });

  // Top 10 sempre por faturamento (referência de negócio)
  const chartData = Array.from(familiaMap.entries())
    .map(([familia, v]) => ({
      familia,
      familiaShort: familia.length > 18 ? familia.substring(0, 18) + '…' : familia,
      faturamento: v.faturamento,
      pecas: v.pecas,
    }))
    .sort((a, b) => b.faturamento - a.faturamento)
    .slice(0, 10);

  const chartHeight = Math.max(360, chartData.length * 48);
  const tooltipStyle = {
    backgroundColor: 'hsl(var(--background))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5 text-primary" />
              Top 10 Famílias
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Ranking sempre por faturamento • escolha o que comparar
            </p>
          </div>
          <Tabs value={metric} onValueChange={(v) => setMetric(v as Metric)}>
            <TabsList>
              <TabsTrigger value="faturamento">Faturamento</TabsTrigger>
              <TabsTrigger value="pecas">Peças</TabsTrigger>
              <TabsTrigger value="ambos">Ambos</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        {/* ===== AMBOS: combo vertical com eixo duplo ===== */}
        {metric === 'ambos' ? (
          <ResponsiveContainer width="100%" height={Math.max(380, chartHeight)}>
            <ComposedChart data={chartData} margin={{ left: 10, right: 20, top: 10, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis
                dataKey="familiaShort"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                interval={0}
                angle={-30}
                textAnchor="end"
                height={70}
              />
              <YAxis
                yAxisId="left"
                tickFormatter={fmtCurrencyShort}
                tick={{ fontSize: 11, fill: 'hsl(var(--chart-1))' }}
                label={{ value: 'Faturamento', angle: -90, position: 'insideLeft', fill: 'hsl(var(--chart-1))', fontSize: 11 }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tickFormatter={fmtIntShort}
                tick={{ fontSize: 11, fill: 'hsl(var(--chart-3))' }}
                label={{ value: 'Peças', angle: 90, position: 'insideRight', fill: 'hsl(var(--chart-3))', fontSize: 11 }}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number, name: string) =>
                  name === 'faturamento'
                    ? [formatCurrency(value), 'Faturamento']
                    : [value.toLocaleString('pt-BR') + ' peças', 'Peças']
                }
                labelFormatter={(_, p) => p?.[0]?.payload?.familia || ''}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="left" dataKey="faturamento" name="Faturamento" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} maxBarSize={48}>
                <LabelList dataKey="faturamento" position="top" formatter={fmtCurrencyShort} style={{ fontSize: 10, fill: 'hsl(var(--chart-1))', fontWeight: 600 }} />
              </Bar>
              <Line yAxisId="right" type="monotone" dataKey="pecas" name="Peças" stroke="hsl(var(--chart-3))" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }}>
                <LabelList dataKey="pecas" position="top" formatter={fmtIntShort} style={{ fontSize: 10, fill: 'hsl(var(--chart-3))', fontWeight: 600 }} />
              </Line>
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          /* ===== FATURAMENTO ou PEÇAS: barras horizontais coloridas ===== */
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 70, top: 10, bottom: 10 }} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke="hsl(var(--border))" />
              <XAxis
                type="number"
                tickFormatter={metric === 'faturamento' ? fmtCurrencyShort : fmtIntShort}
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickLine={{ stroke: 'hsl(var(--border))' }}
              />
              <YAxis type="category" dataKey="familiaShort" width={140} tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: 'hsl(var(--muted) / 0.3)' }}
                contentStyle={tooltipStyle}
                formatter={(value: number) =>
                  metric === 'faturamento'
                    ? [formatCurrency(value), 'Faturamento']
                    : [value.toLocaleString('pt-BR') + ' peças', 'Peças']
                }
                labelFormatter={(_, payload) => payload?.[0]?.payload?.familia || ''}
              />
              <Bar dataKey={metric} radius={[0, 6, 6, 0]} maxBarSize={35}>
                {chartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
                <LabelList
                  dataKey={metric}
                  position="right"
                  formatter={metric === 'faturamento' ? fmtCurrencyShort : fmtIntShort}
                  style={{ fontSize: 11, fill: 'hsl(var(--foreground))', fontWeight: 600 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
