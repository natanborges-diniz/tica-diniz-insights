import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { AnaliseEstoqueAcao } from '@/services/estoqueService';

interface StockActionChartProps {
  dados: AnaliseEstoqueAcao[];
}

export function StockActionChart({ dados }: StockActionChartProps) {
  // Agrupar por ação sugerida e somar quantidade
  const acaoMap = new Map<string, number>();
  
  dados.forEach(item => {
    const acao = item.acaoSugerida || 'SEM AÇÃO';
    const atual = acaoMap.get(acao) || 0;
    acaoMap.set(acao, atual + (item.quantidadeEstoque || 0));
  });

  const chartData = Array.from(acaoMap.entries())
    .map(([acao, total]) => ({ acao, total }))
    .sort((a, b) => b.total - a.total);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Estoque por Ação Sugerida</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 100 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" tickFormatter={(value) => value.toLocaleString('pt-BR')} />
            <YAxis dataKey="acao" type="category" width={90} tick={{ fontSize: 12 }} />
            <Tooltip
              formatter={(value: number) => [value.toLocaleString('pt-BR') + ' peças', 'Quantidade']}
            />
            <Bar dataKey="total" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
