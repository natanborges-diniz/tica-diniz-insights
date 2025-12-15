import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Search } from "lucide-react";
import { useEmpresas } from "@/hooks/useEmpresas";
import { EmpresaParam } from "@/services/firebirdBridge";

interface RankingFiltersProps {
  dataInicio: string;
  dataFim: string;
  onDataInicioChange: (value: string) => void;
  onDataFimChange: (value: string) => void;
  onBuscar: () => void;
  loading: boolean;
  empresa?: EmpresaParam;
  onEmpresaChange?: (value: EmpresaParam) => void;
  showEmpresaFilter?: boolean;
}

export function RankingFilters({
  dataInicio,
  dataFim,
  onDataInicioChange,
  onDataFimChange,
  onBuscar,
  loading,
  empresa,
  onEmpresaChange,
  showEmpresaFilter = false,
}: RankingFiltersProps) {
  const { empresas, isLoading: loadingEmpresas } = useEmpresas();

  // Quick filters
  const setHoje = () => {
    const hoje = new Date().toISOString().split('T')[0];
    onDataInicioChange(hoje);
    onDataFimChange(hoje);
  };

  const setSemana = () => {
    const hoje = new Date();
    const inicio = new Date(hoje);
    inicio.setDate(hoje.getDate() - 7);
    onDataInicioChange(inicio.toISOString().split('T')[0]);
    onDataFimChange(hoje.toISOString().split('T')[0]);
  };

  const setMes = () => {
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    onDataInicioChange(inicio.toISOString().split('T')[0]);
    onDataFimChange(hoje.toISOString().split('T')[0]);
  };

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={setHoje}>Hoje</Button>
        <Button variant="outline" size="sm" onClick={setSemana}>Últimos 7 dias</Button>
        <Button variant="outline" size="sm" onClick={setMes}>Mês Atual</Button>
      </div>

      <div className="flex-1" />

      {showEmpresaFilter && onEmpresaChange && (
        <div className="space-y-1">
          <Label className="text-xs">Loja</Label>
          <Select 
            value={String(empresa)} 
            onValueChange={(v) => onEmpresaChange(v === 'ALL' ? 'ALL' : v)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Todas as lojas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas as lojas</SelectItem>
              {empresas.map((e) => (
                <SelectItem key={e.codEmpresa} value={String(e.codEmpresa)}>
                  {e.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs">Data Início</Label>
        <Input
          type="date"
          value={dataInicio}
          onChange={(e) => onDataInicioChange(e.target.value)}
          className="w-[150px]"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Data Fim</Label>
        <Input
          type="date"
          value={dataFim}
          onChange={(e) => onDataFimChange(e.target.value)}
          className="w-[150px]"
        />
      </div>

      <Button onClick={onBuscar} disabled={loading}>
        {loading ? (
          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Search className="h-4 w-4 mr-2" />
        )}
        Carregar Dados
      </Button>
    </div>
  );
}
