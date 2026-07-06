import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RefreshCw, Calendar, Building2, Loader2, AlertTriangle, ChevronDown } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useUserEmpresas } from '@/hooks/useUserEmpresas';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useMemo } from 'react';

interface SalesFiltersProps {
  dataInicio: string;
  dataFim: string;
  /** Valor single-select (usado quando multi !== true). Aceita 'ALL' | string(codigo). */
  empresa?: string;
  onDataInicioChange: (value: string) => void;
  onDataFimChange: (value: string) => void;
  onEmpresaChange?: (value: string) => void;
  onRefresh: () => void;
  isLoading?: boolean;
  alertaPeriodo?: string | null;

  /** Habilita seleção múltipla de lojas (popover com checkboxes) */
  multi?: boolean;
  /** Valor multi-select. 'ALL' = todas; number[] = subconjunto (vazio = todas) */
  selectedEmpresas?: 'ALL' | number[];
  onSelectedEmpresasChange?: (value: 'ALL' | number[]) => void;
}

export function SalesFilters({
  dataInicio,
  dataFim,
  empresa,
  onDataInicioChange,
  onDataFimChange,
  onEmpresaChange,
  onRefresh,
  isLoading,
  alertaPeriodo,
  multi,
  selectedEmpresas,
  onSelectedEmpresasChange,
}: SalesFiltersProps) {
  const { empresas, isLoading: empresasLoading, canSeeAll } = useUserEmpresas();

  const isAll = selectedEmpresas === 'ALL' || (Array.isArray(selectedEmpresas) && selectedEmpresas.length === 0);
  const selectedList = useMemo(
    () => (Array.isArray(selectedEmpresas) ? selectedEmpresas : []),
    [selectedEmpresas]
  );

  const labelMulti = useMemo(() => {
    if (isAll) return 'Todas as Empresas';
    if (selectedList.length === 1) {
      const e = empresas.find((x) => x.codEmpresa === selectedList[0]);
      return e?.nome ?? `Loja ${selectedList[0]}`;
    }
    return `${selectedList.length} lojas`;
  }, [isAll, selectedList, empresas]);

  const toggleEmpresa = (cod: number) => {
    if (!onSelectedEmpresasChange) return;
    const current = isAll ? empresas.map((e) => e.codEmpresa) : [...selectedList];
    const idx = current.indexOf(cod);
    if (idx >= 0) current.splice(idx, 1);
    else current.push(cod);
    if (current.length === 0) {
      onSelectedEmpresasChange(canSeeAll ? 'ALL' : []);
      return;
    }
    if (current.length === empresas.length) {
      onSelectedEmpresasChange('ALL');
      return;
    }
    onSelectedEmpresasChange(current);
  };

  const selectAll = () => onSelectedEmpresasChange?.('ALL');
  const clearAll = () => onSelectedEmpresasChange?.([]);

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-4">
            {/* Filtro de Empresa */}
            <div className="flex flex-col gap-2">
              <Label className="flex items-center gap-1">
                <Building2 className="h-4 w-4" />
                {multi ? 'Lojas' : 'Empresa'}
              </Label>

              {multi ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-[240px] justify-between"
                      disabled={empresasLoading}
                    >
                      {empresasLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <span className="truncate">{labelMulti}</span>
                      )}
                      <ChevronDown className="h-4 w-4 opacity-60" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[260px] p-0" align="start">
                    <div className="flex items-center justify-between px-3 py-2 border-b">
                      <span className="text-xs text-muted-foreground">
                        {isAll ? 'Todas' : `${selectedList.length} selecionadas`}
                      </span>
                      <div className="flex gap-1">
                        {canSeeAll && (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={selectAll}>
                            Todas
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearAll}>
                          Limpar
                        </Button>
                      </div>
                    </div>
                    <div className="max-h-64 overflow-y-auto p-1">
                      {empresas.map((e) => {
                        const checked = isAll || selectedList.includes(e.codEmpresa);
                        return (
                          <label
                            key={e.codEmpresa}
                            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleEmpresa(e.codEmpresa)}
                            />
                            <span className="text-sm truncate">{e.nome}</span>
                          </label>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              ) : (
                <Select
                  value={empresa ?? ''}
                  onValueChange={onEmpresaChange}
                  disabled={empresasLoading}
                >
                  <SelectTrigger className="w-[200px]">
                    {empresasLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <SelectValue placeholder="Selecione" />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {canSeeAll && <SelectItem value="ALL">Todas as Empresas</SelectItem>}
                    {empresas.map((e) => (
                      <SelectItem key={e.codEmpresa} value={String(e.codEmpresa)}>
                        {e.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Filtro de Data Início */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="dataInicio" className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                Data Início
              </Label>
              <Input
                id="dataInicio"
                type="date"
                value={dataInicio}
                onChange={(e) => onDataInicioChange(e.target.value)}
                className="w-[160px]"
              />
            </div>
            
            {/* Filtro de Data Fim */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="dataFim" className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                Data Fim
              </Label>
              <Input
                id="dataFim"
                type="date"
                value={dataFim}
                onChange={(e) => onDataFimChange(e.target.value)}
                className="w-[160px]"
              />
            </div>
            
            <Button 
              onClick={onRefresh} 
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>

          {/* Chips com lojas selecionadas (multi) */}
          {multi && !isAll && selectedList.length > 0 && selectedList.length <= 6 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedList.map((cod) => {
                const e = empresas.find((x) => x.codEmpresa === cod);
                return (
                  <Badge key={cod} variant="secondary" className="text-xs">
                    {e?.nome ?? `Loja ${cod}`}
                  </Badge>
                );
              })}
            </div>
          )}
          
          {alertaPeriodo && (
            <Alert variant="default" className="border-warning-muted bg-warning-soft">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <AlertDescription className="text-warning-foreground">
                {alertaPeriodo}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
