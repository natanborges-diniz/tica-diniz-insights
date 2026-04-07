import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarCheck, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Lancamento {
  id: string;
  status: string;
  natureza: string | null;
  categoria: string | null;
  subcategoria: string | null;
  descricao: string;
  pessoa_nome: string | null;
  valor: number;
  data_vencimento: string;
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  CLASSIFICADO: { label: "Classificado", variant: "outline" },
  BORDERO: { label: "Borderô", variant: "outline" },
  AUTORIZADO: { label: "Autorizado", variant: "default" },
  PROCESSANDO: { label: "Processando", variant: "outline" },
};

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

interface AgendaOficialTabProps {
  lancamentos: Lancamento[];
  isLoading: boolean;
}

export function AgendaOficialTab({ lancamentos, isLoading }: AgendaOficialTabProps) {
  // Only show CLASSIFICADO+ (exclude PREVISTO, CANCELADO, BAIXADO)
  const agendaStatuses = ["CLASSIFICADO", "BORDERO", "AUTORIZADO", "PROCESSANDO"];
  const filtered = lancamentos.filter(l => agendaStatuses.includes(l.status));

  // Group by month of vencimento
  const grouped = useMemo(() => {
    const map = new Map<string, Lancamento[]>();
    for (const l of filtered) {
      const monthKey = l.data_vencimento.substring(0, 7); // YYYY-MM
      if (!map.has(monthKey)) map.set(monthKey, []);
      map.get(monthKey)!.push(l);
    }
    // Sort by month key ascending
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  // KPIs
  const totalClassificado = filtered.filter(l => l.status === "CLASSIFICADO").reduce((s, l) => s + l.valor, 0);
  const totalBordero = filtered.filter(l => l.status === "BORDERO").reduce((s, l) => s + l.valor, 0);
  const totalAutorizado = filtered.filter(l => ["AUTORIZADO", "PROCESSANDO"].includes(l.status)).reduce((s, l) => s + l.valor, 0);
  const totalGeral = filtered.reduce((s, l) => s + l.valor, 0);

  const formatMonthTitle = (monthKey: string) => {
    try {
      const d = parseISO(`${monthKey}-01`);
      return format(d, "MMMM yyyy", { locale: ptBR }).replace(/^\w/, c => c.toUpperCase());
    } catch {
      return monthKey;
    }
  };

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Classificados</CardTitle>
          </CardHeader>
          <CardContent><p className="text-xl font-bold">{fmtCurrency(totalClassificado)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Em Borderô</CardTitle>
          </CardHeader>
          <CardContent><p className="text-xl font-bold">{fmtCurrency(totalBordero)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Autorizados</CardTitle>
          </CardHeader>
          <CardContent><p className="text-xl font-bold">{fmtCurrency(totalAutorizado)}</p></CardContent>
        </Card>
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-primary flex items-center gap-1">
              <TrendingDown className="h-4 w-4" /> Total Agenda
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-xl font-bold text-primary">{fmtCurrency(totalGeral)}</p></CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <CalendarCheck className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhuma conta classificada. Classifique lançamentos na aba "Contas a Pagar".</p>
        </div>
      ) : (
        grouped.map(([monthKey, items]) => {
          const monthTotal = items.reduce((s, l) => s + l.valor, 0);
          return (
            <Card key={monthKey}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{formatMonthTitle(monthKey)}</CardTitle>
                  <span className="text-sm font-semibold text-muted-foreground">{fmtCurrency(monthTotal)}</span>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Conta</TableHead>
                      <TableHead>Fornecedor</TableHead>
                      <TableHead className="w-[95px]">Vencimento</TableHead>
                      <TableHead className="w-[110px] text-right">Valor</TableHead>
                      <TableHead className="w-[100px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map(l => {
                      const sc = STATUS_CONFIG[l.status] || { label: l.status, variant: "outline" as const };
                      return (
                        <TableRow key={l.id}>
                          <TableCell className="text-sm font-medium">{(l.subcategoria || l.descricao).toUpperCase()}</TableCell>
                          <TableCell className="text-sm">{l.pessoa_nome?.toUpperCase() || "—"}</TableCell>
                          <TableCell className="text-sm">{format(new Date(l.data_vencimento), "dd/MM/yy")}</TableCell>
                          <TableCell className="text-sm text-right font-medium">{fmtCurrency(l.valor)}</TableCell>
                          <TableCell><Badge variant={sc.variant}>{sc.label}</Badge></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
