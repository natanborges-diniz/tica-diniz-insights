import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ResumoFormaPagamento } from '@/services/vendasService';
import { CreditCard, TrendingUp, TrendingDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

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

interface ResumoAgrupado {
  formaPagamento: string;
  totalGeral: number;
  qtdVendas: number;
  ticketMedio: number;
  percentual: number;
}

export function PaymentMethodsTable({ dados, isLoading }: PaymentMethodsTableProps) {
  // Agrupa por forma de pagamento - padrão de mercado: visão consolidada
  const resumoAgrupado = dados.reduce((acc, item) => {
    const key = item.formaPagamento;
    if (!acc[key]) {
      acc[key] = {
        formaPagamento: key,
        totalGeral: 0,
        qtdVendas: 0,
        ticketMedio: 0,
        percentual: 0,
      };
    }
    acc[key].totalGeral += item.totalGeral;
    acc[key].qtdVendas += item.qtdVendas;
    return acc;
  }, {} as Record<string, ResumoAgrupado>);

  // Calcula total geral e percentuais
  const totalGeral = Object.values(resumoAgrupado).reduce((sum, item) => sum + item.totalGeral, 0);
  
  const dadosFinais = Object.values(resumoAgrupado)
    .map(item => ({
      ...item,
      ticketMedio: item.qtdVendas > 0 ? item.totalGeral / item.qtdVendas : 0,
      percentual: totalGeral > 0 ? (item.totalGeral / totalGeral) * 100 : 0,
    }))
    .sort((a, b) => b.totalGeral - a.totalGeral);

  // Identifica top performers para highlight
  const maxTotal = dadosFinais[0]?.totalGeral || 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Análise por Forma de Pagamento
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : dadosFinais.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">Nenhum dado encontrado</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Forma de Pagamento</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Qtd Vendas</TableHead>
                  <TableHead className="text-right">Ticket Médio</TableHead>
                  <TableHead className="text-right">% Part.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dadosFinais.map((item) => {
                  const isTop = item.totalGeral === maxTotal && maxTotal > 0;
                  const isNegative = item.totalGeral < 0;
                  
                  return (
                    <TableRow key={item.formaPagamento} className={isTop ? 'bg-primary/5' : ''}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {item.formaPagamento}
                          {isTop && (
                            <Badge variant="secondary" className="text-xs">
                              <TrendingUp className="h-3 w-3 mr-1" />
                              Principal
                            </Badge>
                          )}
                          {isNegative && (
                            <Badge variant="destructive" className="text-xs">
                              <TrendingDown className="h-3 w-3 mr-1" />
                              Devolução
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${isNegative ? 'text-destructive' : ''}`}>
                        {formatCurrency(item.totalGeral)}
                      </TableCell>
                      <TableCell className="text-right">{item.qtdVendas}</TableCell>
                      <TableCell className="text-right">{formatCurrency(item.ticketMedio)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 bg-muted rounded-full h-2 overflow-hidden">
                            <div 
                              className="bg-primary h-full transition-all" 
                              style={{ width: `${Math.max(0, Math.min(100, item.percentual))}%` }}
                            />
                          </div>
                          <span className="w-12 text-right">{item.percentual.toFixed(1)}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            
            {/* Rodapé com totais */}
            <div className="mt-4 pt-4 border-t flex justify-between items-center text-sm">
              <span className="text-muted-foreground">
                {dadosFinais.length} formas de pagamento
              </span>
              <div className="flex gap-6">
                <span>
                  <span className="text-muted-foreground">Total: </span>
                  <span className="font-bold">{formatCurrency(totalGeral)}</span>
                </span>
                <span>
                  <span className="text-muted-foreground">Vendas: </span>
                  <span className="font-bold">
                    {dadosFinais.reduce((sum, item) => sum + item.qtdVendas, 0)}
                  </span>
                </span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
