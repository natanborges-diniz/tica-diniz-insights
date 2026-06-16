import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronDown, X, Search } from "lucide-react";
import { Empresa } from "@/services/empresaService";
import { ComprasNota } from "@/services/comprasService";

export type IncludeExclude = "include" | "exclude";
export type ComparativoMode = "none" | "mom" | "yoy";

export interface MultiFilter {
  mode: IncludeExclude;
  values: string[];
}

interface Props {
  empresas: Empresa[];
  selectedEmpresaId: number | null;
  onEmpresaChange: (id: number | null) => void;
  canSeeAll?: boolean;
  dataInicio: string;
  dataFim: string;
  onDataInicioChange: (v: string) => void;
  onDataFimChange: (v: string) => void;
  notas: ComprasNota[];
  fornecedorFilter: MultiFilter;
  setFornecedorFilter: (f: MultiFilter) => void;
  contaFilter: MultiFilter;
  setContaFilter: (f: MultiFilter) => void;
  formaPgtoFilter: MultiFilter;
  setFormaPgtoFilter: (f: MultiFilter) => void;
  comparativo: ComparativoMode;
  setComparativo: (c: ComparativoMode) => void;
}

function MultiSelect({
  label,
  options,
  filter,
  onChange,
}: {
  label: string;
  options: string[];
  filter: MultiFilter;
  onChange: (f: MultiFilter) => void;
}) {
  const toggle = (v: string) => {
    const has = filter.values.includes(v);
    onChange({ ...filter, values: has ? filter.values.filter(x => x !== v) : [...filter.values, v] });
  };
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-between font-normal">
            <span className="truncate">
              {filter.values.length === 0
                ? "Todos"
                : `${filter.mode === "exclude" ? "Excluindo " : ""}${filter.values.length} selecionado(s)`}
            </span>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-3 max-h-96 overflow-auto z-50 bg-popover">
          <div className="flex items-center justify-between mb-2">
            <Tabs value={filter.mode} onValueChange={(v) => onChange({ ...filter, mode: v as IncludeExclude })}>
              <TabsList className="h-8">
                <TabsTrigger value="include" className="text-xs">Incluir</TabsTrigger>
                <TabsTrigger value="exclude" className="text-xs">Excluir</TabsTrigger>
              </TabsList>
            </Tabs>
            {filter.values.length > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onChange({ ...filter, values: [] })}>
                Limpar
              </Button>
            )}
          </div>
          <div className="space-y-1">
            {options.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">Sem opções</p>
            ) : (
              options.map((opt) => (
                <label key={opt} className="flex items-center gap-2 text-sm hover:bg-muted/50 rounded px-2 py-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filter.values.includes(opt)}
                    onChange={() => toggle(opt)}
                    className="rounded"
                  />
                  <span className="truncate">{opt}</span>
                </label>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
      {filter.values.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {filter.values.slice(0, 3).map(v => (
            <Badge key={v} variant={filter.mode === "exclude" ? "destructive" : "secondary"} className="text-xs gap-1">
              {v.length > 16 ? v.substring(0, 16) + "…" : v}
              <button onClick={() => onChange({ ...filter, values: filter.values.filter(x => x !== v) })}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {filter.values.length > 3 && <Badge variant="outline" className="text-xs">+{filter.values.length - 3}</Badge>}
        </div>
      )}
    </div>
  );
}

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function ComprasFilters({
  empresas, selectedEmpresaId, onEmpresaChange, canSeeAll,
  dataInicio, dataFim, onDataInicioChange, onDataFimChange,
  notas, fornecedorFilter, setFornecedorFilter,
  contaFilter, setContaFilter, formaPgtoFilter, setFormaPgtoFilter,
  comparativo, setComparativo,
}: Props) {
  const fornecedores = useMemo(
    () => Array.from(new Set(notas.map(n => n.fornecedor))).filter(Boolean).sort(),
    [notas]
  );
  const contas = useMemo(
    () => Array.from(new Set(notas.map(n => n.conta))).filter(Boolean).sort(),
    [notas]
  );
  const formasPgto = useMemo(
    () => Array.from(new Set(notas.map(n => n.formaPagamento))).filter(Boolean).sort(),
    [notas]
  );

  const applyQuickRange = (preset: string) => {
    const now = new Date();
    let ini: Date, fim: Date;
    switch (preset) {
      case "mes_atual":
        ini = new Date(now.getFullYear(), now.getMonth(), 1);
        fim = now;
        break;
      case "mes_anterior":
        ini = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        fim = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case "30d":
        fim = now;
        ini = new Date(now);
        ini.setDate(now.getDate() - 30);
        break;
      case "90d":
        fim = now;
        ini = new Date(now);
        ini.setDate(now.getDate() - 90);
        break;
      case "ano":
        ini = new Date(now.getFullYear(), 0, 1);
        fim = now;
        break;
      default:
        return;
    }
    onDataInicioChange(fmt(ini));
    onDataFimChange(fmt(fim));
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <div className="space-y-2">
          <Label>Empresa</Label>
          <select
            value={selectedEmpresaId !== null ? String(selectedEmpresaId) : "ALL"}
            onChange={(e) => onEmpresaChange(e.target.value === "ALL" ? null : Number(e.target.value))}
            className="w-full px-3 py-2 border rounded-md bg-background"
          >
            {canSeeAll && <option value="ALL">Todas as Empresas</option>}
            {empresas.map(emp => <option key={emp.codEmpresa} value={emp.codEmpresa}>{emp.nome}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Data emissão (início)</Label>
          <Input type="date" value={dataInicio} onChange={(e) => onDataInicioChange(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Data emissão (fim)</Label>
          <Input type="date" value={dataFim} onChange={(e) => onDataFimChange(e.target.value)} />
        </div>
        <MultiSelect label="Fornecedor" options={fornecedores} filter={fornecedorFilter} onChange={setFornecedorFilter} />
        <MultiSelect label="Conta contábil" options={contas} filter={contaFilter} onChange={setContaFilter} />
        <MultiSelect label="Forma pgto" options={formasPgto} filter={formaPgtoFilter} onChange={setFormaPgtoFilter} />
        <div className="space-y-2">
          <Label>Comparativo</Label>
          <Tabs value={comparativo} onValueChange={(v) => setComparativo(v as ComparativoMode)}>
            <TabsList className="w-full">
              <TabsTrigger value="none" className="flex-1 text-xs">—</TabsTrigger>
              <TabsTrigger value="mom" className="flex-1 text-xs">MoM</TabsTrigger>
              <TabsTrigger value="yoy" className="flex-1 text-xs">YoY</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground mr-1">Períodos rápidos:</span>
        <Button variant="outline" size="sm" onClick={() => applyQuickRange("mes_atual")}>Mês atual</Button>
        <Button variant="outline" size="sm" onClick={() => applyQuickRange("mes_anterior")}>Mês anterior</Button>
        <Button variant="outline" size="sm" onClick={() => applyQuickRange("30d")}>Últimos 30 dias</Button>
        <Button variant="outline" size="sm" onClick={() => applyQuickRange("90d")}>Últimos 90 dias</Button>
        <Button variant="outline" size="sm" onClick={() => applyQuickRange("ano")}>Ano atual</Button>
      </div>
    </div>
  );
}
