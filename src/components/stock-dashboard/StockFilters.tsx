import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AnaliseEstoqueAcao } from '@/services/firebirdBridge';

interface StockFiltersProps {
  dados: AnaliseEstoqueAcao[];
  fornecedorSelecionado: string;
  setFornecedorSelecionado: (value: string) => void;
  grifeSelecionada: string;
  setGrifeSelecionada: (value: string) => void;
  acaoSelecionada: string;
  setAcaoSelecionada: (value: string) => void;
  buscaTexto: string;
  setBuscaTexto: (value: string) => void;
}

export function StockFilters({
  dados,
  fornecedorSelecionado,
  setFornecedorSelecionado,
  grifeSelecionada,
  setGrifeSelecionada,
  acaoSelecionada,
  setAcaoSelecionada,
  buscaTexto,
  setBuscaTexto,
}: StockFiltersProps) {
  // Listas únicas ordenadas
  const fornecedores = Array.from(new Set(dados.map(d => d.NOME_FORNECEDOR).filter(Boolean))).sort();
  const grifes = Array.from(new Set(dados.map(d => d.GRIFE).filter(Boolean))).sort();
  const acoes = Array.from(new Set(dados.map(d => d.ACAO_SUGERIDA).filter(Boolean))).sort();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Fornecedor */}
      <div className="space-y-1.5">
        <Label htmlFor="fornecedor">Fornecedor</Label>
        <select
          id="fornecedor"
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

      {/* Grife */}
      <div className="space-y-1.5">
        <Label htmlFor="grife">Grife</Label>
        <select
          id="grife"
          value={grifeSelecionada}
          onChange={(e) => setGrifeSelecionada(e.target.value)}
          className="w-full px-3 py-2 border rounded-md bg-background text-foreground"
        >
          <option value="TODAS">Todas</option>
          {grifes.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </div>

      {/* Ação Sugerida */}
      <div className="space-y-1.5">
        <Label htmlFor="acao">Ação sugerida</Label>
        <select
          id="acao"
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

      {/* Busca */}
      <div className="space-y-1.5">
        <Label htmlFor="busca">Buscar produto</Label>
        <Input
          id="busca"
          type="text"
          placeholder="Descrição ou código de barras..."
          value={buscaTexto}
          onChange={(e) => setBuscaTexto(e.target.value)}
        />
      </div>
    </div>
  );
}
