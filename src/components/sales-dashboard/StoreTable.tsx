import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ResumoLoja } from '@/hooks/useVendasDashboard';

interface StoreTableProps {
  dados: ResumoLoja[];
  isLoading: boolean;
  usarVendasSemCreditos?: boolean;
}

const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const formatPercent = (value: number) => `${value.toFixed(2)}%`;

export function StoreTable({ dados, isLoading, usarVendasSemCreditos = true }: StoreTableProps) {
  const dadosOrdenados = [...dados].sort((a, b) => 
    usarVendasSemCreditos 
      ? b.totalVendidoSemCreditos - a.totalVendidoSemCreditos
      : b.totalVendido - a.totalVendido
  );
  const totais = dados.reduce((acc, d) => ({
    totalBruto: acc.totalBruto + (d.totalBruto || 0),
    totalDesconto: acc.totalDesconto + (d.totalDesconto || 0),
    totalVendido: acc.totalVendido + (d.totalVendido || 0),
    totalCreditos: acc.totalCreditos + (d.totalCreditos || 0),
    totalDevolucoes: acc.totalDevolucoes + (d.totalDevolucoes || 0),
    totalVendidoSemCreditos: acc.totalVendidoSemCreditos + (d.totalVendidoSemCreditos || 0),
    qtdTransacao: acc.qtdTransacao + (d.qtdTransacao || 0),
  }), { totalBruto: 0, totalDesconto: 0, totalVendido: 0, totalCreditos: 0, totalDevolucoes: 0, totalVendidoSemCreditos: 0, qtdTransacao: 0 });
  const percentualDescontoTotal = totais.totalBruto > 0 ? (totais.totalDesconto / totais.totalBruto) * 100 : 0;

  if (isLoading) return <Card><CardHeader><CardTitle>Ranking por Loja</CardTitle></CardHeader><CardContent><Skeleton className="h-[300px] w-full" /></CardContent></Card>;

  return (
    <Card>
      <CardHeader><CardTitle>Ranking por Loja</CardTitle></CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Loja</TableHead>
                <TableHead className={`text-right ${usarVendasSemCreditos ? 'bg-primary/10 font-bold' : ''}`}>Vendas s/ Créditos</TableHead>
                <TableHead className="text-right">Ticket Médio</TableHead>
                <TableHead className="text-right">% Desc.</TableHead>
                <TableHead className="text-right">Devoluções</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dadosOrdenados.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Sem dados no período</TableCell></TableRow>
              ) : (
                <>
                  {dadosOrdenados.map((item, index) => (
                    <TableRow key={item.empresa}>
                      <TableCell className="font-medium"><span className="text-muted-foreground mr-2">#{index + 1}</span>{item.empresa}</TableCell>
                      <TableCell className={`text-right ${usarVendasSemCreditos ? 'font-bold text-emerald-600 bg-primary/5' : ''}`}>{formatCurrency(item.totalVendidoSemCreditos)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.ticketMedio)}</TableCell>
                      <TableCell className="text-right text-orange-600">{formatPercent(item.percentualDesconto)}</TableCell>
                      <TableCell className="text-right text-red-600">{formatCurrency(item.totalDevolucoes)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell>TOTAL</TableCell>
                    <TableCell className={`text-right ${usarVendasSemCreditos ? 'font-bold text-emerald-600' : ''}`}>{formatCurrency(totais.totalVendidoSemCreditos)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(totais.qtdTransacao > 0 ? totais.totalVendidoSemCreditos / totais.qtdTransacao : 0)}</TableCell>
                    <TableCell className="text-right text-orange-600">{formatPercent(percentualDescontoTotal)}</TableCell>
                    <TableCell className="text-right text-red-600">{formatCurrency(totais.totalDevolucoes)}</TableCell>
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
