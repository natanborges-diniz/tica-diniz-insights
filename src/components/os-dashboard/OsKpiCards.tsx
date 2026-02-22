// src/components/os-dashboard/OsKpiCards.tsx

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { 
  ClipboardList, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  Calendar,
  Timer
} from "lucide-react";
import { OsMetrics } from "@/utils/osMetrics";
import { OsFilterState, OsStatusFilter } from "@/hooks/useOsMonitor";
import { cn } from "@/lib/utils";

interface Props {
  metrics: OsMetrics;
  filters: OsFilterState;
  onChangeFilters: (next: Partial<OsFilterState>) => void;
  loading?: boolean;
}

interface KpiCardConfig {
  title: string;
  value: number | string;
  icon: React.ElementType;
  filterValue?: OsStatusFilter;
  highlight?: "default" | "info" | "success" | "warning" | "danger";
}

export const OsKpiCards: React.FC<Props> = ({
  metrics,
  filters,
  onChangeFilters,
  loading,
}) => {
  const cards: KpiCardConfig[] = [
    {
      title: "Total de OS",
      value: metrics.totalOs,
      icon: ClipboardList,
      filterValue: "TODOS",
      highlight: "default",
    },
    {
      title: "Em Andamento",
      value: metrics.emAndamento,
      icon: Clock,
      filterValue: "NO_PRAZO",
      highlight: "info",
    },
    {
      title: "Entregues",
      value: metrics.entregues,
      icon: CheckCircle2,
      filterValue: "ENTREGUE",
      highlight: "success",
    },
    {
      title: "Atrasadas",
      value: metrics.atrasadas,
      icon: AlertTriangle,
      filterValue: "ATRASADAS",
      highlight: "danger",
    },
    {
      title: "Sem Previsão",
      value: metrics.semPrevisao,
      icon: Calendar,
      filterValue: "SEM_DATA",
      highlight: "warning",
    },
    {
      title: "Tempo Médio (dias)",
      value: metrics.tempoMedioCicloDias ?? "-",
      icon: Timer,
      highlight: "default",
    },
  ];

  const getHighlightStyles = (highlight: string, isActive: boolean) => {
    const base = isActive ? "ring-2 ring-offset-2" : "";
    switch (highlight) {
      case "info":
        return cn(base, isActive && "ring-info");
      case "success":
        return cn(base, isActive && "ring-success");
      case "warning":
        return cn(base, isActive && "ring-warning");
      case "danger":
        return cn(base, isActive && "ring-danger");
      default:
        return cn(base, isActive && "ring-primary");
    }
  };

  const getIconStyles = (highlight: string) => {
    switch (highlight) {
      case "info":
        return "text-info";
      case "success":
        return "text-success";
      case "warning":
        return "text-warning";
      case "danger":
        return "text-danger";
      default:
        return "text-primary";
    }
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        const isActive = card.filterValue !== undefined && filters.status === card.filterValue;
        const isClickable = card.filterValue !== undefined;

        return (
          <Card
            key={card.title}
            className={cn(
              "transition-all duration-200",
              isClickable && "cursor-pointer hover:shadow-md",
              getHighlightStyles(card.highlight ?? "default", isActive)
            )}
            onClick={() => {
              if (isClickable && card.filterValue) {
                onChangeFilters({ status: card.filterValue });
              }
            }}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Icon className={cn("h-5 w-5", getIconStyles(card.highlight ?? "default"))} />
              </div>
              <div className="text-2xl font-bold">
                {loading ? "..." : card.value}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{card.title}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
