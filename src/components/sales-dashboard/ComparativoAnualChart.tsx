// src/components/sales-dashboard/ComparativoAnualChart.tsx
// Comparativo entre anos, com suporte a multi-empresa (barras por ano×loja).

import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { BarChart3, TrendingUp, TrendingDown, Minus, RefreshCw } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts';
import {
  useComparativoAnual,
  IndicadorComparativo,
  INDICADORES_LABELS,
} from '@/hooks/useComparativoAnual';
import { EmpresaParam } from '@/services/firebirdBridge';
import { useUserEmpresas } from '@/hooks/useUserEmpresas';

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}
function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value);
}
function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}
function formatValue(value: number, indicador: IndicadorComparativo): string {
  switch (indicador) {
    case 'totalVendido':
    case 'totalBruto':
    case 'totalDesconto':
    case 'ticketMedio':
      return formatCurrency(value);
    case 'percentualDesconto':
      return formatPercent(value);
    case 'qtdVendas':
      return formatNumber(value);
    default:
      return String(value);
  }
}
function calcVariacao(atual: number, anterior: number): number | null {
  if (anterior === 0) return atual > 0 ? 100 : null;
  return ((atual - anterior) / anterior) * 100;
}

const CORES = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--primary))',
];

interface ComparativoAnualChartProps {
  dataInicio: string;
  dataFim: string;
  empresa: EmpresaParam;
}

export function ComparativoAnualChart({ dataInicio, dataFim, empresa }: ComparativoAnualChartProps) {
  const { dados, loading, error, anosDisponiveis, fetchComparativo } = useComparativoAnual();
  const { empresas } = useUserEmpresas();

  const anoFiltro = new Date(dataInicio + 'T12:00:00').getFullYear();
  const [anosSelecionados, setAnosSelecionados] = useState<number[]>([anoFiltro, anoFiltro - 1]);
  const [indicador, setIndicador] = useState<IndicadorComparativo>('totalVendido');

  useEffect(() => {
    const novoAno = new Date(dataInicio + 'T12:00:00').getFullYear();
    setAnosSelecionados((prev) => (prev.includes(novoAno) ? prev : [novoAno, novoAno - 1]));
  }, [dataInicio]);

  useEffect(() => {
    if (anosSelecionados.length > 0 && dataInicio && dataFim) {
      fetchComparativo({
        dataInicio,
        dataFim,
        empresa,
        anosComparar: anosSelecionados,
        empresasCatalogo: empresas.map((e) => ({ codEmpresa: e.codEmpresa, nome: e.nome })),
      });
    }
  }, [dataInicio, dataFim, empresa, anosSelecionados, empresas, fetchComparativo]);

  const toggleAno = (ano: number) => {
    setAnosSelecionados((prev) => {
      if (prev.includes(ano)) {
        if (prev.length <= 1) return prev;
        return prev.filter((a) => a !== ano);
      }
      return [...prev, ano].sort((a, b) => a - b);
    });
  };

  const chartData = useMemo(
    () =>
      dados.map((d, idx) => ({
        name: d.label,
        valor: d[indicador],
        fill: CORES[idx % CORES.length],
      })),
    [dados, indicador]
  );

  // Variações: por empresa (ou total), comparando anos consecutivos
  const variacoes = useMemo(() => {
    if (dados.length < 2) return [];
    const grupos = new Map<string | number, typeof dados>();
    dados.forEach((d) => {
      const chave = d.empresaCod ?? 'total';
      if (!grupos.has(chave)) grupos.set(chave, [] as any);
      (grupos.get(chave) as any).push(d);
    });
    const result: Array<{ labelRef: string; labelComp: string; variacao: number | null }> = [];
    grupos.forEach((lista) => {
      const arr = [...lista].sort((a, b) => a.ano - b.ano);
      for (let i = 1; i < arr.length; i++) {
        result.push({
          labelRef: arr[i].label,
          labelComp: arr[i - 1].label,
          variacao: calcVariacao(arr[i][indicador], arr[i - 1][indicador]),
        });
      }
    });
    return result;
  }, [dados, indicador]);

  const periodoLabel = useMemo(() => {
    const ini = new Date(dataInicio + 'T12:00:00');
    const fim = new Date(dataFim + 'T12:00:00');
    const fmtIni = ini.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    const fmtFim = fim.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    return `${fmtIni} — ${fmtFim}`;
  }, [dataInicio, dataFim]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Comparativo Anual</CardTitle>
            <Badge variant="outline" className="text-xs">
              {periodoLabel}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              fetchComparativo({
                dataInicio,
                dataFim,
                empresa,
                anosComparar: anosSelecionados,
                empresasCatalogo: empresas.map((e) => ({ codEmpresa: e.codEmpresa, nome: e.nome })),
              })
            }
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Indicador</Label>
            <Select value={indicador} onValueChange={(v) => setIndicador(v as IndicadorComparativo)}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(INDICADORES_LABELS) as IndicadorComparativo[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {INDICADORES_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Anos para comparar</Label>
            <div className="flex items-center gap-3">
              {anosDisponiveis.map((ano) => (
                <label key={ano} className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox
                    checked={anosSelecionados.includes(ano)}
                    onCheckedChange={() => toggleAno(ano)}
                  />
                  <span className="text-sm">{ano}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {loading && <Skeleton className="h-64 w-full" />}
        {error && !loading && (
          <div className="text-sm text-destructive text-center py-4">{error}</div>
        )}

        {!loading && !error && chartData.length > 0 && (
          <>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barCategoryGap="15%">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fontWeight: 600 }}
                    className="fill-foreground"
                    interval={0}
                    angle={dados.length > 4 ? -20 : 0}
                    textAnchor={dados.length > 4 ? 'end' : 'middle'}
                    height={dados.length > 4 ? 70 : 30}
                  />
                  <YAxis
                    tickFormatter={(v) =>
                      indicador === 'percentualDesconto'
                        ? `${v.toFixed(1)}%`
                        : indicador === 'qtdVendas'
                          ? formatNumber(v)
                          : formatCurrency(v)
                    }
                    width={90}
                    tick={{ fontSize: 11 }}
                    className="fill-muted-foreground"
                  />
                  <Tooltip
                    formatter={(value: number) => [formatValue(value, indicador), INDICADORES_LABELS[indicador]]}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Bar dataKey="valor" radius={[6, 6, 0, 0]} maxBarSize={70}>
                    {chartData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                    <LabelList
                      dataKey="valor"
                      position="top"
                      formatter={(v: number) => formatValue(v, indicador)}
                      style={{ fontSize: 11, fontWeight: 600, fill: 'hsl(var(--foreground))' }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {variacoes.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-center pt-2">
                {variacoes.map((v, i) => {
                  const isPositive = v.variacao !== null && v.variacao > 0;
                  const isNegative = v.variacao !== null && v.variacao < 0;
                  const isNeutral = v.variacao === null || v.variacao === 0;
                  const isGood = indicador === 'totalDesconto' || indicador === 'percentualDesconto'
                    ? isNegative
                    : isPositive;
                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs ${
                        isGood
                          ? 'bg-success-soft border-success/30'
                          : isNeutral
                            ? 'bg-muted border-border'
                            : 'bg-danger-soft border-danger/30'
                      }`}
                    >
                      {isPositive ? (
                        <TrendingUp className={`h-3.5 w-3.5 ${isGood ? 'text-success' : 'text-danger'}`} />
                      ) : isNegative ? (
                        <TrendingDown className={`h-3.5 w-3.5 ${isGood ? 'text-success' : 'text-danger'}`} />
                      ) : (
                        <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span className="font-medium">
                        {v.labelRef} vs {v.labelComp}:
                      </span>
                      <span
                        className={`font-bold ${
                          isGood ? 'text-success' : isNeutral ? 'text-muted-foreground' : 'text-danger'
                        }`}
                      >
                        {v.variacao !== null
                          ? `${v.variacao > 0 ? '+' : ''}${v.variacao.toFixed(1)}%`
                          : 'N/A'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Série</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">Faturamento</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">Transações</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">Ticket Médio</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">% Desconto</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.map((d) => (
                    <tr key={d.key} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-2 px-3 font-semibold">{d.label}</td>
                      <td className="py-2 px-3 text-right">{formatCurrency(d.totalVendido)}</td>
                      <td className="py-2 px-3 text-right">{formatNumber(d.qtdVendas)}</td>
                      <td className="py-2 px-3 text-right">{formatCurrency(d.ticketMedio)}</td>
                      <td className="py-2 px-3 text-right">{formatPercent(d.percentualDesconto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!loading && !error && chartData.length === 0 && (
          <div className="text-center text-muted-foreground py-8">
            <BarChart3 className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Sem dados disponíveis no cache para os anos selecionados.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
