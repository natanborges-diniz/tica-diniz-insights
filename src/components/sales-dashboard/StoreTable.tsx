import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ResumoLoja } from '@/hooks/useVendasDashboard';

interface StoreTableProps {
  dados: ResumoLoja[];
  isLoading: boolean;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatPercent = (value: number) => `${value.toFixed(2)}%`;

export function StoreTable({ dados, isLoading }: StoreTableProps) {
  // Ordenar por faturamento real (com devoluções)
  const dadosOrdenados = [...dados].sort((a, b) => b.totalLiquidoComDevolucoes - a.totalLiquidoComDevolucoes);

  // Calcular totais
  const totais = dados.reduce(
    (acc, d) => ({
      totalBruto: acc.totalBruto + (d.totalBruto || 0),
      totalDesconto: acc.totalDesconto + (d.totalDesconto || 0),
      totalVendido: acc.totalVendido + (d.totalVendido || 0),
      totalDevolucao: acc.totalDevolucao + (d.totalDevolucao || 0),
      totalLiquidoSemDevolucoes: acc.totalLiquidoSemDevolucoes + (d.totalLiquidoSemDevolucoes || 0),
      totalLiquidoComDevolucoes: acc.totalLiquidoComDevolucoes + (d.totalLiquidoComDevolucoes || 0),
      qtdTransacao: acc.qtdTransacao + (d.qtdTransacao || 0),
    }),
    { totalBruto: 0, totalDesconto: 0, totalVendido: 0, totalDevolucao: 0, totalLiquidoSemDevolucoes: 0, totalLiquidoComDevolucoes: 0, qtdTransacao: 0 }
  );

  const percentualDescontoTotal = totais.totalBruto > 0 ? (totais.totalDesconto / totais.totalBruto) * 100 : 0;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ranking por Loja</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ranking por Loja</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Loja</TableHead>
                <TableHead className="text-right">Total Bruto</TableHead>
                <TableHead className="text-right">Desconto</TableHead>
                <TableHead className="text-right">% Desc.</TableHead>
                <TableHead className="text-right">Total Vendido</TableHead>
                <TableHead className="text-right">Devolução</TableHead>
                <TableHead className="text-right">Fat. Real</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dadosOrdenados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Sem dados no período
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {dadosOrdenados.map((item, index) => (
                    <TableRow key={item.empresa}>
                      <TableCell className="font-medium">
                        <span className="text-muted-foreground mr-2">#{index + 1}</span>
                        {item.empresa}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(item.totalBruto)}</TableCell>
                      <TableCell className="text-right text-amber-600">{formatCurrency(item.totalDesconto)}</TableCell>
                      <TableCell className="text-right text-orange-600">{formatPercent(item.percentualDesconto)}</TableCell>
                      <TableCell className="text-right font-semibold text-emerald-600">{formatCurrency(item.totalVendido)}</TableCell>
                      <TableCell className="text-right text-red-600">
                        {item.totalDevolucao > 0 ? formatCurrency(item.totalDevolucao) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-bold text-purple-600">
                        {formatCurrency(item.totalLiquidoComDevolucoes)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Linha de Totais */}
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell>TOTAL</TableCell>
                    <TableCell className="text-right">{formatCurrency(totais.totalBruto)}</TableCell>
                    <TableCell className="text-right text-amber-600">{formatCurrency(totais.totalDesconto)}</TableCell>
                    <TableCell className="text-right text-orange-600">{formatPercent(percentualDescontoTotal)}</TableCell>
                    <TableCell className="text-right text-emerald-600">{formatCurrency(totais.totalVendido)}</TableCell>
                    <TableCell className="text-right text-red-600">{formatCurrency(totais.totalDevolucao)}</TableCell>
                    <TableCell className="text-right text-purple-600">{formatCurrency(totais.totalLiquidoComDevolucoes)}</TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
