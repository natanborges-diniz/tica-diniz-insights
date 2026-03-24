import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, addDays, parseISO } from "date-fns";
import {
  Wallet, TrendingUp, Calendar, CreditCard,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresas } from "@/hooks/useEmpresas";
import { useDefaultEmpresa } from "@/hooks/useDefaultEmpresa";
import { ModuleHeader } from "@/components/system/ModuleHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from "recharts";

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--destructive))",
  "hsl(210, 70%, 50%)",
  "hsl(150, 60%, 45%)",
  "hsl(45, 80%, 50%)",
  "hsl(280, 60%, 55%)",
];

export default function CarteiraRecebiveisPage() {
  const { empresas } = useEmpresas();
  const { codEmpresa: codEmpresaDefault } = useDefaultEmpresa();

  const [codEmpresa, setCodEmpresa] = useState<number>(codEmpresaDefault || 1);
  const [dataInicio, setDataInicio] = useState(() => new Date().toISOString().slice(0, 10));
  const [dataFim, setDataFim] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 90);
    return d.toISOString().slice(0, 10);
  });
  const [filtroBandeira, setFiltroBandeira] = useState("todas");
  const [filtroStatus, setFiltroStatus] = useState("todos");

  const { data: recebiveis = [], isLoading } = useQuery({
    queryKey: ["carteira-recebiveis", codEmpresa, dataInicio, dataFim],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recebiveis_cartao")
        .select("*")
        .eq("cod_empresa", codEmpresa)
        .gte("data_vencimento", dataInicio)
        .lte("data_vencimento", dataFim)
        .order("data_vencimento", { ascending: true })
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
  });

  // Also get vendas_cartao for enrichment
  const { data: vendasCartao = [] } = useQuery({
    queryKey: ["carteira-vendas-cartao", codEmpresa, dataInicio, dataFim],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendas_cartao")
        .select("id, bandeira, tipo, valor_bruto, valor_liquido, taxa_valor, data_prevista_credito, status")
        .eq("cod_empresa", codEmpresa)
        .eq("status", "APROVADA")
        .gte("data_prevista_credito", dataInicio)
        .lte("data_prevista_credito", dataFim)
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
  });

  const bandeiras = useMemo(() => {
    const set = new Set<string>();
    recebiveis.forEach((r: any) => { if (r.bandeira) set.add(r.bandeira); });
    vendasCartao.forEach((v: any) => { if (v.bandeira) set.add(v.bandeira); });
    return [...set].sort();
  }, [recebiveis, vendasCartao]);

  // Filter
  const filtered = useMemo(() => {
    return recebiveis.filter((r: any) => {
      if (filtroBandeira !== "todas" && r.bandeira !== filtroBandeira) return false;
      if (filtroStatus !== "todos" && r.status !== filtroStatus) return false;
      return true;
    });
  }, [recebiveis, filtroBandeira, filtroStatus]);

  // KPIs
  const totalBruto = filtered.reduce((s: number, r: any) => s + Number(r.valor_bruto || 0), 0);
  const totalLiquido = filtered.reduce((s: number, r: any) => s + Number(r.valor_liquido || 0), 0);
  const totalTaxas = filtered.reduce((s: number, r: any) => s + Number(r.taxa_valor || 0), 0);
  const qtdPrevistos = filtered.filter((r: any) => r.status === "PREVISTO").length;
  const qtdConciliados = filtered.filter((r: any) => r.status === "CONCILIADO").length;
  const qtdRecebidos = filtered.filter((r: any) => r.status === "RECEBIDO").length;

  // Chart: by week
  const chartByWeek = useMemo(() => {
    const weeks: Record<string, { semana: string; bruto: number; liquido: number; taxas: number }> = {};
    filtered.forEach((r: any) => {
      try {
        const d = parseISO(r.data_vencimento);
        const weekStart = format(addDays(d, -d.getDay()), "dd/MM");
        if (!weeks[weekStart]) weeks[weekStart] = { semana: weekStart, bruto: 0, liquido: 0, taxas: 0 };
        weeks[weekStart].bruto += Number(r.valor_bruto || 0);
        weeks[weekStart].liquido += Number(r.valor_liquido || 0);
        weeks[weekStart].taxas += Number(r.taxa_valor || 0);
      } catch { /* skip */ }
    });
    return Object.values(weeks).slice(0, 13);
  }, [filtered]);

  // Chart: by bandeira (pie)
  const chartByBandeira = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach((r: any) => {
      const b = r.bandeira || "Outros";
      map[b] = (map[b] || 0) + Number(r.valor_liquido || 0);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Carteira de Recebíveis"
        subtitle="Visão consolidada — valores a receber por bandeira, data e status"
        icon={<Wallet className="h-5 w-5" />}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground">Total Bruto</p>
          <p className="text-lg font-bold">{fmtCurrency(totalBruto)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground">Total Líquido</p>
          <p className="text-lg font-bold text-primary">{fmtCurrency(totalLiquido)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground">Total Taxas</p>
          <p className="text-lg font-bold text-destructive">{fmtCurrency(totalTaxas)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground">Previstos</p>
          <p className="text-lg font-bold">{qtdPrevistos}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground">Conciliados</p>
          <p className="text-lg font-bold text-primary">{qtdConciliados}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground">Recebidos</p>
          <p className="text-lg font-bold text-primary">{qtdRecebidos}</p>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        {empresas.length > 1 && (
          <Select value={String(codEmpresa)} onValueChange={v => setCodEmpresa(Number(v))}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {empresas.map(e => (
                <SelectItem key={e.codEmpresa} value={String(e.codEmpresa)}>
                  {e.nome || `Empresa ${e.codEmpresa}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Input type="date" className="w-36" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
        <Input type="date" className="w-36" value={dataFim} onChange={e => setDataFim(e.target.value)} />
        <Select value={filtroBandeira} onValueChange={setFiltroBandeira}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas Bandeiras</SelectItem>
            {bandeiras.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos Status</SelectItem>
            <SelectItem value="PREVISTO">Previsto</SelectItem>
            <SelectItem value="CONCILIADO">Conciliado</SelectItem>
            <SelectItem value="RECEBIDO">Recebido</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Recebíveis por Semana
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartByWeek}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="semana" className="text-xs" />
                <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} className="text-xs" />
                <Tooltip formatter={(v: number) => fmtCurrency(v)} />
                <Legend />
                <Bar dataKey="liquido" name="Líquido" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="taxas" name="Taxas" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CreditCard className="h-4 w-4" /> Por Bandeira
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={chartByBandeira} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {chartByBandeira.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => fmtCurrency(v)} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vencimento</TableHead>
                <TableHead>Adquirente</TableHead>
                <TableHead>Bandeira</TableHead>
                <TableHead className="text-right">Bruto</TableHead>
                <TableHead className="text-right">Líquido</TableHead>
                <TableHead className="text-right">Taxa</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Nenhum recebível encontrado no período.
                </TableCell></TableRow>
              ) : (
                filtered.map((r: any) => {
                  const stVariant = r.status === "CONCILIADO" ? "default" : r.status === "RECEBIDO" ? "default" : "secondary";
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-sm">{r.data_vencimento}</TableCell>
                      <TableCell>{r.adquirente || "—"}</TableCell>
                      <TableCell>{r.bandeira || "—"}</TableCell>
                      <TableCell className="text-right font-mono">{fmtCurrency(Number(r.valor_bruto))}</TableCell>
                      <TableCell className="text-right font-mono text-primary">{fmtCurrency(Number(r.valor_liquido))}</TableCell>
                      <TableCell className="text-right font-mono text-destructive">
                        {r.taxa_valor ? fmtCurrency(Number(r.taxa_valor)) : "—"}
                        {r.taxa_percentual ? <span className="text-xs text-muted-foreground ml-1">({r.taxa_percentual}%)</span> : null}
                      </TableCell>
                      <TableCell><Badge variant={stVariant}>{r.status}</Badge></TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
