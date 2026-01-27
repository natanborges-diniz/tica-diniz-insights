// src/components/otb/OtbFilters.tsx
// Filtros para módulo OTB - Simplificado para avaliação mensal

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Building2, Calendar, Layers } from "lucide-react";
import type { OtbFilters as OtbFiltersType } from "@/hooks/useOtb";

interface Empresa {
  codEmpresa: number;
  nome: string;
}

interface ContagemCategoria {
  armacoes: number;
  lentes: number;
  acessorios: number;
  outros: number;
}

interface OtbFiltersProps {
  filters: OtbFiltersType;
  setFilters: React.Dispatch<React.SetStateAction<OtbFiltersType>>;
  empresas: Empresa[];
  loadingEmpresas: boolean;
  loading: boolean;
  onReload: () => void;
  contagemPorCategoria?: ContagemCategoria;
  totalSkusBrutos?: number;
}

export function OtbFilters({
  filters,
  setFilters,
  empresas,
  loadingEmpresas,
  loading,
  onReload,
  contagemPorCategoria,
  totalSkusBrutos = 0,
}: OtbFiltersProps) {
  // Gerar labels com contagem
  const getCategoriaLabel = (tipo: string, contagem: number) => {
    if (totalSkusBrutos === 0) return tipo;
    return `${tipo} (${contagem})`;
  };
  
  return (
    <div className="flex flex-wrap items-end gap-4">
      {/* Empresa */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1 text-xs">
          <Building2 className="h-3 w-3" />
          Empresa
        </Label>
        <Select
          value={filters.empresa === 'ALL' ? 'ALL' : String(filters.empresa)}
          onValueChange={(value) => setFilters(prev => ({
            ...prev,
            empresa: value === 'ALL' ? 'ALL' : value
          }))}
          disabled={loadingEmpresas}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Selecione..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas</SelectItem>
            {empresas.map((emp) => (
              <SelectItem key={emp.codEmpresa} value={String(emp.codEmpresa)}>
                {emp.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Data Início */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1 text-xs">
          <Calendar className="h-3 w-3" />
          Período Base Início
        </Label>
        <Input
          type="date"
          value={filters.dataInicio}
          onChange={(e) => setFilters(prev => ({ ...prev, dataInicio: e.target.value }))}
          className="w-[140px]"
        />
      </div>

      {/* Data Fim */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1 text-xs">
          <Calendar className="h-3 w-3" />
          Período Base Fim
        </Label>
        <Input
          type="date"
          value={filters.dataFim}
          onChange={(e) => setFilters(prev => ({ ...prev, dataFim: e.target.value }))}
          className="w-[140px]"
        />
      </div>

      {/* Tipo/Família */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1 text-xs">
          <Layers className="h-3 w-3" />
          Categoria
        </Label>
        <Select
          value={filters.tipoFiltro}
          onValueChange={(value: OtbFiltersType['tipoFiltro']) => 
            setFilters(prev => ({ ...prev, tipoFiltro: value }))
          }
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">
              Todas ({totalSkusBrutos})
            </SelectItem>
            <SelectItem value="LENTES" disabled={contagemPorCategoria?.lentes === 0}>
              {getCategoriaLabel('Lentes', contagemPorCategoria?.lentes ?? 0)}
            </SelectItem>
            <SelectItem value="ARMACOES" disabled={contagemPorCategoria?.armacoes === 0}>
              {getCategoriaLabel('Armações', contagemPorCategoria?.armacoes ?? 0)}
            </SelectItem>
            <SelectItem value="ACESSORIOS" disabled={contagemPorCategoria?.acessorios === 0}>
              {getCategoriaLabel('Acessórios', contagemPorCategoria?.acessorios ?? 0)}
            </SelectItem>
            <SelectItem value="OUTROS" disabled={contagemPorCategoria?.outros === 0}>
              {getCategoriaLabel('Outros', contagemPorCategoria?.outros ?? 0)}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Botão Calcular */}
      <Button 
        onClick={onReload} 
        disabled={loading}
        className="gap-2"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        {loading ? 'Calculando...' : 'Calcular OTB'}
      </Button>
    </div>
  );
}
