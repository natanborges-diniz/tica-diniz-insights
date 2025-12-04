import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AnaliseFamiliaVendedor, Empresa } from '@/services/firebirdBridge';

interface SalesFamilyFiltersProps {
  // Empresa
  empresas: Empresa[];
  selectedEmpresaId: number | null;
  onEmpresaChange: (id: number) => void;
  // Datas
  dataInicio: string;
  dataFim: string;
  onDataInicioChange: (value: string) => void;
  onDataFimChange: (value: string) => void;
  // Filtros internos
  dados: AnaliseFamiliaVendedor[];
  filtroVendedor: string;
  setFiltroVendedor: (value: string) => void;
  filtroFamilia: string;
  setFiltroFamilia: (value: string) => void;
  filtroBuscaTexto: string;
  setFiltroBuscaTexto: (value: string) => void;
}

export function SalesFamilyFilters({
  empresas,
  selectedEmpresaId,
  onEmpresaChange,
  dataInicio,
  dataFim,
  onDataInicioChange,
  onDataFimChange,
  dados,
  filtroVendedor,
  setFiltroVendedor,
  filtroFamilia,
  setFiltroFamilia,
  filtroBuscaTexto,
  setFiltroBuscaTexto,
}: SalesFamilyFiltersProps) {
  // Listas únicas de vendedores e famílias
  const vendedores = useMemo(() => {
    const set = new Set(dados.map(item => item.VENDEDOR).filter(Boolean));
    return Array.from(set).sort();
  }, [dados]);

  const familias = useMemo(() => {
    const set = new Set(dados.map(item => item.FAMILIA).filter(Boolean));
    return Array.from(set).sort();
  }, [dados]);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {/* Empresa */}
      <div className="space-y-2">
        <Label htmlFor="empresa">Empresa</Label>
        <select
          id="empresa"
          value={selectedEmpresaId ?? ''}
          onChange={(e) => onEmpresaChange(Number(e.target.value))}
          className="w-full px-3 py-2 border rounded-md bg-background"
        >
          {empresas.map((emp) => (
            <option key={emp.COD_EMPRESA} value={emp.COD_EMPRESA}>
              {emp.EMPRESA}
            </option>
          ))}
        </select>
      </div>

      {/* Data Início */}
      <div className="space-y-2">
        <Label htmlFor="dataInicio">Data Início</Label>
        <Input
          id="dataInicio"
          type="date"
          value={dataInicio}
          onChange={(e) => onDataInicioChange(e.target.value)}
        />
      </div>

      {/* Data Fim */}
      <div className="space-y-2">
        <Label htmlFor="dataFim">Data Fim</Label>
        <Input
          id="dataFim"
          type="date"
          value={dataFim}
          onChange={(e) => onDataFimChange(e.target.value)}
        />
      </div>

      {/* Vendedor */}
      <div className="space-y-2">
        <Label htmlFor="vendedor">Vendedor</Label>
        <select
          id="vendedor"
          value={filtroVendedor}
          onChange={(e) => setFiltroVendedor(e.target.value)}
          className="w-full px-3 py-2 border rounded-md bg-background"
        >
          <option value="TODOS">Todos</option>
          {vendedores.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {/* Família */}
      <div className="space-y-2">
        <Label htmlFor="familia">Família</Label>
        <select
          id="familia"
          value={filtroFamilia}
          onChange={(e) => setFiltroFamilia(e.target.value)}
          className="w-full px-3 py-2 border rounded-md bg-background"
        >
          <option value="TODAS">Todas</option>
          {familias.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>

      {/* Busca */}
      <div className="space-y-2">
        <Label htmlFor="busca">Buscar</Label>
        <Input
          id="busca"
          type="text"
          placeholder="Vendedor, família ou empresa..."
          value={filtroBuscaTexto}
          onChange={(e) => setFiltroBuscaTexto(e.target.value)}
        />
      </div>
    </div>
  );
}
