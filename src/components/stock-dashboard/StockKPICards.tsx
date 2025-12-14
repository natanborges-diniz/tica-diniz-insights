import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, Users, Tag, AlertTriangle } from 'lucide-react';
import { AnaliseEstoqueAcao } from '@/services/estoqueService';

interface StockKPICardsProps {
  dados: AnaliseEstoqueAcao[];
}

export function StockKPICards({ dados }: StockKPICardsProps) {
  const totalPecas = dados.reduce((acc, item) => acc + (item.quantidadeEstoque || 0), 0);
  
  const fornecedoresDistintos = new Set(dados.map(item => item.fornecedor)).size;
  
  const grifesDistintas = new Set(dados.map(item => item.marca)).size;
  
  const pecasLiquida = dados
    .filter(item => item.acaoSugerida?.toUpperCase().includes('LIQUIDA'))
    .reduce((acc, item) => acc + (item.quantidadeEstoque || 0), 0);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total em Estoque</CardTitle>
          <Package className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalPecas.toLocaleString('pt-BR')}</div>
          <p className="text-xs text-muted-foreground">peças</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Fornecedores</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{fornecedoresDistintos}</div>
          <p className="text-xs text-muted-foreground">distintos</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Marcas</CardTitle>
          <Tag className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{grifesDistintas}</div>
          <p className="text-xs text-muted-foreground">distintas</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Peças p/ Liquidar</CardTitle>
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{pecasLiquida.toLocaleString('pt-BR')}</div>
          <p className="text-xs text-muted-foreground">ação sugerida: liquidar</p>
        </CardContent>
      </Card>
    </div>
  );
}
