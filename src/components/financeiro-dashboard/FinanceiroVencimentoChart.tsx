// src/components/financeiro-dashboard/FinanceiroVencimentoChart.tsx

import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FinanceiroParcela } from "../../services/financeiroService";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface FinanceiroVencimentoChartProps {
  data: FinanceiroParcela[];
}

interface ChartDataPoint {
  data: string;
  receber: number;
  pagar: number;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function FinanceiroVencimentoChart({ data }: FinanceiroVencimentoChartProps) {
  const chartData = useMemo(() => {
    const groupedByDate: Record<string, { receber: number; pagar: number }> = {};

    for (const p of data) {
      if (!p.dataVencimento) continue;

      const dateKey = p.dataVencimento.toISOString().split("T")[0];

      if (!groupedByDate[dateKey]) {
        groupedByDate[dateKey] = { receber: 0, pagar: 0 };
      }

      if (p.tipoLancamento === "RECEBER") {
        groupedByDate[dateKey].receber += p.valor;
      } else {
        groupedByDate[dateKey].pagar += p.valor;
      }
    }

    // Ordenar por data e formatar
    const sortedDates = Object.keys(groupedByDate).sort();

    return sortedDates.map((dateKey): ChartDataPoint => {
      const [year, month, day] = dateKey.split("-");
      return {
        data: `${day}/${month}`,
        receber: groupedByDate[dateKey].receber,
        pagar: groupedByDate[dateKey].pagar,
      };
    });
  }, [data]);

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vencimentos por Dia</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px] flex items-center justify-center">
          <p className="text-muted-foreground">Sem dados para exibir</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Vencimentos por Dia</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="data"
              tick={{ fontSize: 12 }}
              className="text-muted-foreground"
            />
            <YAxis
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => formatCurrency(value)}
              className="text-muted-foreground"
            />
            <Tooltip
              formatter={(value: number) => formatCurrency(value)}
              labelFormatter={(label) => `Data: ${label}`}
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "6px",
              }}
            />
            <Legend />
            <Bar
              dataKey="receber"
              name="A Receber"
              fill="hsl(142, 76%, 36%)"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="pagar"
              name="A Pagar"
              fill="hsl(221, 83%, 53%)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
