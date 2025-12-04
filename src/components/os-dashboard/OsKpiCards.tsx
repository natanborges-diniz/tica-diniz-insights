// src/components/os-dashboard/OsKpiCards.tsx

import React from "react";
import { OsMetrics } from "../../utils/osMetrics";
import { OsFilterState } from "../../hooks/useOsMonitor";
import {
  ClipboardList,
  Clock,
  AlertTriangle,
  CheckCircle,
  Timer,
  CalendarOff,
  Wrench,
  ShoppingCart,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  metrics: OsMetrics;
  filters: OsFilterState;
  onChangeFilters: (next: Partial<OsFilterState>) => void;
  loading?: boolean;
};

export const OsKpiCards: React.FC<Props> = ({ metrics, filters, onChangeFilters, loading }) => {
  const cards = [
    {
      title: "Total de OS",
      value: metrics.totalOs,
      icon: ClipboardList,
      format: (v: number) => v.toLocaleString("pt-BR"),
      isActive: filters.status === "TODOS" && !filters.somenteReparo && !filters.somenteEcommerce && !filters.somenteSemPrevisao,
      onClick: () =>
        onChangeFilters({
          status: "TODOS",
          somenteReparo: false,
          somenteEcommerce: false,
          somenteSemPrevisao: false,
        }),
    },
    {
      title: "Em Produção",
      value: metrics.emProducao,
      icon: Clock,
      format: (v: number) => v.toLocaleString("pt-BR"),
      isActive: filters.status === "EM_ANDAMENTO",
      onClick: () =>
        onChangeFilters({
          status: "EM_ANDAMENTO",
          somenteReparo: false,
          somenteEcommerce: false,
          somenteSemPrevisao: false,
        }),
    },
    {
      title: "Atrasadas",
      value: metrics.atrasadas,
      icon: AlertTriangle,
      format: (v: number) => v.toLocaleString("pt-BR"),
      highlight: metrics.atrasadas > 0,
      highlightColor: "destructive",
      isActive: filters.status === "ATRASADAS",
      onClick: () =>
        onChangeFilters({
          status: "ATRASADAS",
          somenteReparo: false,
          somenteEcommerce: false,
          somenteSemPrevisao: false,
        }),
    },
    {
      title: "Entregues",
      value: metrics.entreguesNoPeriodo,
      icon: CheckCircle,
      format: (v: number) => v.toLocaleString("pt-BR"),
      isActive: filters.status === "ENTREGUES",
      onClick: () =>
        onChangeFilters({
          status: "ENTREGUES",
          somenteReparo: false,
          somenteEcommerce: false,
          somenteSemPrevisao: false,
        }),
    },
    {
      title: "Tempo Médio (dias)",
      value: metrics.tempoMedioCicloDias,
      icon: Timer,
      format: (v: number | null) => (v !== null ? v.toFixed(1) : "-"),
      isActive: false,
      onClick: undefined,
    },
    {
      title: "Sem Previsão",
      value: metrics.semPrevisao,
      icon: CalendarOff,
      format: (v: number) => v.toLocaleString("pt-BR"),
      highlight: metrics.semPrevisao > 0,
      highlightColor: "warning",
      isActive: filters.somenteSemPrevisao,
      onClick: () =>
        onChangeFilters({
          status: "TODOS",
          somenteSemPrevisao: true,
          somenteReparo: false,
          somenteEcommerce: false,
        }),
    },
    {
      title: "Reparo",
      value: metrics.reparo,
      icon: Wrench,
      format: (v: number) => v.toLocaleString("pt-BR"),
      highlightColor: "amber",
      isActive: filters.somenteReparo,
      onClick: () =>
        onChangeFilters({
          status: "TODOS",
          somenteReparo: true,
          somenteEcommerce: false,
          somenteSemPrevisao: false,
        }),
    },
    {
      title: "E-commerce",
      value: metrics.ecommerce,
      icon: ShoppingCart,
      format: (v: number) => v.toLocaleString("pt-BR"),
      highlightColor: "blue",
      isActive: filters.somenteEcommerce,
      onClick: () =>
        onChangeFilters({
          status: "TODOS",
          somenteEcommerce: true,
          somenteReparo: false,
          somenteSemPrevisao: false,
        }),
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
      {cards.map((card) => {
        const isWarning = card.highlight && card.highlightColor === "warning";
        const isDestructive = card.highlight && card.highlightColor === "destructive";
        const isAmber = card.highlightColor === "amber";
        const isBlue = card.highlightColor === "blue";
        const isClickable = !!card.onClick;

        return (
          <div
            key={card.title}
            onClick={card.onClick}
            className={cn(
              "border border-border rounded-lg p-4 bg-card shadow-sm transition-all",
              isClickable && "cursor-pointer hover:shadow-md hover:border-primary/50",
              card.isActive && "ring-2 ring-primary border-primary bg-primary/5",
              isDestructive && "border-destructive bg-destructive/5",
              isWarning && "border-amber-500 bg-amber-500/5",
              isAmber && !card.isActive && "border-amber-400/50",
              isBlue && !card.isActive && "border-blue-400/50"
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <card.icon
                className={cn(
                  "h-4 w-4",
                  isDestructive
                    ? "text-destructive"
                    : isWarning
                    ? "text-amber-500"
                    : isAmber
                    ? "text-amber-600"
                    : isBlue
                    ? "text-blue-600"
                    : "text-muted-foreground"
                )}
              />
              <span className="text-xs text-muted-foreground">{card.title}</span>
            </div>
            <div
              className={cn(
                "text-2xl font-semibold",
                isDestructive && "text-destructive",
                isWarning && "text-amber-600",
                isAmber && "text-amber-700",
                isBlue && "text-blue-700"
              )}
            >
              {loading ? "..." : card.format(card.value as any)}
            </div>
          </div>
        );
      })}
    </div>
  );
};
