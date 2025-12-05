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

interface Props {
  filters: FluxoCaixaFiltersType;
  onChange: (updates: Partial<FluxoCaixaFiltersType>) => void;
}

export function FluxoCaixaFilters({ filters, onChange }: Props) {
  const { empresas, isLoading: loadingEmpresas } = useEmpresas();

  return (
    <div className="flex flex-wrap gap-4 items-end">
      <div className="space-y-1.5 min-w-[200px]">
        <Label>Empresa</Label>
        <Select
          value={filters.empresa !== null ? String(filters.empresa) : ""}
          onValueChange={(val) => onChange({ empresa: val ? Number(val) : null })}
        >
          <SelectTrigger>
            <SelectValue placeholder={loadingEmpresas ? "Carregando..." : "Selecione a empresa"} />
          </SelectTrigger>
          <SelectContent>
            {empresas.map((emp) => (
              <SelectItem key={emp.COD_EMPRESA} value={String(emp.COD_EMPRESA)}>
                {emp.EMPRESA}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Data Início</Label>
        <Input
          type="date"
          value={filters.dataIni}
          onChange={(e) => onChange({ dataIni: e.target.value })}
          className="w-40"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Data Fim</Label>
        <Input
          type="date"
          value={filters.dataFim}
          onChange={(e) => onChange({ dataFim: e.target.value })}
          className="w-40"
        />
      </div>

      <div className="space-y-1.5 min-w-[150px]">
        <Label>Granularidade</Label>
        <Select
          value={filters.granularidade}
          onValueChange={(val) => onChange({ granularidade: val as Granularidade })}
        >
          <SelectTrigger>
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
