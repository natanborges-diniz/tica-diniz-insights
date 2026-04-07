// src/components/financeiro-dre/DreResumoCards.tsx

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, DollarSign, Package, Wallet } from "lucide-react";
import { DreResumo } from "@/services/financeiroDreService";

interface Props {
  resumo: DreResumo;
  resumoRealizado?: DreResumo;
  modo?: "realizado" | "projetado";
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function DreResumoCards({ resumo, resumoRealizado, modo = "realizado" }: Props) {
  const isProjetado = modo === "projetado" && resumoRealizado;

  const cards = [
    {
      title: "Receita Líquida",
      value: resumo.receitaLiquida,
      realizadoValue: resumoRealizado?.receitaLiquida,
      icon: DollarSign,
      color: "text-blue-500",
    },
    {
      title: "CMV",
      value: resumo.custoMercadoria,
      realizadoValue: resumoRealizado?.custoMercadoria,
      icon: Package,
      color: "text-orange-500",
    },
    {
      title: "Lucro Bruto",
      value: resumo.lucroBruto,
      realizadoValue: resumoRealizado?.lucroBruto,
      icon: TrendingUp,
      color: resumo.lucroBruto >= 0 ? "text-green-500" : "text-destructive",
    },
    {
      title: "Despesas Operacionais",
      value: resumo.despesasOperacionais,
      realizadoValue: resumoRealizado?.despesasOperacionais,
      icon: TrendingDown,
      color: "text-destructive",
    },
    {
      title: "Resultado Líquido",
      value: resumo.resultadoLiquido,
      realizadoValue: resumoRealizado?.resultadoLiquido,
      icon: Wallet,
      color: resumo.resultadoLiquido >= 0 ? "text-green-500" : "text-destructive",
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
            <div className={`text-2xl font-bold ${card.value < 0 ? "text-destructive" : ""}`}>
              {formatCurrency(card.value)}
            </div>
            {isProjetado && card.realizadoValue !== undefined && (
              <p className="text-xs text-muted-foreground mt-1">
                {formatCurrency(card.realizadoValue)} realizado
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
