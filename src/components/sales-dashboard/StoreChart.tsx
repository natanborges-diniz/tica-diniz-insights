import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { ResumoLoja, ProjecaoFechamento } from '@/hooks/useVendasDashboard';
import { Store } from 'lucide-react';
import { ExportableCard } from '@/components/ui/exportable-card';
import { cn } from '@/lib/utils';

interface StoreChartProps {
  dados: ResumoLoja[];
  isLoading: boolean;
  usarVendasSemCreditos?: boolean;
  selectedLoja?: string | null;
  onLojaClick?: (loja: string) => void;
  projecao?: ProjecaoFechamento;
}

const COLORS = {
  default: 'hsl(var(--primary))',
  selected: 'hsl(var(--primary))',
  dimmed: 'hsl(var(--muted))',
  projecao: 'hsl(var(--primary)/0.3)',
};

// Função para formatar nome da loja (remove prefixo DINIZ e mantém apelido)
function formatarNomeLoja(nome: string): string {
  if (!nome) return '';
  // Remove "DINIZ " do início se existir
  const semPrefixo = nome.replace(/^DINIZ\s+/i, '');
  // Truncar se muito longo
  return semPrefixo.length > 12 ? semPrefixo.substring(0, 12) + '...' : semPrefixo;
}

export function StoreChart({ 
  dados, 
  isLoading, 
  usarVendasSemCreditos = true,
  selectedLoja,
  onLojaClick,
  projecao,
}: StoreChartProps) {
  // Calcula fator de projeção
  const fatorProjecao = projecao?.temProjecao && projecao.diasDecorridos > 0
    ? projecao.diasTotais / projecao.diasDecorridos
    : 1;

  const chartData = dados
    .filter(d => (usarVendasSemCreditos ? d.totalVendidoSemCreditos : d.totalVendido) > 0)
    .sort((a, b) => 
      usarVendasSemCreditos 
        ? b.totalVendidoSemCreditos - a.totalVendidoSemCreditos
        : b.totalVendido - a.totalVendido
    )
    .slice(0, 15)
    .map(d => {
      const valorAtual = usarVendasSemCreditos ? d.totalVendidoSemCreditos : d.totalVendido;
      const valorProjecao = projecao?.temProjecao ? valorAtual * fatorProjecao : valorAtual;
      return {
        loja: formatarNomeLoja(d.empresa),
        lojaFull: d.empresa,
        total: valorAtual,
        projecao: valorProjecao,
        quantidade: d.qtdTransacao,
      };
    });

  const titulo = usarVendasSemCreditos ? 'Vendas Válidas por Loja' : 'Vendas Totais por Loja';
  const tooltipLabel = usarVendasSemCreditos ? 'Vendas Válidas' : 'Vendas Totais';

  const handleBarClick = (data: any) => {
    if (onLojaClick && data?.lojaFull) {
      onLojaClick(data.lojaFull);
    }
  };

  const getBarColor = (lojaFull: string) => {
    if (!selectedLoja) return COLORS.default;
    return lojaFull === selectedLoja ? COLORS.selected : COLORS.dimmed;
  };

  if (isLoading) {
    return (
      <ExportableCard
        title={titulo}
        filename={`vendas_loja_${new Date().toISOString().split('T')[0]}`}
        icon={<Store className="h-5 w-5" />}
      >
        <Skeleton className="h-[300px] w-full" />
      </ExportableCard>
    );
  }

  const subtitulo = projecao?.temProjecao
    ? `Clique em uma barra para filtrar • Projeção: ${projecao.diasDecorridos}/${projecao.diasTotais} dias`
    : onLojaClick ? "Clique em uma barra para filtrar" : undefined;

  return (
    <ExportableCard
      title={titulo}
      filename={`vendas_loja_${new Date().toISOString().split('T')[0]}`}
      icon={<Store className="h-5 w-5" />}
      subtitle={subtitulo}
    >
      <ResponsiveContainer width="100%" height={300}>
        <BarChart 
          data={chartData} 
          layout="vertical" 
          margin={{ left: 80, right: 10 }}
          className={cn(onLojaClick && "cursor-pointer")}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" tickFormatter={(value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact' }).format(value)} />
          <YAxis dataKey="loja" type="category" width={75} tick={{ fontSize: 12 }} />
          <Tooltip 
            formatter={(value: number, name: string) => [
              new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value), 
              name === 'projecao' ? 'Projeção' : tooltipLabel
            ]}
            cursor={{ fill: 'hsl(var(--muted)/0.3)' }}
          />
          {/* Barra de projeção (fundo) */}
          {projecao?.temProjecao && (
            <Bar 
              dataKey="projecao" 
              radius={[0, 4, 4, 0]}
              fill={COLORS.projecao}
            />
          )}
          {/* Barra de valor atual (frente) */}
          <Bar 
            dataKey="total" 
            radius={[0, 4, 4, 0]}
            onClick={handleBarClick}
            style={{ cursor: onLojaClick ? 'pointer' : 'default' }}
          >
            {chartData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={getBarColor(entry.lojaFull)}
                className="transition-all duration-200"
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ExportableCard>
  );
}
