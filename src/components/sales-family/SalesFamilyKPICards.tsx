import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, Receipt, Package, TrendingUp } from 'lucide-react';
import { AnaliseFamiliaVendedor } from '@/services/vendasService';

interface SalesFamilyKPICardsProps { dados: AnaliseFamiliaVendedor[]; }

/**
 * Glossário (aplicado em toda a página):
 * - Faturamento = soma de totalVendido
 * - Vendas      = nº de cupons/transações distintas (qtdTransacao)
 * - Peças       = unidades de produto vendidas (qtdProdutos)
 * - Ticket médio = Faturamento / Vendas
 */
export function SalesFamilyKPICards({ dados }: SalesFamilyKPICardsProps) {
  const faturamento = dados.reduce((acc, item) => acc + (item.totalVendido || 0), 0);
  const vendas = dados.reduce((acc, item) => acc + (item.qtdTransacao || 0), 0);
  const pecas = dados.reduce((acc, item) => acc + (item.qtdProdutos || 0), 0);
  const ticketMedio = vendas > 0 ? faturamento / vendas : 0;
  const formatCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Faturamento</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(faturamento)}</div>
          <p className="text-xs text-muted-foreground mt-1">Receita total do período</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Vendas</CardTitle>
          <Receipt className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{vendas.toLocaleString('pt-BR')}</div>
          <p className="text-xs text-muted-foreground mt-1">Cupons/transações distintas</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Peças</CardTitle>
          <Package className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{pecas.toLocaleString('pt-BR')}</div>
          <p className="text-xs text-muted-foreground mt-1">Unidades de produto vendidas</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Ticket Médio</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(ticketMedio)}</div>
          <p className="text-xs text-muted-foreground mt-1">Faturamento ÷ Vendas</p>
        </CardContent>
      </Card>
    </div>
  );
}
