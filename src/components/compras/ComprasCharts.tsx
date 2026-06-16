import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart, Line, Legend, LabelList, Cell,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { ComprasNota } from "@/services/comprasService";

interface Props {
  notas: ComprasNota[];
}

const CHART_COLORS = [
  "hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))",
  "hsl(var(--chart-5))", "hsl(var(--chart-6))", "hsl(var(--chart-7))", "hsl(var(--chart-8))",
];

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtBRLShort = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`;
  return `R$ ${v.toFixed(0)}`;
};
const fmtInt = (v: number) => v.toLocaleString("pt-BR");

const tooltipStyle = {
  backgroundColor: "hsl(var(--background))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
};

export function ComprasCharts({ notas }: Props) {
  const [tab, setTab] = useState<"top" | "evolucao" | "abc" | "loja">("top");
  const [topN, setTopN] = useState(10);

  const porFornecedor = useMemo(() => {
    const m = new Map<string, { valor: number; notas: number }>();
    for (const n of notas) {
      const x = m.get(n.fornecedor) || { valor: 0, notas: 0 };
      x.valor += n.valorTotal;
      x.notas += 1;
      m.set(n.fornecedor, x);
    }
    return Array.from(m.entries())
      .map(([fornecedor, v]) => ({
        fornecedor,
        fornecedorShort: fornecedor.length > 22 ? fornecedor.substring(0, 22) + "…" : fornecedor,
        valor: v.valor,
        notas: v.notas,
      }))
      .sort((a, b) => b.valor - a.valor);
  }, [notas]);

  const topData = porFornecedor.slice(0, topN);

  const evolucao = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    const topForn = porFornecedor.slice(0, 5).map(x => x.fornecedor);
    for (const n of notas) {
      if (!topForn.includes(n.fornecedor)) continue;
      const mesMap = m.get(n.mes) || new Map<string, number>();
      mesMap.set(n.fornecedor, (mesMap.get(n.fornecedor) || 0) + n.valorTotal);
      m.set(n.mes, mesMap);
    }
    return Array.from(m.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([mes, vals]) => {
        const row: any = { mes };
        topForn.forEach(f => { row[f] = vals.get(f) || 0; });
        return row;
      });
  }, [notas, porFornecedor]);

  const topForn5 = porFornecedor.slice(0, 5).map(x => x.fornecedor);

  const abcData = useMemo(() => {
    const total = porFornecedor.reduce((a, b) => a + b.valor, 0);
    let acc = 0;
    return porFornecedor.slice(0, 20).map(f => {
      acc += f.valor;
      const pctAcc = total > 0 ? (acc / total) * 100 : 0;
      const faixa = pctAcc <= 80 ? "A" : pctAcc <= 95 ? "B" : "C";
      return { ...f, pctAcc, faixa };
    });
  }, [porFornecedor]);

  const lojaData = useMemo(() => {
    const top = porFornecedor.slice(0, 5).map(x => x.fornecedor);
    const lojaMap = new Map<string, Map<string, number>>();
    for (const n of notas) {
      if (!top.includes(n.fornecedor)) continue;
      const m = lojaMap.get(n.empresaNome) || new Map<string, number>();
      m.set(n.fornecedor, (m.get(n.fornecedor) || 0) + n.valorTotal);
      lojaMap.set(n.empresaNome, m);
    }
    return Array.from(lojaMap.entries()).map(([loja, vals]) => {
      const row: any = { loja, lojaShort: loja.length > 18 ? loja.substring(0, 18) + "…" : loja };
      top.forEach(f => { row[f] = vals.get(f) || 0; });
      return row;
    });
  }, [notas, porFornecedor]);

  const heightTop = Math.max(360, topData.length * 36);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="h-5 w-5 text-primary" />
            Análise gráfica de compras
          </CardTitle>
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList>
              <TabsTrigger value="top">Top Fornecedores</TabsTrigger>
              <TabsTrigger value="evolucao">Evolução mensal</TabsTrigger>
              <TabsTrigger value="abc">Curva ABC</TabsTrigger>
              <TabsTrigger value="loja">Loja × Fornecedor</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        {tab === "top" && (
          <>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-muted-foreground">Top N:</span>
              {[5, 10, 20].map(n => (
                <button
                  key={n}
                  onClick={() => setTopN(n)}
                  className={`text-xs px-2 py-1 rounded ${topN === n ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                >{n}</button>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={Math.max(380, heightTop)}>
              <ComposedChart data={topData} margin={{ left: 10, right: 70, top: 10, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="fornecedorShort" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  interval={0} angle={-30} textAnchor="end" height={70} />
                <YAxis yAxisId="left" tickFormatter={fmtBRLShort} tick={{ fontSize: 11, fill: "hsl(var(--chart-1))" }} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={fmtInt}
                  tick={{ fontSize: 11, fill: "hsl(var(--chart-3))" }} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: number, name: string) =>
                    name === "valor" ? [fmtBRL(value), "Valor"] : [`${fmtInt(value)} notas`, "Notas"]
                  }
                  labelFormatter={(_, p) => p?.[0]?.payload?.fornecedor || ""}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="left" dataKey="valor" name="Valor" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="valor" position="top" formatter={fmtBRLShort}
                    style={{ fontSize: 10, fill: "hsl(var(--chart-1))", fontWeight: 600 }} />
                </Bar>
                <Line yAxisId="right" type="monotone" dataKey="notas" name="Notas"
                  stroke="hsl(var(--chart-3))" strokeWidth={2.5} dot={{ r: 4 }}>
                  <LabelList dataKey="notas" position="top" formatter={fmtInt}
                    style={{ fontSize: 10, fill: "hsl(var(--chart-3))", fontWeight: 600 }} />
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
          </>
        )}

        {tab === "evolucao" && (
          <ResponsiveContainer width="100%" height={420}>
            <BarChart data={evolucao} margin={{ left: 10, right: 20, top: 10, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" height={60} />
              <YAxis tickFormatter={fmtBRLShort} tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtBRL(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {topForn5.map((f, i) => (
                <Bar key={f} dataKey={f} stackId="a" fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}

        {tab === "abc" && (
          <ResponsiveContainer width="100%" height={420}>
            <ComposedChart data={abcData} margin={{ left: 10, right: 50, top: 10, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="fornecedorShort" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={70} interval={0} />
              <YAxis yAxisId="left" tickFormatter={fmtBRLShort} tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v.toFixed(0)}%`}
                domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle}
                formatter={(v: number, name: string) => name === "valor" ? [fmtBRL(v), "Valor"] : [`${v.toFixed(1)}%`, "% acum."]}
                labelFormatter={(_, p) => p?.[0]?.payload?.fornecedor || ""} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="left" dataKey="valor" name="Valor">
                {abcData.map((d, i) => (
                  <Cell key={i} fill={d.faixa === "A" ? "hsl(var(--chart-1))" : d.faixa === "B" ? "hsl(var(--chart-3))" : "hsl(var(--chart-5))"} />
                ))}
                <LabelList dataKey="faixa" position="top" style={{ fontSize: 10, fontWeight: 700 }} />
              </Bar>
              <Line yAxisId="right" type="monotone" dataKey="pctAcc" name="% acumulado"
                stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {tab === "loja" && (
          <ResponsiveContainer width="100%" height={Math.max(360, lojaData.length * 60)}>
            <BarChart data={lojaData} layout="vertical" margin={{ left: 20, right: 50, top: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke="hsl(var(--border))" />
              <XAxis type="number" tickFormatter={fmtBRLShort} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="lojaShort" width={140} tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtBRL(v)}
                labelFormatter={(_, p) => p?.[0]?.payload?.loja || ""} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {topForn5.map((f, i) => (
                <Bar key={f} dataKey={f} stackId="a" fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
