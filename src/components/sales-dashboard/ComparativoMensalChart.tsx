// src/components/sales-dashboard/ComparativoMensalChart.tsx
// Gráfico de comparativo entre múltiplos meses arbitrários (qualquer ano/mês).

import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { CalendarRange, TrendingUp, TrendingDown, Minus, RefreshCw, Plus, X } from 'lucide-react';
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
  useComparativoMensal,
  IndicadorComparativo,
  INDICADORES_LABELS,
  MesRef,
} from '@/hooks/useComparativoMensal';
import { EmpresaParam } from '@/services/firebirdBridge';
import { useUserEmpresas } from '@/hooks/useUserEmpresas';

const MESES = [
  { value: 1, label: 'Janeiro' },
  { value: 2, label: 'Fevereiro' },
  { value: 3, label: 'Março' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Maio' },
  { value: 6, label: 'Junho' },
  { value: 7, label: 'Julho' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Setembro' },
  { value: 10, label: 'Outubro' },
  { value: 11, label: 'Novembro' },
  { value: 12, label: 'Dezembro' },
];

const CORES = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--primary))',
];

const MAX_MESES = 6;

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

interface Props {
  empresa: EmpresaParam;
}

function mesKey(m: MesRef) {
  return `${m.ano}-${m.mes}`;
}

function defaultMeses(): MesRef[] {
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth() + 1;
  const anterior = mesAtual === 1
    ? { ano: anoAtual - 1, mes: 12 }
    : { ano: anoAtual, mes: mesAtual - 1 };
  return [anterior, { ano: anoAtual, mes: mesAtual }];
}

export function ComparativoMensalChart({ empresa }: Props) {
  const { dados, loading, error, anosDisponiveis, fetchComparativo } = useComparativoMensal();
  const { empresas } = useUserEmpresas();

  const [meses, setMeses] = useState<MesRef[]>(defaultMeses());
  const [indicador, setIndicador] = useState<IndicadorComparativo>('totalVendido');

  useEffect(() => {
    if (meses.length > 0) {
      fetchComparativo({
        empresa,
        meses,
        empresasCatalogo: empresas.map((e) => ({ codEmpresa: e.codEmpresa, nome: e.nome })),
      });
    }
  }, [empresa, meses, empresas, fetchComparativo]);

  const addMes = () => {
    if (meses.length >= MAX_MESES) return;
    const ultimo = meses[meses.length - 1] ?? { ano: new Date().getFullYear(), mes: new Date().getMonth() + 1 };
    // Sugere mês anterior ao último
    const sugestao: MesRef = ultimo.mes === 1
      ? { ano: ultimo.ano - 1, mes: 12 }
      : { ano: ultimo.ano, mes: ultimo.mes - 1 };
    // Evita duplicado
    let candidato = sugestao;
    const existentes = new Set(meses.map(mesKey));
    while (existentes.has(mesKey(candidato))) {
      candidato = candidato.mes === 1
        ? { ano: candidato.ano - 1, mes: 12 }
        : { ano: candidato.ano, mes: candidato.mes - 1 };
    }
    setMeses((prev) => [...prev, candidato]);
  };

  const removeMes = (idx: number) => {
    if (meses.length <= 1) return;
    setMeses((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateMes = (idx: number, patch: Partial<MesRef>) => {
    setMeses((prev) => {
      const next = prev.map((m, i) => (i === idx ? { ...m, ...patch } : m));
      // Evita duplicados: se novo item colidir, mantém antigo
      const seen = new Set<string>();
      for (const m of next) {
        const k = mesKey(m);
        if (seen.has(k)) return prev;
        seen.add(k);
      }
      return next;
    });
  };

  const chartData = useMemo(() => {
    if (dados.length === 0) return [];
    return dados.map((d, idx) => ({
      name: d.label,
      valor: d[indicador],
      fill: CORES[idx % CORES.length],
    }));
  }, [dados, indicador]);

  const variacoes = useMemo(() => {
    if (dados.length < 2) return [];
    // Agrupar por empresa (ou total) e comparar meses consecutivos dentro do grupo
    const grupos = new Map<string | number, typeof dados>();
    dados.forEach((d) => {
      const chave = d.empresaCod ?? 'total';
      if (!grupos.has(chave)) grupos.set(chave, [] as any);
      (grupos.get(chave) as any).push(d);
    });
    const result: Array<{ labelRef: string; labelComp: string; variacao: number | null }> = [];
    grupos.forEach((lista) => {
      const arr = [...lista].sort((a, b) => (a.ano - b.ano) || (a.mes - b.mes));
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Comparativo Mensal</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              fetchComparativo({
                empresa,
                meses,
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
        {/* Indicador */}
        <div className="flex flex-col gap-1.5 w-fit">
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

        {/* Meses selecionados */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Meses para comparar</Label>
          <div className="flex flex-wrap items-center gap-2">
            {meses.map((m, idx) => (
              <div
                key={idx}
                className="flex items-center gap-1.5 border border-border rounded-md px-2 py-1 bg-muted/30"
              >
                <Select
                  value={String(m.mes)}
                  onValueChange={(v) => updateMes(idx, { mes: Number(v) })}
                >
                  <SelectTrigger className="w-[120px] h-8 border-0 bg-transparent">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MESES.map((mes) => (
                      <SelectItem key={mes.value} value={String(mes.value)}>
                        {mes.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={String(m.ano)}
                  onValueChange={(v) => updateMes(idx, { ano: Number(v) })}
                >
                  <SelectTrigger className="w-[80px] h-8 border-0 bg-transparent">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {anosDisponiveis.map((ano) => (
                      <SelectItem key={ano} value={String(ano)}>
                        {ano}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {meses.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => removeMes(idx)}
                    aria-label="Remover mês"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
            {meses.length < MAX_MESES && (
              <Button variant="outline" size="sm" onClick={addMes}>
                <Plus className="h-4 w-4 mr-1" />
                Adicionar mês
              </Button>
            )}
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
                    angle={chartData.length > 4 ? -20 : 0}
                    textAnchor={chartData.length > 4 ? 'end' : 'middle'}
                    height={chartData.length > 4 ? 70 : 30}
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
                  <Bar dataKey="valor" radius={[6, 6, 0, 0]} maxBarSize={80}>
                    {chartData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                    <LabelList
                      dataKey="valor"
                      position="top"
                      formatter={(v: number) => formatValue(v, indicador)}
                      style={{ fontSize: 12, fontWeight: 600, fill: 'hsl(var(--foreground))' }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {variacoes.length > 0 && (
              <div className="flex flex-wrap gap-3 justify-center pt-2">
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
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                        isGood
                          ? 'bg-success-soft border-success/30'
                          : isNeutral
                            ? 'bg-muted border-border'
                            : 'bg-danger-soft border-danger/30'
                      }`}
                    >
                      {isPositive ? (
                        <TrendingUp className={`h-4 w-4 ${isGood ? 'text-success' : 'text-danger'}`} />
                      ) : isNegative ? (
                        <TrendingDown className={`h-4 w-4 ${isGood ? 'text-success' : 'text-danger'}`} />
                      ) : (
                        <Minus className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="text-sm font-medium">
                        {v.labelRef} vs {v.labelComp}:
                      </span>
                      <span
                        className={`text-sm font-bold ${
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
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Mês</th>
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
            <CalendarRange className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Selecione ao menos um mês para exibir o comparativo.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
