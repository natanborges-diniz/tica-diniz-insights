// src/hooks/useChartFilter.ts
// Hook reutilizável para gerenciar filtros interativos de gráficos

import { useState, useCallback, useMemo } from "react";

export interface ChartFilter<T = string> {
  field: string;
  value: T | null;
  label: string;
}

export interface UseChartFilterOptions<T = string> {
  /** Permite selecionar múltiplos valores */
  multiSelect?: boolean;
  /** Callback quando filtro mudar */
  onChange?: (filters: ChartFilter<T>[]) => void;
}

export interface UseChartFilterReturn<T = string> {
  /** Filtros ativos */
  activeFilters: ChartFilter<T>[];
  /** Verifica se um valor está selecionado */
  isSelected: (field: string, value: T) => boolean;
  /** Toggle de seleção (clique no gráfico) */
  toggleFilter: (field: string, value: T, label?: string) => void;
  /** Limpa um filtro específico */
  clearFilter: (field: string) => void;
  /** Limpa todos os filtros */
  clearAllFilters: () => void;
  /** Verifica se há filtros ativos */
  hasActiveFilters: boolean;
  /** Obtém o valor filtrado para um campo */
  getFilterValue: (field: string) => T | null;
  /** Obtém todos os valores filtrados para um campo (multiSelect) */
  getFilterValues: (field: string) => T[];
}

export function useChartFilter<T = string>(
  options: UseChartFilterOptions<T> = {}
): UseChartFilterReturn<T> {
  const { multiSelect = false, onChange } = options;
  const [activeFilters, setActiveFilters] = useState<ChartFilter<T>[]>([]);

  const isSelected = useCallback(
    (field: string, value: T): boolean => {
      return activeFilters.some(
        (f) => f.field === field && f.value === value
      );
    },
    [activeFilters]
  );

  const toggleFilter = useCallback(
    (field: string, value: T, label?: string) => {
      setActiveFilters((prev) => {
        const existingIndex = prev.findIndex(
          (f) => f.field === field && f.value === value
        );

        let newFilters: ChartFilter<T>[];

        if (existingIndex >= 0) {
          // Remove se já existe (toggle off)
          newFilters = prev.filter((_, i) => i !== existingIndex);
        } else if (multiSelect) {
          // Adiciona ao array existente
          newFilters = [...prev, { field, value, label: label || String(value) }];
        } else {
          // Substitui o filtro do mesmo campo
          newFilters = [
            ...prev.filter((f) => f.field !== field),
            { field, value, label: label || String(value) },
          ];
        }

        onChange?.(newFilters);
        return newFilters;
      });
    },
    [multiSelect, onChange]
  );

  const clearFilter = useCallback(
    (field: string) => {
      setActiveFilters((prev) => {
        const newFilters = prev.filter((f) => f.field !== field);
        onChange?.(newFilters);
        return newFilters;
      });
    },
    [onChange]
  );

  const clearAllFilters = useCallback(() => {
    setActiveFilters([]);
    onChange?.([]);
  }, [onChange]);

  const hasActiveFilters = useMemo(
    () => activeFilters.length > 0,
    [activeFilters]
  );

  const getFilterValue = useCallback(
    (field: string): T | null => {
      const filter = activeFilters.find((f) => f.field === field);
      return filter?.value ?? null;
    },
    [activeFilters]
  );

  const getFilterValues = useCallback(
    (field: string): T[] => {
      return activeFilters
        .filter((f) => f.field === field)
        .map((f) => f.value)
        .filter((v): v is T => v !== null);
    },
    [activeFilters]
  );

  return {
    activeFilters,
    isSelected,
    toggleFilter,
    clearFilter,
    clearAllFilters,
    hasActiveFilters,
    getFilterValue,
    getFilterValues,
  };
}

// Componente para exibir badges dos filtros ativos
export { ActiveFilterBadges } from "@/components/ui/active-filter-badges";
