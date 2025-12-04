// src/components/os-dashboard/OsKpiCards.tsx

import React from "react";
import { OsMetrics } from "../../utils/osMetrics";
import { ClipboardList, Clock, AlertTriangle, CheckCircle, Timer } from "lucide-react";

type Props = {
  metrics: OsMetrics;
  loading?: boolean;
};

export const OsKpiCards: React.FC<Props> = ({ metrics, loading }) => {
  const cards = [
    {
      title: "Total de OS",
      value: metrics.totalOs,
      icon: ClipboardList,
      format: (v: number) => v.toLocaleString("pt-BR"),
    },
    {
      title: "Em Produção",
      value: metrics.emProducao,
      icon: Clock,
      format: (v: number) => v.toLocaleString("pt-BR"),
    },
    {
      title: "Atrasadas",
      value: metrics.atrasadas,
      icon: AlertTriangle,
      format: (v: number) => v.toLocaleString("pt-BR"),
      highlight: metrics.atrasadas > 0,
    },
    {
      title: "Entregues",
      value: metrics.entreguesNoPeriodo,
      icon: CheckCircle,
      format: (v: number) => v.toLocaleString("pt-BR"),
    },
    {
      title: "Tempo Médio (dias)",
      value: metrics.tempoMedioCicloDias,
      icon: Timer,
      format: (v: number | null) => (v !== null ? v.toFixed(1) : "-"),
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {cards.map((card) => (
        <div
          key={card.title}
          className={`border border-border rounded-lg p-4 bg-card shadow-sm ${
            card.highlight ? "border-destructive bg-destructive/5" : ""
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <card.icon className={`h-4 w-4 ${card.highlight ? "text-destructive" : "text-muted-foreground"}`} />
            <span className="text-xs text-muted-foreground">{card.title}</span>
          </div>
          <div className={`text-2xl font-semibold ${card.highlight ? "text-destructive" : ""}`}>
            {loading ? "..." : card.format(card.value as any)}
          </div>
        </div>
      ))}
    </div>
  );
};
