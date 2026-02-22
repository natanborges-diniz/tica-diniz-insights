import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TotaisInteligencia } from "@/hooks/useInteligenciaVendas";
import { DollarSign, Receipt, Target, Users, Store, TrendingUp, AlertTriangle } from "lucide-react";

interface InteligenciaKPICardsProps {
  totais: TotaisInteligencia;
  tipo: 'geral' | 'loja' | 'vendedor';
}

export function InteligenciaKPICards({ totais, tipo }: InteligenciaKPICardsProps) {
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const formatPercent = (value: number) =>
    new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value) + '%';

  const getMetaClass = (pct: number) =>
    pct >= 100 ? 'text-success' : pct >= 80 ? 'text-warning' : 'text-danger';

  if (tipo === 'vendedor') {
    return (
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vendedores Ativos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{totais.qtdVendedores}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Faturamento Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-success">{formatCurrency(totais.totalVendidoSemCreditos)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Média por Vendedor</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatCurrency(totais.qtdVendedores > 0 ? totais.totalVendidoSemCreditos / totais.qtdVendedores : 0)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ticket Médio Geral</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatCurrency(totais.ticketMedioGeral)}</div></CardContent>
        </Card>
      </div>
    );
  }

  if (tipo === 'loja') {
    return (
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Meta Total</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatCurrency(totais.metaTotal)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Faturamento</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-success">{formatCurrency(totais.totalVendidoSemCreditos)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">% Atingido</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className={`text-2xl font-bold ${getMetaClass(totais.percentualMetaGeral)}`}>{formatPercent(totais.percentualMetaGeral)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lojas em Risco</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totais.lojasEmRisco > 0 ? 'text-danger' : 'text-success'}`}>{totais.lojasEmRisco}</div>
            <p className="text-xs text-muted-foreground">de {totais.qtdLojas} lojas</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Visão Geral
  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Faturamento Total</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-success">{formatCurrency(totais.totalVendidoSemCreditos)}</div>
          <p className="text-xs text-muted-foreground">{totais.totalTransacoes.toLocaleString('pt-BR')} transações</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Meta vs Realizado</CardTitle>
          <Target className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${getMetaClass(totais.percentualMetaGeral)}`}>{formatPercent(totais.percentualMetaGeral)}</div>
          <p className="text-xs text-muted-foreground">Meta: {formatCurrency(totais.metaTotal)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Lojas</CardTitle>
          <Store className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totais.qtdLojas}</div>
          <p className="text-xs text-muted-foreground">
            <span className="text-success">{totais.lojasAcimaMedia} ok</span>
            {" • "}
            <span className="text-danger">{totais.lojasEmRisco} em risco</span>
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Vendedores</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totais.qtdVendedores}</div>
          <p className="text-xs text-muted-foreground">Ticket médio: {formatCurrency(totais.ticketMedioGeral)}</p>
        </CardContent>
      </Card>
    </div>
  );
}
