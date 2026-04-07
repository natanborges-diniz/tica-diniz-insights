// src/components/financeiro-dre/DreFilters.tsx

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useUserEmpresas } from "@/hooks/useUserEmpresas";
import { DreFilters as DreFiltersType } from "@/hooks/useFinanceiroDre";
import { Loader2, AlertCircle, CheckCircle2, TrendingUp } from "lucide-react";

interface Props {
  filters: DreFiltersType;
  onChange: (updates: Partial<DreFiltersType>) => void;
}

export function DreFilters({ filters, onChange }: Props) {
  const { empresas, isLoading, error, canSeeAll } = useUserEmpresas();

  return (
    <div className="flex flex-wrap gap-4 items-end">
      {/* Modo */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Visão</Label>
        <ToggleGroup
          type="single"
          value={filters.modo}
          onValueChange={(val) => {
            if (val) onChange({ modo: val as "realizado" | "projetado" });
          }}
          className="border rounded-md"
        >
          <ToggleGroupItem value="realizado" aria-label="Realizado" className="gap-1.5 text-xs px-3">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Realizado
          </ToggleGroupItem>
          <ToggleGroupItem value="projetado" aria-label="Projetado" className="gap-1.5 text-xs px-3">
            <TrendingUp className="h-3.5 w-3.5" />
            Projetado
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Empresa */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Empresa</Label>
        <Select
          value={filters.empresa !== null ? String(filters.empresa) : "TODAS"}
          onValueChange={(val) => onChange({ empresa: val === "TODAS" ? null : Number(val) })}
          disabled={isLoading}
        >
          <SelectTrigger className="w-[200px]">
            {isLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Carregando...</span>
              </div>
            ) : error ? (
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span>Erro</span>
              </div>
            ) : (
              <SelectValue placeholder="Selecione a empresa" />
            )}
          </SelectTrigger>
           <SelectContent>
            {canSeeAll && <SelectItem value="TODAS">Todas as empresas</SelectItem>}
            {empresas.map((emp) => (
              <SelectItem key={emp.codEmpresa} value={String(emp.codEmpresa)}>
                {emp.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}
      </div>

      {/* Data Início */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Data Início</Label>
        <Input
          type="date"
          value={filters.dataIni}
          onChange={(e) => onChange({ dataIni: e.target.value })}
          className="w-[150px]"
        />
      </div>

      {/* Data Fim */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Data Fim</Label>
        <Input
          type="date"
          value={filters.dataFim}
          onChange={(e) => onChange({ dataFim: e.target.value })}
          className="w-[150px]"
        />
      </div>
    </div>
  );
}
