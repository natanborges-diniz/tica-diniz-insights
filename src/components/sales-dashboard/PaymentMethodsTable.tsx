import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ResumoFormaPagamento } from '@/services/firebirdBridge';
import { CreditCard } from 'lucide-react';

interface PaymentMethodsTableProps {
  dados: ResumoFormaPagamento[];
  isLoading?: boolean;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
}

export function PaymentMethodsTable({ dados, isLoading }: PaymentMethodsTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Resumo por Forma de Pagamento
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : dados.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">Nenhum dado encontrado</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Forma de Pagamento</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Qtde Vendas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dados.map((item, index) => (
                <TableRow key={`${item.empresa}-${item.vendedor}-${item.formaPagamento}-${index}`}>
                  <TableCell className="font-medium">{item.empresa}</TableCell>
                  <TableCell>{item.vendedor}</TableCell>
                  <TableCell>{item.formaPagamento}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.totalGeral)}</TableCell>
                  <TableCell className="text-right">{item.qtdVendas}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
