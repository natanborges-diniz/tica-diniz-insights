// src/components/ia/InsightsSheet.tsx
// Sheet completa com todos os insights do módulo

import { useState } from "react";
import { Sparkles, AlertTriangle, AlertCircle, TrendingUp, Info, ChevronRight, ChevronDown } from "lucide-react";
import { BaseSheet } from "@/components/system/BaseSheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { InsightItem, InsightSeverity } from "@/types/iaInsights";
import { executeAction } from "@/lib/actionCatalog";

const SEVERITY_ICON: Record<InsightSeverity, React.ElementType> = {
  danger: AlertTriangle,
  warning: AlertCircle,
  opportunity: TrendingUp,
  info: Info,
};

const SEVERITY_COLOR: Record<InsightSeverity, string> = {
  danger: "danger",
  warning: "warning",
  opportunity: "success",
  info: "info",
};

const SEVERITY_LABEL: Record<InsightSeverity, string> = {
  danger: "Crítico",
  warning: "Atenção",
  opportunity: "Oportunidade",
  info: "Informativo",
};

type FilterType = "all" | "danger" | "warning" | "opportunity";

function InsightRow({ insight }: { insight: InsightItem }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = SEVERITY_ICON[insight.severity];
  const color = SEVERITY_COLOR[insight.severity];

  return (
    <div className="p-4 rounded-lg border bg-card space-y-2">
      <div className="flex items-start gap-3">
        <Icon className="h-4 w-4 mt-0.5 shrink-0" style={{ color: `hsl(var(--${color}))` }} />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{insight.title}</span>
            <Badge
              variant="outline"
              className={cn("text-[10px] px-1.5 py-0", `bg-${color}-soft text-${color} border-${color}/20`)}
              style={{
                backgroundColor: `hsl(var(--${color}-soft))`,
                color: `hsl(var(--${color}))`,
                borderColor: `hsl(var(--${color}) / 0.2)`,
              }}
            >
              {SEVERITY_LABEL[insight.severity]}
            </Badge>
            {insight.confidence != null && (
              <span className="text-[10px] text-muted-foreground">{Math.round(insight.confidence * 100)}% confiança</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{insight.summary}</p>

          {insight.why && (
            <button
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mt-1"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Por quê?
            </button>
          )}
          {expanded && insight.why && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2 mt-1">{insight.why}</p>
          )}

          {insight.actions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1.5">
              {insight.actions.map(action => (
                <Button
                  key={action.actionId}
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => executeAction(action)}
                >
                  {action.label}
                  <ChevronRight className="h-3 w-3 ml-0.5" />
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface InsightsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  insights: InsightItem[];
}

export function InsightsSheet({ open, onOpenChange, insights }: InsightsSheetProps) {
  const [filter, setFilter] = useState<FilterType>("all");

  const filtered = filter === "all"
    ? insights
    : insights.filter(i => i.severity === filter);

  const counts = {
    danger: insights.filter(i => i.severity === "danger").length,
    warning: insights.filter(i => i.severity === "warning").length,
    opportunity: insights.filter(i => i.severity === "opportunity").length,
  };

  return (
    <BaseSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Insights Completos"
      description={`${insights.length} insights identificados`}
      headerExtra={
        <Badge variant="secondary" className="text-xs">
          <Sparkles className="h-3 w-3 mr-1" />
          IA
        </Badge>
      }
      size="wide"
    >
      <div className="space-y-4">
        {/* Filter chips */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={filter === "all" ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setFilter("all")}
          >
            Todos ({insights.length})
          </Button>
          {counts.danger > 0 && (
            <Button
              variant={filter === "danger" ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setFilter("danger")}
            >
              Críticos ({counts.danger})
            </Button>
          )}
          {counts.warning > 0 && (
            <Button
              variant={filter === "warning" ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setFilter("warning")}
            >
              Atenção ({counts.warning})
            </Button>
          )}
          {counts.opportunity > 0 && (
            <Button
              variant={filter === "opportunity" ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setFilter("opportunity")}
            >
              Oportunidades ({counts.opportunity})
            </Button>
          )}
        </div>

        <Separator />

        {/* Insight list */}
        <div className="space-y-3">
          {filtered.map(insight => (
            <InsightRow key={insight.id} insight={insight} />
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhum insight com este filtro
            </p>
          )}
        </div>
      </div>
    </BaseSheet>
  );
}
