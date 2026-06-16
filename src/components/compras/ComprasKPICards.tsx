import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, FileText, Users, Receipt, Calendar, TrendingUp, TrendingDown } from "lucide-react";
import { ComprasNota } from "@/services/comprasService";

interface Props {
  notas: ComprasNota[];
  notasAnterior?: ComprasNota[];
}

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtInt = (v: number) => v.toLocaleString("pt-BR");

function calcular(notas: ComprasNota[]) {
  const total = notas.reduce((a, n) => a + n.valorTotal, 0);
  const fornecedores = new Set(notas.map(n => n.fornecedor)).size;
  const parcelas = notas.reduce((a, n) => a + n.qtdParcelas, 0);
  const prazoMedio = notas.length > 0
    ? Math.round(notas.reduce((a, n) => a + n.prazoMedioDias, 0) / notas.length)
    : 0;
  return {
    total,
    notas: notas.length,
    fornecedores,
    ticket: notas.length > 0 ? total / notas.length : 0,
    parcelas,
    prazoMedio,
  };
}

function Delta({ atual, anterior, invert = false }: { atual: number; anterior: number; invert?: boolean }) {
  if (anterior === 0) return null;
  const diff = ((atual - anterior) / anterior) * 100;
  const isUp = diff >= 0;
  const isBad = invert ? isUp : !isUp;
  return (
    <p className={`text-xs mt-1 flex items-center gap-1 ${isBad ? "text-destructive" : "text-emerald-600"}`}>
      {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {Math.abs(diff).toFixed(1)}% vs período comparado
    </p>
  );
}

export function ComprasKPICards({ notas, notasAnterior }: Props) {
  const c = calcular(notas);
  const p = notasAnterior ? calcular(notasAnterior) : null;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Comprado</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{fmtBRL(c.total)}</div>
          {p && <Delta atual={c.total} anterior={p.total} invert />}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Nº de Notas</CardTitle>
          <FileText className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{fmtInt(c.notas)}</div>
          {p && <Delta atual={c.notas} anterior={p.notas} />}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Fornecedores</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{fmtInt(c.fornecedores)}</div>
          {p && <Delta atual={c.fornecedores} anterior={p.fornecedores} />}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Ticket Médio</CardTitle>
          <Receipt className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{fmtBRL(c.ticket)}</div>
          {p && <Delta atual={c.ticket} anterior={p.ticket} invert />}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Nº Parcelas</CardTitle>
          <FileText className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{fmtInt(c.parcelas)}</div>
          {p && <Delta atual={c.parcelas} anterior={p.parcelas} />}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Prazo Médio</CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{c.prazoMedio}d</div>
          <p className="text-xs text-muted-foreground mt-1">Emissão → Vencimento</p>
        </CardContent>
      </Card>
    </div>
  );
}
