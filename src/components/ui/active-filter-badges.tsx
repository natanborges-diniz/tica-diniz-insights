// src/components/ui/active-filter-badges.tsx

import { X, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChartFilter } from "@/hooks/useChartFilter";
import { cn } from "@/lib/utils";

interface ActiveFilterBadgesProps<T = string> {
  filters: ChartFilter<T>[];
  onRemove: (field: string, value: T) => void;
  onClearAll: () => void;
  className?: string;
  fieldLabels?: Record<string, string>;
}

export function ActiveFilterBadges<T = string>({
  filters,
  onRemove,
  onClearAll,
  className,
  fieldLabels = {},
}: ActiveFilterBadgesProps<T>) {
  if (filters.length === 0) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 p-3 bg-primary/5 rounded-lg border border-primary/20",
        className
      )}
    >
      <div className="flex items-center gap-1.5 text-sm font-medium text-primary">
        <Filter className="h-4 w-4" />
        <span>Filtros ativos:</span>
      </div>
      
      <div className="flex flex-wrap gap-2">
        {filters.map((filter, index) => (
          <Badge
            key={`${filter.field}-${index}`}
            variant="secondary"
            className="pl-2 pr-1 py-1 gap-1 bg-primary/10 hover:bg-primary/20 text-primary cursor-pointer transition-colors"
            onClick={() => onRemove(filter.field, filter.value as T)}
          >
            <span className="text-xs text-muted-foreground">
              {fieldLabels[filter.field] || filter.field}:
            </span>
            <span className="font-medium">{filter.label}</span>
            <X className="h-3 w-3 ml-1 hover:text-destructive" />
          </Badge>
        ))}
      </div>

      {filters.length > 1 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearAll}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
        >
          Limpar todos
        </Button>
      )}
    </div>
  );
}
