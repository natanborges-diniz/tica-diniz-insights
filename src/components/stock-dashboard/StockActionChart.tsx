import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { AnaliseEstoqueAcao } from '@/services/estoqueService';
import { BarChart3 } from 'lucide-react';
import { ExportableCard } from '@/components/ui/exportable-card';
import { cn } from '@/lib/utils';

interface StockActionChartProps {
  dados: AnaliseEstoqueAcao[];
  selectedAcao?: string | null;
  onAcaoClick?: (acao: string) => void;
}

const COLORS = {
  default: 'hsl(var(--primary))',
  selected: 'hsl(var(--primary))',
  dimmed: 'hsl(var(--muted))',
};

export function StockActionChart({ dados, selectedAcao, onAcaoClick }: StockActionChartProps) {
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

  const handleBarClick = (data: any) => {
    if (onAcaoClick && data?.acao) {
      onAcaoClick(data.acao);
    }
  };

  const getBarColor = (acao: string) => {
    if (!selectedAcao) return COLORS.default;
    return acao === selectedAcao ? COLORS.selected : COLORS.dimmed;
  };

  return (
    <ExportableCard
      title="Estoque por Ação Sugerida"
      filename={`estoque_acao_${new Date().toISOString().split('T')[0]}`}
      icon={<BarChart3 className="h-5 w-5" />}
      subtitle={onAcaoClick ? "Clique em uma barra para filtrar" : undefined}
    >
      <ResponsiveContainer width="100%" height={300}>
        <BarChart 
          data={chartData} 
          layout="vertical" 
          margin={{ left: 100 }}
          className={cn(onAcaoClick && "cursor-pointer")}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" tickFormatter={(value) => value.toLocaleString('pt-BR')} />
          <YAxis dataKey="acao" type="category" width={90} tick={{ fontSize: 12 }} />
          <Tooltip
            formatter={(value: number) => [value.toLocaleString('pt-BR') + ' peças', 'Quantidade']}
            cursor={{ fill: 'hsl(var(--muted)/0.3)' }}
          />
          <Bar 
            dataKey="total" 
            radius={[0, 4, 4, 0]}
            onClick={handleBarClick}
            style={{ cursor: onAcaoClick ? 'pointer' : 'default' }}
          >
            {chartData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={getBarColor(entry.acao)}
                className="transition-all duration-200"
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ExportableCard>
  );
}
