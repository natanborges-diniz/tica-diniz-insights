import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { AnaliseEstoqueAcao } from '@/services/estoqueService';
import { BarChart3 } from 'lucide-react';
import { ExportableCard } from '@/components/ui/exportable-card';

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
    <ExportableCard
      title="Estoque por Ação Sugerida"
      filename={`estoque_acao_${new Date().toISOString().split('T')[0]}`}
      icon={<BarChart3 className="h-5 w-5" />}
    >
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
    </ExportableCard>
  );
}
