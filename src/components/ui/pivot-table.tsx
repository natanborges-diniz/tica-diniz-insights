import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GripVertical, ChevronDown, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// Tipos para configuração das colunas
export interface PivotColumn<T> {
  key: keyof T | string;
  header: string;
  type: 'dimension' | 'measure';
  format?: (value: any) => string;
  aggregate?: 'sum' | 'count' | 'avg' | 'min' | 'max';
  className?: string;
}

export interface PivotView {
  groupBy: string[];
  columns: { key: string; header: string; type: 'dimension' | 'measure'; format?: (v: any) => string }[];
  rows: Record<string, any>[];
}

export interface PivotTableProps<T> {
  data: T[];
  columns: PivotColumn<T>[];
  defaultGroupBy: (keyof T | string)[];
  title?: string;
  icon?: React.ReactNode;
  emptyMessage?: string;
  className?: string;
  onViewChange?: (view: PivotView) => void;
}

// Componente de chip arrastável
interface DraggableChipProps {
  label: string;
  columnKey: string;
  isActive: boolean;
  onRemove?: () => void;
  onDragStart: (e: React.DragEvent, key: string) => void;
  onDragEnd: () => void;
}

function DraggableChip({ label, columnKey, isActive, onRemove, onDragStart, onDragEnd }: DraggableChipProps) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, columnKey)}
      onDragEnd={onDragEnd}
      className={cn(
        "inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium cursor-grab active:cursor-grabbing transition-all",
        isActive 
          ? "bg-primary text-primary-foreground shadow-md" 
          : "bg-muted text-muted-foreground hover:bg-muted/80"
      )}
    >
      <GripVertical className="h-3 w-3 opacity-60" />
      <span>{label}</span>
      {isActive && onRemove && (
        <button 
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="ml-1 hover:bg-primary-foreground/20 rounded-full p-0.5"
        >
          ×
        </button>
      )}
    </div>
  );
}

// Área de drop para agrupamento
interface DropZoneProps {
  onDrop: (key: string) => void;
  children: React.ReactNode;
  label: string;
}

function DropZone({ onDrop, children, label }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const key = e.dataTransfer.getData('text/plain');
    if (key) {
      onDrop(key);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "min-h-[48px] p-2 rounded-lg border-2 border-dashed transition-all",
        isDragOver 
          ? "border-primary bg-primary/10" 
          : "border-muted-foreground/30 bg-muted/30"
      )}
    >
      <div className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">
        {label}
      </div>
      <div className="flex flex-wrap gap-2">
        {children}
      </div>
    </div>
  );
}

// Função para acessar valor aninhado
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((acc, part) => acc?.[part], obj);
}

// Componente principal
export function PivotTable<T extends Record<string, any>>({
  data,
  columns,
  defaultGroupBy,
  title,
  icon,
  emptyMessage = 'Nenhum dado encontrado',
  className,
  onViewChange,
}: PivotTableProps<T>) {
  const [groupBy, setGroupBy] = useState<string[]>(defaultGroupBy as string[]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);

  // Separar dimensões e medidas
  const dimensions = columns.filter(c => c.type === 'dimension');
  const measures = columns.filter(c => c.type === 'measure');

  // Dimensões ativas e disponíveis
  const activeDimensions = dimensions.filter(d => groupBy.includes(d.key as string));
  const availableDimensions = dimensions.filter(d => !groupBy.includes(d.key as string));

  // Handlers de drag and drop
  const handleDragStart = (e: React.DragEvent, key: string) => {
    e.dataTransfer.setData('text/plain', key);
    setDraggingKey(key);
  };

  const handleDragEnd = () => {
    setDraggingKey(null);
  };

  const handleDropToActive = (key: string) => {
    if (!groupBy.includes(key)) {
      setGroupBy([...groupBy, key]);
    }
  };

  const handleDropToAvailable = (key: string) => {
    setGroupBy(groupBy.filter(k => k !== key));
  };

  const handleRemoveFromActive = (key: string) => {
    setGroupBy(groupBy.filter(k => k !== key));
  };

  // Tipo para linhas agregadas
  type AggregatedRow = {
    _key: string;
    _isGroup: boolean;
    _level: number;
    _count: number;
    _data: T;
  };

  // Agregar dados
  const aggregatedData = useMemo((): AggregatedRow[] => {
    if (groupBy.length === 0) {
      // Sem agrupamento - retornar dados originais
      return data.map((row, idx) => ({
        _key: `row-${idx}`,
        _isGroup: false,
        _level: 0,
        _count: 1,
        _data: row,
      }));
    }

    // Agrupar dados
    const groups = new Map<string, T[]>();
    
    data.forEach(row => {
      const key = groupBy.map(g => String(getNestedValue(row, g) ?? 'N/A')).join('|');
      const existing = groups.get(key) || [];
      existing.push(row);
      groups.set(key, existing);
    });

    // Converter para array com agregações
    return Array.from(groups.entries()).map(([key, rows]) => {
      const aggregated: Record<string, any> = {};
      
      // Adicionar valores de dimensão
      groupBy.forEach((g) => {
        aggregated[g] = getNestedValue(rows[0], g);
      });

      // Agregar medidas
      measures.forEach(m => {
        const mKey = m.key as string;
        const values = rows.map(r => Number(getNestedValue(r, mKey)) || 0);
        
        switch (m.aggregate || 'sum') {
          case 'sum':
            aggregated[mKey] = values.reduce((a, b) => a + b, 0);
            break;
          case 'count':
            aggregated[mKey] = values.length;
            break;
          case 'avg':
            aggregated[mKey] = values.reduce((a, b) => a + b, 0) / values.length;
            break;
          case 'min':
            aggregated[mKey] = Math.min(...values);
            break;
          case 'max':
            aggregated[mKey] = Math.max(...values);
            break;
        }
      });

      return {
        _key: key,
        _isGroup: true,
        _level: 0,
        _count: rows.length,
        _data: aggregated as T,
      };
    });
  }, [data, groupBy, measures]);

  // Ordenar dados
  const sortedData = useMemo(() => {
    if (!sortConfig) return aggregatedData;

    return [...aggregatedData].sort((a, b) => {
      const aVal = getNestedValue(a._data, sortConfig.key);
      const bVal = getNestedValue(b._data, sortConfig.key);

      if (aVal === bVal) return 0;
      
      const comparison = aVal < bVal ? -1 : 1;
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [aggregatedData, sortConfig]);

  // Handler de ordenação
  const handleSort = (key: string) => {
    setSortConfig(current => {
      if (current?.key !== key) return { key, direction: 'asc' };
      if (current.direction === 'asc') return { key, direction: 'desc' };
      return null;
    });
  };

  // Ícone de ordenação
  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (sortConfig?.key !== columnKey) {
      return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    }
    return sortConfig.direction === 'asc' 
      ? <ArrowUp className="h-3 w-3" /> 
      : <ArrowDown className="h-3 w-3" />;
  };

  // Colunas visíveis (dimensões ativas + todas as medidas)
  const visibleColumns = [
    ...activeDimensions,
    ...measures,
  ];

  // Notificar mudanças de view (para exportações que devem refletir a tela)
  useEffect(() => {
    if (!onViewChange) return;
    onViewChange({
      groupBy,
      columns: visibleColumns.map(c => ({
        key: c.key as string,
        header: c.header,
        type: c.type,
        format: c.format,
      })),
      rows: sortedData.map(r => r._data as Record<string, any>),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedData, groupBy]);

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            {icon}
            {title}
          </CardTitle>
          {groupBy.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              Agrupado por {groupBy.length} campo(s)
            </Badge>
          )}
        </div>
        
        {/* Área de configuração de agrupamento */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <DropZone onDrop={handleDropToActive} label="Agrupar por (arraste aqui)">
            {activeDimensions.length === 0 ? (
              <span className="text-xs text-muted-foreground italic">
                Arraste campos para agrupar
              </span>
            ) : (
              activeDimensions.map(dim => (
                <DraggableChip
                  key={dim.key as string}
                  label={dim.header}
                  columnKey={dim.key as string}
                  isActive={true}
                  onRemove={() => handleRemoveFromActive(dim.key as string)}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                />
              ))
            )}
          </DropZone>
          
          <DropZone onDrop={handleDropToAvailable} label="Campos disponíveis">
            {availableDimensions.length === 0 ? (
              <span className="text-xs text-muted-foreground italic">
                Todos os campos estão em uso
              </span>
            ) : (
              availableDimensions.map(dim => (
                <DraggableChip
                  key={dim.key as string}
                  label={dim.header}
                  columnKey={dim.key as string}
                  isActive={false}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                />
              ))
            )}
          </DropZone>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {visibleColumns.map(col => (
                  <TableHead 
                    key={col.key as string}
                    className={cn(
                      "cursor-pointer select-none hover:bg-muted/50 transition-colors",
                      col.type === 'measure' && "text-right",
                      col.className
                    )}
                    onClick={() => handleSort(col.key as string)}
                  >
                    <div className={cn(
                      "flex items-center gap-1",
                      col.type === 'measure' && "justify-end"
                    )}>
                      <span>{col.header}</span>
                      <SortIcon columnKey={col.key as string} />
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={visibleColumns.length}
                    className="text-center text-muted-foreground py-8"
                  >
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                sortedData.map((row, idx) => (
                  <TableRow key={row._key} className={idx % 2 === 0 ? '' : 'bg-muted/30'}>
                    {visibleColumns.map(col => {
                      const value = getNestedValue(row._data, col.key as string);
                      const formatted = col.format ? col.format(value) : String(value ?? '—');
                      
                      return (
                        <TableCell 
                          key={col.key as string}
                          className={cn(
                            col.type === 'measure' && "text-right font-mono",
                            col.className
                          )}
                        >
                          {formatted}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        
        {sortedData.length > 0 && (
          <div className="mt-3 text-xs text-muted-foreground text-right">
            {sortedData.length} linha(s) • {data.length} registro(s) original(is)
          </div>
        )}
      </CardContent>
    </Card>
  );
}
