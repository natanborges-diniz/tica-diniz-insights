// src/components/financeiro-dashboard/FinanceiroFilters.tsx

import React from "react";
import { FinanceiroFilters as FiltersType, TipoFilter, SituacaoFilter, CampoDataFilter } from "../../hooks/useFinanceiroParcelas";
import { useEmpresas } from "../../hooks/useEmpresas";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertCircle } from "lucide-react";

interface FinanceiroFiltersProps {
  filters: FiltersType;
  onChange: (filters: Partial<FiltersType>) => void;
}

export function FinanceiroFilters({ filters, onChange }: FinanceiroFiltersProps) {
  const { empresas, isLoading, error } = useEmpresas();

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
            {empresas.map((e) => (
              <SelectItem key={e.codEmpresa} value={String(e.codEmpresa)}>
                {e.empresaNome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}
      </div>

      {/* Campo de Data */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Campo de Data</Label>
        <Select
          value={filters.campoData}
          onValueChange={(value) => onChange({ campoData: value as CampoDataFilter })}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Campo de Data" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="VENCIMENTO">Data Vencimento</SelectItem>
            <SelectItem value="EMISSAO">Data Emissão</SelectItem>
            <SelectItem value="PAGAMENTO">Data Pagamento</SelectItem>
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
