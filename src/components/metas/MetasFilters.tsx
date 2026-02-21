import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { Empresa } from "@/services/empresaService";
import { MetasFilters as Filters } from "@/hooks/useMetasVendas";

interface MetasFiltersProps {
  filters: Filters;
  setFilters: (filters: Filters) => void;
  empresas: Empresa[];
  canSeeAll?: boolean;
  onBuscar: () => void;
  loading?: boolean;
}

const MESES = [
  { value: 1, label: "Janeiro" },
  { value: 2, label: "Fevereiro" },
  { value: 3, label: "Março" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Maio" },
  { value: 6, label: "Junho" },
  { value: 7, label: "Julho" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Setembro" },
  { value: 10, label: "Outubro" },
  { value: 11, label: "Novembro" },
  { value: 12, label: "Dezembro" },
];

export function MetasFilters({ filters, setFilters, empresas, canSeeAll, onBuscar, loading }: MetasFiltersProps) {
  const anoAtual = new Date().getFullYear();
  const anos = [anoAtual - 1, anoAtual, anoAtual + 1];

  return (
    <div className="flex flex-wrap gap-3 items-end">
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Ano</label>
        <Select 
          value={String(filters.ano)} 
          onValueChange={(v) => setFilters({ ...filters, ano: Number(v) })}
        >
          <SelectTrigger className="w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {anos.map(ano => (
              <SelectItem key={ano} value={String(ano)}>{ano}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Mês</label>
        <Select 
          value={String(filters.mes)} 
          onValueChange={(v) => setFilters({ ...filters, mes: Number(v) })}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MESES.map(mes => (
              <SelectItem key={mes.value} value={String(mes.value)}>{mes.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Tipo</label>
        <Select 
          value={filters.tipo} 
          onValueChange={(v) => setFilters({ ...filters, tipo: v as 'LOJA' | 'VENDEDOR' | 'TODOS' })}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todos</SelectItem>
            <SelectItem value="LOJA">Lojas</SelectItem>
            <SelectItem value="VENDEDOR">Vendedores</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Empresa</label>
        <Select 
          value={filters.empresa === 'ALL' ? 'ALL' : String(filters.empresa)} 
          onValueChange={(v) => setFilters({ ...filters, empresa: v === 'ALL' ? 'ALL' : Number(v) })}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Selecione..." />
          </SelectTrigger>
          <SelectContent>
            {canSeeAll && <SelectItem value="ALL">Todas</SelectItem>}
            {empresas.map(emp => (
              <SelectItem key={emp.codEmpresa} value={String(emp.codEmpresa)}>
                {emp.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button onClick={onBuscar} disabled={loading}>
        <Search className="h-4 w-4 mr-2" />
        Buscar
      </Button>
    </div>
  );
}
