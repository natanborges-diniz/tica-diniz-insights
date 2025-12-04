// src/components/os-dashboard/OsKpiCards.tsx

import React from "react";
import { OsMetrics } from "../../utils/osMetrics";
import { ClipboardList, Clock, AlertTriangle, CheckCircle, Timer, CalendarOff } from "lucide-react";

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
    {
      title: "Sem Previsão",
      value: metrics.semPrevisao,
      icon: CalendarOff,
      format: (v: number) => v.toLocaleString("pt-BR"),
      highlight: metrics.semPrevisao > 0,
      highlightColor: "warning",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
      {cards.map((card) => {
        const isWarning = card.highlight && (card as any).highlightColor === "warning";
        const isDestructive = card.highlight && !isWarning;

        return (
          <div
            key={card.title}
            className={`border border-border rounded-lg p-4 bg-card shadow-sm ${
              isDestructive ? "border-destructive bg-destructive/5" : ""
            } ${isWarning ? "border-amber-500 bg-amber-500/5" : ""}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <card.icon
                className={`h-4 w-4 ${
                  isDestructive ? "text-destructive" : isWarning ? "text-amber-500" : "text-muted-foreground"
                }`}
              />
              <span className="text-xs text-muted-foreground">{card.title}</span>
            </div>
            <div
              className={`text-2xl font-semibold ${
                isDestructive ? "text-destructive" : isWarning ? "text-amber-600" : ""
              }`}
            >
              {loading ? "..." : card.format(card.value as any)}
            </div>
          </div>
        );
      })}
    </div>
  );
};
