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
  highlight?: "default" | "blue" | "green" | "amber" | "destructive";
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
      highlight: "blue",
    },
    {
      title: "Entregues",
      value: metrics.entregues,
      icon: CheckCircle2,
      filterValue: "ENTREGUE",
      highlight: "green",
    },
    {
      title: "Atrasadas",
      value: metrics.atrasadas,
      icon: AlertTriangle,
      filterValue: "ATRASADAS",
      highlight: "destructive",
    },
    {
      title: "Sem Previsão",
      value: metrics.semPrevisao,
      icon: Calendar,
      filterValue: "SEM_DATA",
      highlight: "amber",
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
      case "blue":
        return cn(base, isActive && "ring-blue-500");
      case "green":
        return cn(base, isActive && "ring-green-500");
      case "amber":
        return cn(base, isActive && "ring-amber-500");
      case "destructive":
        return cn(base, isActive && "ring-destructive");
      default:
        return cn(base, isActive && "ring-primary");
    }
  };

  const getIconStyles = (highlight: string) => {
    switch (highlight) {
      case "blue":
        return "text-blue-500";
      case "green":
        return "text-green-500";
      case "amber":
        return "text-amber-500";
      case "destructive":
        return "text-destructive";
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
