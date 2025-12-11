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
import { useEmpresas } from "@/hooks/useEmpresas";
import { DreFilters as DreFiltersType } from "@/hooks/useFinanceiroDre";

interface Props {
  filters: DreFiltersType;
  onChange: (updates: Partial<DreFiltersType>) => void;
}

export function DreFilters({ filters, onChange }: Props) {
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
              <SelectItem key={emp.codEmpresa} value={String(emp.codEmpresa)}>
                {emp.empresaNome}
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
    </div>
  );
}
