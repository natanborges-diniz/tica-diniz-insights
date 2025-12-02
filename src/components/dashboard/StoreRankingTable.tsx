import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy } from 'lucide-react';

interface StoreRankingTableProps {
  data: { 
    loja: string; 
    faturamento: number; 
    quantidade: number;
    ticketMedio: number;
  }[];
  isLoading?: boolean;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value);
}

export function StoreRankingTable({ data, isLoading }: StoreRankingTableProps) {
  return (
    <Card className="col-span-1 lg:col-span-3">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" />
          Ranking de Lojas
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            Sem dados para o período selecionado
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Loja</TableHead>
                  <TableHead className="text-right">Faturamento</TableHead>
                  <TableHead className="text-right">Vendas</TableHead>
                  <TableHead className="text-right">Ticket Médio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row, index) => (
                  <TableRow key={row.loja}>
                    <TableCell className="font-medium">
                      {index === 0 && <span className="text-amber-500">🥇</span>}
                      {index === 1 && <span className="text-slate-400">🥈</span>}
                      {index === 2 && <span className="text-amber-700">🥉</span>}
                      {index > 2 && <span className="text-muted-foreground">{index + 1}</span>}
                    </TableCell>
                    <TableCell className="font-medium">{row.loja}</TableCell>
                    <TableCell className="text-right font-semibold text-emerald-600">
                      {formatCurrency(row.faturamento)}
                    </TableCell>
                    <TableCell className="text-right">{formatNumber(row.quantidade)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.ticketMedio)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
