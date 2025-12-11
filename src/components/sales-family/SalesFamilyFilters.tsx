import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AnaliseFamiliaVendedor, Empresa } from '@/services/firebirdBridge';

interface SalesFamilyFiltersProps {
  empresas: Empresa[];
  selectedEmpresaId: number | null;
  onEmpresaChange: (id: number) => void;
  dataInicio: string;
  dataFim: string;
  onDataInicioChange: (value: string) => void;
  onDataFimChange: (value: string) => void;
  dados: AnaliseFamiliaVendedor[];
  filtroVendedor: string;
  setFiltroVendedor: (value: string) => void;
  filtroFamilia: string;
  setFiltroFamilia: (value: string) => void;
  filtroBuscaTexto: string;
  setFiltroBuscaTexto: (value: string) => void;
}

export function SalesFamilyFilters({
  empresas, selectedEmpresaId, onEmpresaChange,
  dataInicio, dataFim, onDataInicioChange, onDataFimChange,
  dados, filtroVendedor, setFiltroVendedor,
  filtroFamilia, setFiltroFamilia, filtroBuscaTexto, setFiltroBuscaTexto,
}: SalesFamilyFiltersProps) {
  const vendedores = useMemo(() => {
    const set = new Set(dados.map(item => item.vendedor).filter(Boolean));
    return Array.from(set).sort();
  }, [dados]);

  const familias = useMemo(() => {
    const set = new Set(dados.map(item => item.familia).filter(Boolean));
    return Array.from(set).sort();
  }, [dados]);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <div className="space-y-2">
        <Label htmlFor="empresa">Empresa</Label>
        <select id="empresa" value={selectedEmpresaId ?? ''} onChange={(e) => onEmpresaChange(Number(e.target.value))} className="w-full px-3 py-2 border rounded-md bg-background">
          {empresas.map((emp) => (<option key={emp.codEmpresa} value={emp.codEmpresa}>{emp.empresaNome}</option>))}
        </select>
      </div>
      <div className="space-y-2"><Label>Data Início</Label><Input type="date" value={dataInicio} onChange={(e) => onDataInicioChange(e.target.value)} /></div>
      <div className="space-y-2"><Label>Data Fim</Label><Input type="date" value={dataFim} onChange={(e) => onDataFimChange(e.target.value)} /></div>
      <div className="space-y-2">
        <Label>Vendedor</Label>
        <select value={filtroVendedor} onChange={(e) => setFiltroVendedor(e.target.value)} className="w-full px-3 py-2 border rounded-md bg-background">
          <option value="TODOS">Todos</option>
          {vendedores.map((v) => (<option key={v} value={v}>{v}</option>))}
        </select>
      </div>
      <div className="space-y-2">
        <Label>Família</Label>
        <select value={filtroFamilia} onChange={(e) => setFiltroFamilia(e.target.value)} className="w-full px-3 py-2 border rounded-md bg-background">
          <option value="TODAS">Todas</option>
          {familias.map((f) => (<option key={f} value={f}>{f}</option>))}
        </select>
      </div>
      <div className="space-y-2"><Label>Buscar</Label><Input type="text" placeholder="Vendedor, família..." value={filtroBuscaTexto} onChange={(e) => setFiltroBuscaTexto(e.target.value)} /></div>
    </div>
  );
}
