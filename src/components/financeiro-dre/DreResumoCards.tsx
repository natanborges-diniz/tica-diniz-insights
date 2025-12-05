// src/components/financeiro-dre/DreResumoCards.tsx

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, DollarSign, Package, Wallet } from "lucide-react";
import { DreResumo } from "@/services/financeiroDreService";

interface Props {
  resumo: DreResumo;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function DreResumoCards({ resumo }: Props) {
  const cards = [
    {
      title: "Receita Líquida",
      value: resumo.receitaLiquida,
      icon: DollarSign,
      color: "text-blue-500",
    },
    {
      title: "CMV",
      value: resumo.custoMercadoria,
      icon: Package,
      color: "text-orange-500",
    },
    {
      title: "Lucro Bruto",
      value: resumo.lucroBruto,
      icon: TrendingUp,
      color: resumo.lucroBruto >= 0 ? "text-green-500" : "text-red-500",
    },
    {
      title: "Despesas Operacionais",
      value: resumo.despesasOperacionais,
      icon: TrendingDown,
      color: "text-red-500",
    },
    {
      title: "Resultado Líquido",
      value: resumo.resultadoLiquido,
      icon: Wallet,
      color: resumo.resultadoLiquido >= 0 ? "text-green-500" : "text-red-500",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
            <card.icon className={`h-4 w-4 ${card.color}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${card.value < 0 ? "text-red-500" : ""}`}>
              {formatCurrency(card.value)}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
