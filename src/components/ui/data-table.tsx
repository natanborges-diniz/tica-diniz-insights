// src/components/ui/data-table.tsx
// Componente DataTable reutilizável com suporte server/client, paginação, sticky header, A11Y

import React, { useMemo, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

// ============================================
// TYPES
// ============================================

export type SortDirection = "asc" | "desc";

export interface SortState {
  field: string;
  direction: SortDirection;
}

export interface QueryState {
  page: number;
  pageSize: number;
  sort: SortState | null;
  search: string;
}

export interface DataTableColumn<T> {
  /** Chave do campo no objeto de dados */
  key: string;
  /** Texto do cabeçalho */
  header: string;
  /** Se a coluna é ordenável */
  sortable?: boolean;
  /** Alinhamento (default: left) */
  align?: "left" | "center" | "right";
  /** Visível no mobile? (default: true para essenciais, false para secundárias) */
  mobileVisible?: boolean;
  /** Largura máxima CSS (ex: "200px") */
  maxWidth?: string;
  /** Render customizado da célula */
  cell?: (row: T, index: number) => React.ReactNode;
  /** Classes extras no <th> */
  headerClassName?: string;
  /** Classes extras no <td> */
  cellClassName?: string;
}

/**
 * Export policy: a DataTable never exports by itself.
 * Use `<DataTableToolbar>` with `exportOptions` prop to add export.
 * The toolbar always exports the FULL filtered dataset passed to it,
 * not just the visible page. Document this in your `exportOptions.data`.
 */
interface DataTableProps<T> {
  /** Colunas da tabela */
  columns: DataTableColumn<T>[];
  /** Dados a exibir (página atual no modo server, todos no modo client) */
  data: T[];
  /** Modo de operação */
  mode: "server" | "client";
  /** Total de registros (obrigatório no modo server) */
  totalRows?: number;
  /** Estado da query (paginação, ordenação, busca) */
  queryState: QueryState;
  /** Callback quando query muda */
  onQueryChange: (state: QueryState) => void;
  /** Chave única por linha */
  rowKey: (row: T, index: number) => string;
  /** Loading */
  loading?: boolean;
  /** Mensagem quando vazio */
  emptyMessage?: string;
  /** Slot: conteúdo customizado quando vazio (sobrepõe emptyMessage) */
  emptyState?: React.ReactNode;
  /** Slot: conteúdo customizado quando há erro */
  errorState?: React.ReactNode;
  /** Slot toolbar (acima da tabela) */
  toolbar?: React.ReactNode;
  /** Classes extras no container */
  className?: string;
  /** Opções de pageSize (default: [20, 50, 100]) */
  pageSizeOptions?: number[];
  /** Classe da linha (para destaque condicional) */
  rowClassName?: (row: T) => string;
  /** Callback ao clicar em uma linha (mobile escape hatch: abre detalhe/sheet) */
  onRowClick?: (row: T, index: number) => void;
}

// ============================================
// PAGINATION SUB-COMPONENT
// ============================================

function DataTablePagination({
  page,
  pageSize,
  totalRows,
  pageSizeOptions = [20, 50, 100],
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  totalRows: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const startRow = totalRows === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRow = Math.min(page * pageSize, totalRows);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-2 py-3">
      <div className="text-sm text-muted-foreground order-2 sm:order-1">
        {totalRows === 0 ? (
          "Nenhum registro"
        ) : (
          <>
            {startRow}–{endRow} de {totalRows.toLocaleString("pt-BR")}
          </>
        )}
      </div>

      <div className="flex items-center gap-3 order-1 sm:order-2">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-muted-foreground hidden sm:inline">Linhas:</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange(Number(v))}
          >
            <SelectTrigger className="h-8 w-[65px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page <= 1}
            onClick={() => onPageChange(1)}
            aria-label="Primeira página"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <span className="text-sm px-2 min-w-[60px] text-center">
            {page}/{totalPages}
          </span>

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label="Próxima página"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page >= totalPages}
            onClick={() => onPageChange(totalPages)}
            aria-label="Última página"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// SORTABLE HEADER
// ============================================

function SortableHeader({
  label,
  field,
  align,
  currentSort,
  onSort,
}: {
  label: string;
  field: string;
  align?: string;
  currentSort: SortState | null;
  onSort: (field: string) => void;
}) {
  const isActive = currentSort?.field === field;
  const direction = isActive ? currentSort!.direction : undefined;

  const ariaSort: React.AriaAttributes["aria-sort"] = isActive
    ? direction === "asc"
      ? "ascending"
      : "descending"
    : "none";

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        "h-8 px-2 -ml-2 font-medium hover:bg-muted",
        align === "right" && "ml-auto -mr-2"
      )}
      onClick={() => onSort(field)}
      aria-sort={ariaSort}
    >
      {label}
      {isActive && direction === "asc" && <ArrowUp className="ml-1 h-3 w-3" />}
      {isActive && direction === "desc" && <ArrowDown className="ml-1 h-3 w-3" />}
      {!isActive && <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />}
    </Button>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  mode,
  totalRows: totalRowsProp,
  queryState,
  onQueryChange,
  rowKey,
  loading = false,
  emptyMessage = "Nenhum registro encontrado",
  emptyState,
  errorState,
  toolbar,
  className,
  pageSizeOptions = [20, 50, 100],
  rowClassName,
  onRowClick,
}: DataTableProps<T>) {

  // ── Validate sort field against sortable columns ──
  const sortableKeys = useMemo(
    () => new Set(columns.filter((c) => c.sortable).map((c) => c.key)),
    [columns]
  );

  // If current sort references a non-sortable column, clear it
  const effectiveSort = useMemo(() => {
    if (queryState.sort && !sortableKeys.has(queryState.sort.field)) {
      return null;
    }
    return queryState.sort;
  }, [queryState.sort, sortableKeys]);

  // ── Client-side sort + paginate ─────────────
  const processedData = useMemo(() => {
    if (mode === "server") return data;

    let result = [...data];

    // Sort
    if (effectiveSort) {
      const { field, direction } = effectiveSort;
      result.sort((a, b) => {
        let aVal = a[field];
        let bVal = b[field];
        if (aVal == null) aVal = "";
        if (bVal == null) bVal = "";

        if (typeof aVal === "number" && typeof bVal === "number") {
          return direction === "asc" ? aVal - bVal : bVal - aVal;
        }
        const cmp = String(aVal).localeCompare(String(bVal), "pt-BR", { sensitivity: "base" });
        return direction === "asc" ? cmp : -cmp;
      });
    }

    return result;
  }, [mode, data, effectiveSort]);

  // Total rows
  const totalRows = mode === "server" ? (totalRowsProp ?? data.length) : processedData.length;

  // Paginated slice (client only)
  const pageData = useMemo(() => {
    if (mode === "server") return data;
    const start = (queryState.page - 1) * queryState.pageSize;
    return processedData.slice(start, start + queryState.pageSize);
  }, [mode, processedData, queryState.page, queryState.pageSize, data]);

  // ── Handlers ──────────────────────────────
  const handleSort = useCallback(
    (field: string) => {
      // Guard: only allow sorting on sortable columns
      if (!sortableKeys.has(field)) return;

      const current = effectiveSort;
      let newSort: SortState | null;

      if (current?.field === field) {
        if (current.direction === "desc") newSort = { field, direction: "asc" };
        else newSort = null; // asc → clear
      } else {
        newSort = { field, direction: "desc" };
      }

      onQueryChange({ ...queryState, sort: newSort, page: 1 });
    },
    [queryState, onQueryChange, effectiveSort, sortableKeys]
  );

  const handlePageChange = useCallback(
    (page: number) => onQueryChange({ ...queryState, page }),
    [queryState, onQueryChange]
  );

  const handlePageSizeChange = useCallback(
    (pageSize: number) => onQueryChange({ ...queryState, pageSize, page: 1 }),
    [queryState, onQueryChange]
  );

  // ── Error state ───────────────────────────
  if (errorState) {
    return (
      <div className={cn("space-y-2", className)}>
        {toolbar}
        {errorState}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {toolbar}

      <div className="rounded-md border overflow-hidden">
        <div className="overflow-x-auto max-h-[70vh]">
          <table className="w-full text-sm" role="grid">
            <thead className="bg-muted/50 sticky top-0 z-10">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    className={cn(
                      "p-3 font-medium text-muted-foreground whitespace-nowrap",
                      col.align === "right" && "text-right",
                      col.align === "center" && "text-center",
                      col.mobileVisible === false && "hidden md:table-cell",
                      col.headerClassName
                    )}
                    style={col.maxWidth ? { maxWidth: col.maxWidth } : undefined}
                  >
                    {col.sortable ? (
                      <SortableHeader
                        label={col.header}
                        field={col.key}
                        align={col.align}
                        currentSort={effectiveSort}
                        onSort={handleSort}
                      />
                    ) : (
                      col.header
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: Math.min(queryState.pageSize, 5) }).map((_, i) => (
                  <tr key={`skeleton-${i}`} className="border-t">
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          "p-3",
                          col.mobileVisible === false && "hidden md:table-cell"
                        )}
                      >
                        <div className="h-4 bg-muted animate-pulse rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : pageData.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="text-center text-muted-foreground py-8"
                  >
                    {emptyState || emptyMessage}
                  </td>
                </tr>
              ) : (
                pageData.map((row, idx) => (
                  <tr
                    key={rowKey(row, idx)}
                    className={cn(
                      "border-t hover:bg-muted/30 transition-colors",
                      onRowClick && "cursor-pointer",
                      rowClassName?.(row)
                    )}
                    onClick={onRowClick ? () => onRowClick(row, idx) : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    onKeyDown={
                      onRowClick
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onRowClick(row, idx);
                            }
                          }
                        : undefined
                    }
                    role={onRowClick ? "button" : undefined}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          "p-3",
                          col.align === "right" && "text-right",
                          col.align === "center" && "text-center",
                          col.mobileVisible === false && "hidden md:table-cell",
                          col.cellClassName
                        )}
                        style={col.maxWidth ? { maxWidth: col.maxWidth, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } : undefined}
                      >
                        {col.cell ? col.cell(row, idx) : (row[col.key] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <DataTablePagination
        page={queryState.page}
        pageSize={queryState.pageSize}
        totalRows={totalRows}
        pageSizeOptions={pageSizeOptions}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
      />
    </div>
  );
}
