// src/components/ia/InlineInsight.tsx
// Insight inline para uso dentro de Sheets de detalhe

import { AlertTriangle, AlertCircle, TrendingUp, Info, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { InsightItem, InsightSeverity } from "@/types/iaInsights";
import { executeAction } from "@/lib/actionCatalog";

const SEVERITY_ICON: Record<InsightSeverity, React.ElementType> = {
  danger: AlertTriangle,
  warning: AlertCircle,
  opportunity: TrendingUp,
  info: Info,
};

const SEVERITY_BG: Record<InsightSeverity, string> = {
  danger: "bg-danger-soft border-danger/20",
  warning: "bg-warning-soft border-warning/20",
  opportunity: "bg-success-soft border-success/20",
  info: "bg-info-soft border-info/20",
};

interface InlineInsightProps {
  insight: InsightItem | null;
  loading?: boolean;
  className?: string;
}

export function InlineInsight({ insight, loading, className }: InlineInsightProps) {
  if (loading) {
    return (
      <div className={cn("flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 animate-pulse", className)}>
        <Sparkles className="h-3.5 w-3.5 text-primary/50" />
        <span className="text-xs text-muted-foreground">Analisando...</span>
      </div>
    );
  }

  if (!insight) return null;

  const Icon = SEVERITY_ICON[insight.severity];
  const bgClass = SEVERITY_BG[insight.severity];
  const color = insight.severity === "opportunity" ? "success" : insight.severity;

  return (
    <div className={cn("flex items-start gap-2.5 px-3 py-2.5 rounded-md border", bgClass, className)}>
      <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: `hsl(var(--${color}))` }} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium leading-tight">{insight.title}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{insight.summary}</p>
        {insight.actions.length > 0 && (
          <div className="flex gap-1 mt-1.5">
            {insight.actions.slice(0, 1).map(action => (
              <Button
                key={action.actionId}
                variant="ghost"
                size="sm"
                className="h-5 text-[11px] px-1.5 text-primary"
                onClick={() => executeAction(action)}
              >
                {action.label}
                <ChevronRight className="h-2.5 w-2.5 ml-0.5" />
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
