// src/components/financeiro-dashboard/FinanceiroFilters.tsx

import React, { useEffect, useState } from "react";
import { FinanceiroFilters as FiltersType, TipoFilter, SituacaoFilter } from "../../hooks/useFinanceiroParcelas";
import { fetchEmpresas, Empresa } from "../../services/firebirdBridge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FinanceiroFiltersProps {
  filters: FiltersType;
  onChange: (filters: Partial<FiltersType>) => void;
}

export function FinanceiroFilters({ filters, onChange }: FinanceiroFiltersProps) {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);

  useEffect(() => {
    fetchEmpresas()
      .then(setEmpresas)
      .catch(() => setEmpresas([]));
  }, []);

  return (
    <div className="flex flex-wrap gap-4 items-end">
      {/* Empresa */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Empresa</Label>
        <Select
          value={filters.empresa ? String(filters.empresa) : "TODAS"}
          onValueChange={(value) =>
            onChange({ empresa: value === "TODAS" ? null : Number(value) })
          }
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Todas as empresas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODAS">Todas as empresas</SelectItem>
            {empresas.map((e) => (
              <SelectItem key={e.COD_EMPRESA} value={String(e.COD_EMPRESA)}>
                {e.EMPRESA}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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

      {/* Tipo */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Tipo</Label>
        <Select
          value={filters.tipo}
          onValueChange={(value) => onChange({ tipo: value as TipoFilter })}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todos</SelectItem>
            <SelectItem value="RECEBER">A Receber</SelectItem>
            <SelectItem value="PAGAR">A Pagar</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Situação */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Situação</Label>
        <Select
          value={filters.situacao}
          onValueChange={(value) => onChange({ situacao: value as SituacaoFilter })}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Situação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todas</SelectItem>
            <SelectItem value="EM ABERTO">Em Aberto</SelectItem>
            <SelectItem value="EM ATRASO">Em Atraso</SelectItem>
            <SelectItem value="PAGA">Pagas</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
