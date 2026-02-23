// src/components/ia/ModuleInsightsPanel.tsx
// Painel de insights IA embutido em cada módulo

import { useState } from "react";
import { Sparkles, ChevronRight, AlertTriangle, Info, TrendingUp, AlertCircle, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { InsightItem } from "@/types/iaInsights";
import { executeAction } from "@/lib/actionCatalog";
import { InsightsSheet } from "./InsightsSheet";

const SEVERITY_CONFIG: Record<string, { icon: React.ElementType; badgeClass: string; label: string }> = {
  danger: { icon: AlertTriangle, badgeClass: "bg-danger-soft text-danger border-danger/20", label: "Crítico" },
  warning: { icon: AlertCircle, badgeClass: "bg-warning-soft text-warning-foreground border-warning/20", label: "Atenção" },
  opportunity: { icon: TrendingUp, badgeClass: "bg-success-soft text-success border-success/20", label: "Oportunidade" },
  info: { icon: Info, badgeClass: "bg-info-soft text-info border-info/20", label: "Info" },
};

function InsightCard({ insight }: { insight: InsightItem }) {
  const config = SEVERITY_CONFIG[insight.severity] || SEVERITY_CONFIG.info;
  const Icon = config.icon;

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors">
      <div className="shrink-0 mt-0.5">
        <Icon className="h-4 w-4" style={{ color: `hsl(var(--${insight.severity === "opportunity" ? "success" : insight.severity === "danger" ? "danger" : insight.severity === "warning" ? "warning" : "info"}))` }} />
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium leading-tight">{insight.title}</span>
          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 shrink-0", config.badgeClass)}>
            {config.label}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{insight.summary}</p>
        {insight.actions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {insight.actions.slice(0, 2).map(action => (
              <Button
                key={action.actionId}
                variant="ghost"
                size="sm"
                className="h-6 text-xs px-2 text-primary hover:text-primary"
                onClick={(e) => {
                  e.stopPropagation();
                  executeAction(action);
                }}
              >
                {action.label}
                <ChevronRight className="h-3 w-3 ml-0.5" />
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface ModuleInsightsPanelProps {
  insights: InsightItem[];
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  maxVisible?: number;
  className?: string;
}

export function ModuleInsightsPanel({
  insights,
  loading,
  error,
  onRetry,
  maxVisible = 3,
  className,
}: ModuleInsightsPanelProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  if (loading) {
    return (
      <Card className={cn("border-l-4 border-l-primary", className)}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary animate-pulse" />
            <CardTitle className="text-sm font-semibold">Insights do dia</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-start gap-3 p-3">
              <Skeleton className="h-4 w-4 rounded shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={cn("border-l-4 border-l-danger", className)}>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4 text-danger" />
              <span>Não foi possível carregar insights</span>
            </div>
            {onRetry && (
              <Button variant="ghost" size="sm" onClick={onRetry} className="h-7 text-xs">
                <RefreshCw className="h-3 w-3 mr-1" />
                Tentar novamente
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (insights.length === 0) {
    return (
      <Card className={cn("border-l-4 border-l-primary/30", className)}>
        <CardContent className="py-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4 text-primary/50" />
            <span>Nenhum insight relevante no período</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const visible = insights.slice(0, maxVisible);
  const hasMore = insights.length > maxVisible;

  return (
    <>
      <Card className={cn("border-l-4 border-l-primary", className)}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-semibold">Insights do dia</CardTitle>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {insights.length}
              </Badge>
            </div>
            {hasMore && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSheetOpen(true)}>
                Ver mais
                <ChevronRight className="h-3 w-3 ml-0.5" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          {visible.map(insight => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </CardContent>
      </Card>

      <InsightsSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        insights={insights}
      />
    </>
  );
}
