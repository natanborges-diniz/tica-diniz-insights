// src/components/financeiro-fluxo/FluxoCaixaChart.tsx

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
  Line,
  ComposedChart,
} from "recharts";
import { FluxoCaixaItem } from "@/hooks/useFluxoCaixa";

interface Props {
  data: FluxoCaixaItem[];
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function FluxoCaixaChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Fluxo de Caixa</CardTitle>
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
        <CardTitle>Fluxo de Caixa por Período</CardTitle>
      </CardHeader>
      <CardContent className="h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="periodo" 
              tick={{ fontSize: 12 }}
              angle={-45}
              textAnchor="end"
              height={60}
            />
            <YAxis tickFormatter={(val) => formatCurrency(val)} width={100} />
            <Tooltip
              formatter={(value: number) => formatCurrency(value)}
              labelFormatter={(label) => `Período: ${label}`}
            />
            <Legend />
            <ReferenceLine y={0} stroke="#666" />
            <Bar
              dataKey="totalReceber"
              name="A Receber"
              fill="hsl(142, 76%, 36%)"
              opacity={0.8}
            />
            <Bar
              dataKey="totalPagar"
              name="A Pagar"
              fill="hsl(0, 84%, 60%)"
              opacity={0.8}
            />
            <Line
              type="monotone"
              dataKey="saldo"
              name="Saldo"
              stroke="hsl(217, 91%, 60%)"
              strokeWidth={3}
              dot={{ fill: "hsl(217, 91%, 60%)" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
