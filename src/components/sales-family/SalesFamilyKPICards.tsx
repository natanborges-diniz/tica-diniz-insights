import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, ShoppingCart, Package, TrendingUp } from 'lucide-react';
import { AnaliseFamiliaVendedor } from '@/services/firebirdBridge';

interface SalesFamilyKPICardsProps {
  dados: AnaliseFamiliaVendedor[];
}

export function SalesFamilyKPICards({ dados }: SalesFamilyKPICardsProps) {
  const totalVendido = dados.reduce((acc, item) => acc + (item.TOTAL_VENDIDO || 0), 0);
  const totalTransacoes = dados.reduce((acc, item) => acc + (item.QTD_TRANSACAO || 0), 0);
  const totalProdutos = dados.reduce((acc, item) => acc + (item.QTD_PRODUTOS || 0), 0);
  const ticketMedio = totalTransacoes > 0 ? totalVendido / totalTransacoes : 0;

  const formatCurrency = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Vendido</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(totalVendido)}</div>
          <p className="text-xs text-muted-foreground">no período</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Nº Transações</CardTitle>
          <ShoppingCart className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalTransacoes.toLocaleString('pt-BR')}</div>
          <p className="text-xs text-muted-foreground">vendas realizadas</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Produtos Vendidos</CardTitle>
          <Package className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalProdutos.toLocaleString('pt-BR')}</div>
          <p className="text-xs text-muted-foreground">unidades</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Ticket Médio</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(ticketMedio)}</div>
          <p className="text-xs text-muted-foreground">por transação</p>
        </CardContent>
      </Card>
    </div>
  );
}
