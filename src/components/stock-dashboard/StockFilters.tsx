import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AnaliseEstoqueAcao } from '@/services/estoqueService';

interface StockFiltersProps {
  dados: AnaliseEstoqueAcao[];
  fornecedorSelecionado: string;
  setFornecedorSelecionado: (v: string) => void;
  marcaSelecionada: string;
  setMarcaSelecionada: (v: string) => void;
  acaoSelecionada: string;
  setAcaoSelecionada: (v: string) => void;
  buscaTexto: string;
  setBuscaTexto: (v: string) => void;
}

export function StockFilters({
  dados,
  fornecedorSelecionado,
  setFornecedorSelecionado,
  marcaSelecionada,
  setMarcaSelecionada,
  acaoSelecionada,
  setAcaoSelecionada,
  buscaTexto,
  setBuscaTexto,
}: StockFiltersProps) {
  const fornecedores = Array.from(new Set(dados.map(d => d.fornecedor).filter(Boolean))).sort();
  const marcas = Array.from(new Set(dados.map(d => d.marca).filter(Boolean))).sort();
  const acoes = Array.from(new Set(dados.map(d => d.acaoSugerida).filter(Boolean))).sort();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="space-y-1.5">
        <Label>Fornecedor</Label>
        <select
          value={fornecedorSelecionado}
          onChange={(e) => setFornecedorSelecionado(e.target.value)}
          className="w-full px-3 py-2 border rounded-md bg-background text-foreground"
        >
          <option value="TODOS">Todos</option>
          {fornecedores.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label>Marca</Label>
        <select
          value={marcaSelecionada}
          onChange={(e) => setMarcaSelecionada(e.target.value)}
          className="w-full px-3 py-2 border rounded-md bg-background text-foreground"
        >
          <option value="TODAS">Todas</option>
          {marcas.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label>Ação sugerida</Label>
        <select
          value={acaoSelecionada}
          onChange={(e) => setAcaoSelecionada(e.target.value)}
          className="w-full px-3 py-2 border rounded-md bg-background text-foreground"
        >
          <option value="TODAS">Todas</option>
          {acoes.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label>Buscar produto</Label>
        <Input
          type="text"
          placeholder="Descrição ou código..."
          value={buscaTexto}
          onChange={(e) => setBuscaTexto(e.target.value)}
        />
      </div>
    </div>
  );
}
