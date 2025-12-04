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

interface ResumoLoja {
  EMPRESA: string;
  TOTALORIGINAL: number;
  TOTALVENDIDO: number;
  TICKETMEDIO: number;
  TOTALDEVOLUCAO: number;
  QTDTRANSACAO: number;
  QTDDEVOLUCAO: number;
}

interface StoreTableProps {
  dados: ResumoLoja[];
  isLoading: boolean;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export function StoreTable({ dados, isLoading }: StoreTableProps) {
  const dadosOrdenados = [...dados].sort((a, b) => b.TOTALVENDIDO - a.TOTALVENDIDO);

  // Calcular totais
  const totais = dados.reduce(
    (acc, d) => ({
      totalOriginal: acc.totalOriginal + (d.TOTALORIGINAL || 0),
      totalVendido: acc.totalVendido + (d.TOTALVENDIDO || 0),
      totalDevolucao: acc.totalDevolucao + (d.TOTALDEVOLUCAO || 0),
      qtdTransacao: acc.qtdTransacao + (d.QTDTRANSACAO || 0),
      qtdDevolucao: acc.qtdDevolucao + (d.QTDDEVOLUCAO || 0),
    }),
    { totalOriginal: 0, totalVendido: 0, totalDevolucao: 0, qtdTransacao: 0, qtdDevolucao: 0 }
  );

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
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Loja</TableHead>
                <TableHead className="text-right">Total Original</TableHead>
                <TableHead className="text-right">Total Vendido</TableHead>
                <TableHead className="text-right">Ticket Médio</TableHead>
                <TableHead className="text-right">Qtde Vendas</TableHead>
                <TableHead className="text-right">Devoluções</TableHead>
                <TableHead className="text-right">Qtde Dev.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dadosOrdenados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Nenhum dado encontrado
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {dadosOrdenados.map((item, index) => (
                    <TableRow key={item.EMPRESA}>
                      <TableCell className="font-medium">
                        <span className="text-muted-foreground mr-2">#{index + 1}</span>
                        {item.EMPRESA}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(item.TOTALORIGINAL)}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(item.TOTALVENDIDO)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.TICKETMEDIO)}</TableCell>
                      <TableCell className="text-right">{item.QTDTRANSACAO}</TableCell>
                      <TableCell className="text-right text-destructive">
                        {item.TOTALDEVOLUCAO > 0 ? formatCurrency(item.TOTALDEVOLUCAO) : '-'}
                      </TableCell>
                      <TableCell className="text-right">{item.QTDDEVOLUCAO || '-'}</TableCell>
                    </TableRow>
                  ))}
                  {/* Linha de Totais */}
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell>TOTAL</TableCell>
                    <TableCell className="text-right">{formatCurrency(totais.totalOriginal)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(totais.totalVendido)}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totais.qtdTransacao > 0 ? totais.totalVendido / totais.qtdTransacao : 0)}
                    </TableCell>
                    <TableCell className="text-right">{totais.qtdTransacao}</TableCell>
                    <TableCell className="text-right text-destructive">{formatCurrency(totais.totalDevolucao)}</TableCell>
                    <TableCell className="text-right">{totais.qtdDevolucao}</TableCell>
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
