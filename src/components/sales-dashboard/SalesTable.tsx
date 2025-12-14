import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { TableIcon } from 'lucide-react';
import { ResumoEmpresaVendedor } from '@/services/vendasService';

interface SalesTableProps {
  dados: ResumoEmpresaVendedor[];
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

export function SalesTable({ dados, isLoading }: SalesTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <TableIcon className="h-5 w-5 text-primary" />
          Detalhamento por Empresa e Vendedor
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : dados.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            Sem dados para o período selecionado
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead className="text-right">Total Original</TableHead>
                  <TableHead className="text-right">Total Vendido</TableHead>
                  <TableHead className="text-right">Ticket Médio</TableHead>
                  <TableHead className="text-right">Qtd. Transações</TableHead>
                  <TableHead className="text-right">Total Devoluções</TableHead>
                  <TableHead className="text-right">Qtd. Devoluções</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dados.map((row, index) => (
                  <TableRow key={`${row.empresa}-${row.vendedor}-${index}`}>
                    <TableCell className="font-medium">{row.empresa}</TableCell>
                    <TableCell>{row.vendedor}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.totalOriginal || 0)}</TableCell>
                    <TableCell className="text-right font-semibold text-emerald-600">
                      {formatCurrency(row.totalVendido || 0)}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(row.ticketMedio || 0)}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.qtdTransacao || 0)}</TableCell>
                    <TableCell className="text-right text-orange-600">
                      {formatCurrency(row.totalDevolucao || 0)}
                    </TableCell>
                    <TableCell className="text-right">{formatNumber(row.qtdDevolucao || 0)}</TableCell>
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
