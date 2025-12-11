// src/components/financeiro-fluxo/FluxoCaixaFilters.tsx

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEmpresas } from "@/hooks/useEmpresas";
import { FluxoCaixaFilters as FluxoCaixaFiltersType, Granularidade } from "@/hooks/useFluxoCaixa";
import { Loader2, AlertCircle } from "lucide-react";

interface Props {
  filters: FluxoCaixaFiltersType;
  onChange: (updates: Partial<FluxoCaixaFiltersType>) => void;
}

export function FluxoCaixaFilters({ filters, onChange }: Props) {
  const { empresas, isLoading, error } = useEmpresas();

  return (
    <div className="flex flex-wrap gap-4 items-end">
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
            <SelectItem value="TODAS">Todas as empresas</SelectItem>
            {empresas.map((emp) => (
              <SelectItem key={emp.codEmpresa} value={String(emp.codEmpresa)}>
                {emp.empresaNome}
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

      {/* Granularidade */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Granularidade</Label>
        <Select
          value={filters.granularidade}
          onValueChange={(val) => onChange({ granularidade: val as Granularidade })}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="DIARIO">Diário</SelectItem>
            <SelectItem value="MENSAL">Mensal</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
