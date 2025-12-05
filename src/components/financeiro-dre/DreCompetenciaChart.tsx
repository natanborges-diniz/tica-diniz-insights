// src/components/financeiro-dre/DreCompetenciaChart.tsx

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { DreCompetenciaData } from "@/hooks/useFinanceiroDre";

interface Props {
  data: DreCompetenciaData[];
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function DreCompetenciaChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Resultado por Competência</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px] flex items-center justify-center text-muted-foreground">
          Selecione uma empresa para visualizar o gráfico
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resultado por Competência</CardTitle>
      </CardHeader>
      <CardContent className="h-[350px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="competencia" />
            <YAxis tickFormatter={(val) => formatCurrency(val)} width={100} />
            <Tooltip
              formatter={(value: number) => formatCurrency(value)}
              labelFormatter={(label) => `Competência: ${label}`}
            />
            <Legend />
            <ReferenceLine y={0} stroke="#666" />
            <Bar
              dataKey="receitaLiquida"
              name="Receita Líquida"
              fill="hsl(var(--chart-1))"
            />
            <Bar
              dataKey="lucroBruto"
              name="Lucro Bruto"
              fill="hsl(var(--chart-2))"
            />
            <Bar
              dataKey="resultadoLiquido"
              name="Resultado Líquido"
              fill="hsl(var(--chart-3))"
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
