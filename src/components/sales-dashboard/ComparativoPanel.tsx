// src/components/sales-dashboard/ComparativoPanel.tsx
// Painel único de comparativo: período base (vem do filtro) × período de comparação
// (definido no painel), com barras Base vs Comparação lado a lado agrupadas por loja.

import { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  BarChart3, TrendingUp, TrendingDown, Minus, RefreshCw, Calendar,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LabelList,
} from 'recharts';
import { EmpresaParam } from '@/services/firebirdBridge';
import { useUserEmpresas } from '@/hooks/useUserEmpresas';
import {
  useComparativoPeriodos,
  calcPeriodoPreset,
  PresetComparacao,
  IndicadorComparativo,
  INDICADORES_LABELS,
} from '@/hooks/useComparativoPeriodos';

const CORES = {
  base: 'hsl(var(--chart-1))',
  comp: 'hsl(var(--chart-2))',
};

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
function formatDataBR(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}
function calcVariacao(atual: number, anterior: number): number | null {
  if (anterior === 0) return atual > 0 ? 100 : null;
  return ((atual - anterior) / anterior) * 100;
}

interface ComparativoPanelProps {
  dataInicio: string;
  dataFim: string;
  empresa: EmpresaParam;
}

export function ComparativoPanel({ dataInicio, dataFim, empresa }: ComparativoPanelProps) {
  const { empresas } = useUserEmpresas();

  const [preset, setPreset] = useState<PresetComparacao>('anoAnterior');
  const [customInicio, setCustomInicio] = useState<string>('');
  const [customFim, setCustomFim] = useState<string>('');
  const [indicador, setIndicador] = useState<IndicadorComparativo>('totalVendido');
  const [agrupamento, setAgrupamento] = useState<'loja' | 'total'>('loja');

  // Ao trocar o período base, se preset != personalizado, redefine automaticamente
  // Se personalizado, mantém o customInicio/customFim
  const compPeriodo = useMemo(() => {
    if (preset === 'personalizado') {
      if (!customInicio || !customFim) return null;
      return { inicio: customInicio, fim: customFim };
    }
    return calcPeriodoPreset(dataInicio, dataFim, preset);
  }, [preset, dataInicio, dataFim, customInicio, customFim]);

  // Quando muda para personalizado sem valores, pré-popula com ano anterior
  useEffect(() => {
    if (preset === 'personalizado' && (!customInicio || !customFim)) {
      const p = calcPeriodoPreset(dataInicio, dataFim, 'anoAnterior');
      if (p) {
        setCustomInicio(p.inicio);
        setCustomFim(p.fim);
      }
    }
  }, [preset, dataInicio, dataFim, customInicio, customFim]);

  const { linhas, loading, error, reload } = useComparativoPeriodos({
    baseInicio: dataInicio,
    baseFim: dataFim,
    compInicio: compPeriodo?.inicio ?? '',
    compFim: compPeriodo?.fim ?? '',
    empresa,
    agruparPorLoja: agrupamento === 'loja',
    empresasCatalogo: empresas.map((e) => ({ codEmpresa: e.codEmpresa, nome: e.nome })),
  });

  const chartData = useMemo(
    () =>
      linhas.map((l) => ({
        loja: l.empresaNome,
        Base: l.base[indicador],
        Comparação: l.comp[indicador],
      })),
    [linhas, indicador]
  );

  const totalBase = useMemo(
    () => linhas.reduce((acc, l) => acc + (l.base[indicador] || 0), 0),
    [linhas, indicador]
  );
  const totalComp = useMemo(
    () => linhas.reduce((acc, l) => acc + (l.comp[indicador] || 0), 0),
    [linhas, indicador]
  );
  const variacaoTotal = calcVariacao(totalBase, totalComp);

  const isGoodDelta = (delta: number | null) => {
    if (delta === null) return false;
    const isPositive = delta > 0;
    const isNegative = delta < 0;
    return indicador === 'totalDesconto' || indicador === 'percentualDesconto'
      ? isNegative
      : isPositive;
  };

  const labelBase = `${formatDataBR(dataInicio)} → ${formatDataBR(dataFim)}`;
  const labelComp = compPeriodo
    ? `${formatDataBR(compPeriodo.inicio)} → ${formatDataBR(compPeriodo.fim)}`
    : '—';

  const empresasSelecionadasLabel = useMemo(() => {
    if (empresa === 'ALL' || empresa === null || empresa === undefined) return 'Todas as lojas';
    if (Array.isArray(empresa)) return `${empresa.length} loja(s)`;
    return '1 loja';
  }, [empresa]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Comparativo</CardTitle>
            <Badge variant="outline" className="text-xs">{empresasSelecionadasLabel}</Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Linhas de contexto: período base × comparação */}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ backgroundColor: CORES.base }}
              aria-hidden
            />
            <div className="flex flex-col">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Base (filtro)</span>
              <span className="text-sm font-medium">{labelBase}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ backgroundColor: CORES.comp }}
              aria-hidden
            />
            <div className="flex flex-col">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Comparação</span>
              <span className="text-sm font-medium">{labelComp}</span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Controles */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Comparar com</Label>
            <Select value={preset} onValueChange={(v) => setPreset(v as PresetComparacao)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="anoAnterior">Mesmo período — ano anterior</SelectItem>
                <SelectItem value="mesAnterior">Mesmo período — mês anterior</SelectItem>
                <SelectItem value="personalizado">Personalizado…</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {preset === 'personalizado' && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Início comparação</Label>
                <Input
                  type="date"
                  value={customInicio}
                  onChange={(e) => setCustomInicio(e.target.value)}
                  className="w-[170px]"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Fim comparação</Label>
                <Input
                  type="date"
                  value={customFim}
                  onChange={(e) => setCustomFim(e.target.value)}
                  className="w-[170px]"
                />
              </div>
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Indicador</Label>
            <Select value={indicador} onValueChange={(v) => setIndicador(v as IndicadorComparativo)}>
              <SelectTrigger className="w-[240px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(INDICADORES_LABELS) as IndicadorComparativo[]).map((key) => (
                  <SelectItem key={key} value={key}>{INDICADORES_LABELS[key]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Agrupar</Label>
            <RadioGroup
              value={agrupamento}
              onValueChange={(v) => setAgrupamento(v as 'loja' | 'total')}
              className="flex items-center gap-3 h-9"
            >
              <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                <RadioGroupItem value="loja" id="grp-loja" />
                Por loja
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                <RadioGroupItem value="total" id="grp-total" />
                Total agregado
              </label>
            </RadioGroup>
          </div>
        </div>

        {loading && <Skeleton className="h-72 w-full" />}
        {error && !loading && (
          <div className="text-sm text-destructive text-center py-4">{error}</div>
        )}

        {!loading && !error && chartData.length > 0 && (
          <>
            {/* Gráfico */}
            <div style={{ height: Math.max(320, chartData.length * 48 + 120) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  barCategoryGap="20%"
                  barGap={4}
                  margin={{ top: 20, right: 16, left: 0, bottom: chartData.length > 4 ? 70 : 30 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="loja"
                    tick={{ fontSize: 12, fontWeight: 600 }}
                    className="fill-foreground"
                    interval={0}
                    angle={chartData.length > 4 ? -25 : 0}
                    textAnchor={chartData.length > 4 ? 'end' : 'middle'}
                    height={chartData.length > 4 ? 80 : 40}
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
                    formatter={(value: number, name: string) => [formatValue(value, indicador), name]}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Base" fill={CORES.base} radius={[6, 6, 0, 0]} maxBarSize={70}>
                    <LabelList
                      dataKey="Base"
                      position="top"
                      formatter={(v: number) => formatValue(v, indicador)}
                      style={{ fontSize: 10, fontWeight: 600, fill: 'hsl(var(--foreground))' }}
                    />
                  </Bar>
                  <Bar dataKey="Comparação" fill={CORES.comp} radius={[6, 6, 0, 0]} maxBarSize={70}>
                    <LabelList
                      dataKey="Comparação"
                      position="top"
                      formatter={(v: number) => formatValue(v, indicador)}
                      style={{ fontSize: 10, fontWeight: 600, fill: 'hsl(var(--foreground))' }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Chips de variação por loja */}
            <div className="flex flex-wrap gap-2 justify-center pt-2">
              {linhas.map((l) => {
                const bValue = l.base[indicador];
                const cValue = l.comp[indicador];
                const variacao = calcVariacao(bValue, cValue);
                const good = isGoodDelta(variacao);
                const isPositive = variacao !== null && variacao > 0;
                const isNegative = variacao !== null && variacao < 0;
                const isNeutral = variacao === null || variacao === 0;
                return (
                  <div
                    key={l.chave}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs ${
                      isNeutral
                        ? 'bg-muted border-border'
                        : good
                          ? 'bg-success-soft border-success/30'
                          : 'bg-danger-soft border-danger/30'
                    }`}
                  >
                    {isPositive ? (
                      <TrendingUp className={`h-3.5 w-3.5 ${good ? 'text-success' : 'text-danger'}`} />
                    ) : isNegative ? (
                      <TrendingDown className={`h-3.5 w-3.5 ${good ? 'text-success' : 'text-danger'}`} />
                    ) : (
                      <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className="font-medium">{l.empresaNome}:</span>
                    <span
                      className={`font-bold ${
                        isNeutral ? 'text-muted-foreground' : good ? 'text-success' : 'text-danger'
                      }`}
                    >
                      {variacao !== null
                        ? `${variacao > 0 ? '+' : ''}${variacao.toFixed(1)}%`
                        : 'N/A'}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Tabela */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Loja</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">Base</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">Comparação</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">Δ absoluto</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">Δ %</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => {
                    const bValue = l.base[indicador];
                    const cValue = l.comp[indicador];
                    const deltaAbs = bValue - cValue;
                    const deltaPct = calcVariacao(bValue, cValue);
                    const good = isGoodDelta(deltaPct);
                    return (
                      <tr key={l.chave} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-2 px-3 font-semibold">{l.empresaNome}</td>
                        <td className="py-2 px-3 text-right">{formatValue(bValue, indicador)}</td>
                        <td className="py-2 px-3 text-right">{formatValue(cValue, indicador)}</td>
                        <td
                          className={`py-2 px-3 text-right ${
                            deltaAbs === 0
                              ? 'text-muted-foreground'
                              : good
                                ? 'text-success'
                                : 'text-danger'
                          }`}
                        >
                          {deltaAbs > 0 ? '+' : ''}
                          {formatValue(deltaAbs, indicador)}
                        </td>
                        <td
                          className={`py-2 px-3 text-right font-medium ${
                            deltaPct === null || deltaPct === 0
                              ? 'text-muted-foreground'
                              : good
                                ? 'text-success'
                                : 'text-danger'
                          }`}
                        >
                          {deltaPct !== null
                            ? `${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(1)}%`
                            : 'N/A'}
                        </td>
                      </tr>
                    );
                  })}
                  {linhas.length > 1 && (
                    <tr className="bg-muted/20 font-semibold">
                      <td className="py-2 px-3">Total</td>
                      <td className="py-2 px-3 text-right">{formatValue(totalBase, indicador)}</td>
                      <td className="py-2 px-3 text-right">{formatValue(totalComp, indicador)}</td>
                      <td className="py-2 px-3 text-right">
                        {totalBase - totalComp > 0 ? '+' : ''}
                        {formatValue(totalBase - totalComp, indicador)}
                      </td>
                      <td className="py-2 px-3 text-right">
                        {variacaoTotal !== null
                          ? `${variacaoTotal > 0 ? '+' : ''}${variacaoTotal.toFixed(1)}%`
                          : 'N/A'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!loading && !error && chartData.length === 0 && (
          <div className="text-center text-muted-foreground py-8">
            <Calendar className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Defina um período de comparação válido.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
