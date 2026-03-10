import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import {
  ArrowDownCircle, ArrowUpCircle, Download, Landmark, TrendingUp, TrendingDown,
  BarChart3, PieChart, CheckCircle2, XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresas } from "@/hooks/useEmpresas";
import { useDefaultEmpresa } from "@/hooks/useDefaultEmpresa";
import { ModuleHeader } from "@/components/system/ModuleHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────
interface ExtratoItem {
  id: string;
  cod_empresa: number;
  data_lancamento: string;
  descricao: string;
  valor: number;
  tipo: string;
  natureza: string | null;
  conciliado: boolean;
  saldo_apos: number | null;
  created_at: string;
}

interface ResumoExtrato {
  total_lancamentos: number;
  total_credito: number;
  total_debito: number;
  saldo_periodo: number;
  total_conciliado: number;
  total_nao_conciliado: number;
  percentual_conciliado: number;
  por_natureza: Record<string, { count: number; total: number }>;
}

interface SaldoResponse {
  available?: { amount: number; currency: string };
  blocked?: { amount: number; currency: string };
  sandbox?: boolean;
}

const NATUREZAS = [
  "Vendas", "Fornecedores", "Salários", "Impostos",
  "Aluguel", "Energia/Água", "Telecom", "Financeiro", "Outros",
];

export default function BankingExtratoDashboard() {
  const { empresas } = useEmpresas();
  const { codEmpresa: codEmpresaDefault } = useDefaultEmpresa();
  const queryClient = useQueryClient();

  const [codEmpresa, setCodEmpresa] = useState<number>(codEmpresaDefault || 1);
  const [dataInicio, setDataInicio] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [dataFim, setDataFim] = useState(format(new Date(), "yyyy-MM-dd"));
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [filtroConciliado, setFiltroConciliado] = useState<string>("todos");

  const [autoImported, setAutoImported] = useState(false);
  useEffect(() => setAutoImported(false), [codEmpresa]);

  // ─── Queries ─────────────────────────────────────────────
  const { data: lancamentos = [], isLoading } = useQuery<ExtratoItem[]>({
    queryKey: ["btg-extrato", codEmpresa, dataInicio, dataFim, filtroTipo, filtroConciliado],
    queryFn: async () => {
      // 1. Try local DB first
      const { data, error } = await supabase.functions.invoke("btg-extrato", {
        body: { action: "listar", cod_empresa: codEmpresa, data_inicio: dataInicio, data_fim: dataFim },
      });
      if (error) throw error;
      let items = Array.isArray(data) ? data : [];

      // 2. If empty, try auto-import
      if (items.length === 0 && !autoImported) {
        setAutoImported(true);
        try {
          const { data: importResult } = await supabase.functions.invoke("btg-extrato", {
            body: { action: "importar", cod_empresa: codEmpresa, data_inicio: dataInicio, data_fim: dataFim },
          });
          if (importResult?.importados > 0) {
            const { data: refetched } = await supabase.functions.invoke("btg-extrato", {
              body: { action: "listar", cod_empresa: codEmpresa, data_inicio: dataInicio, data_fim: dataFim },
            });
            items = Array.isArray(refetched) ? refetched : [];
            toast.success(`${importResult.importados} lançamentos importados do BTG`);
          }
        } catch (e) {
          console.warn("Auto-import failed:", e);
        }
      }

      // 3. Fallback: live query from BTG API
      if (items.length === 0) {
        try {
          const { data: directData } = await supabase.functions.invoke("btg-extrato", {
            body: { action: "extrato", cod_empresa: codEmpresa, data_inicio: dataInicio, data_fim: dataFim },
          });
          const directItems = directData?.lancamentos;
          if (Array.isArray(directItems) && directItems.length > 0) {
            items = directItems.map((l: Record<string, unknown>, idx: number) => {
              const rawType = String(l.type || l.tipo || "");
              const isCredit = rawType.toLowerCase() === "credit" || rawType.toUpperCase().includes("CRED");
              return {
                id: `live-${idx}`,
                cod_empresa: codEmpresa,
                data_lancamento: String(l._dayDate || l.dateHour || l.date || l.bookingDate || "").substring(0, 10),
                descricao: String(l.description || l.remittanceInformation || ""),
                valor: Math.abs(Number(l.amount || l.transactionAmount || 0)),
                tipo: isCredit ? "CREDITO" : "DEBITO",
                natureza: null,
                conciliado: false,
                saldo_apos: l.balance_after ? Number(l.balance_after) : null,
                created_at: new Date().toISOString(),
              };
            });
          }
        } catch (e) {
          console.warn("Direct extrato query failed:", e);
        }
      }

      if (filtroTipo !== "todos") items = items.filter((i: ExtratoItem) => i.tipo === filtroTipo);
      if (filtroConciliado !== "todos") items = items.filter((i: ExtratoItem) => String(i.conciliado) === filtroConciliado);
      return items;
    },
  });

  const { data: resumo } = useQuery<ResumoExtrato>({
    queryKey: ["btg-extrato-resumo", codEmpresa, dataInicio, dataFim],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("btg-extrato", {
        body: { action: "resumo", cod_empresa: codEmpresa, data_inicio: dataInicio, data_fim: dataFim },
      });
      if (error) throw error;
      return data as ResumoExtrato;
    },
  });

  const { data: saldo } = useQuery<SaldoResponse>({
    queryKey: ["btg-saldo", codEmpresa],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("btg-extrato", {
        body: { action: "saldo", cod_empresa: codEmpresa },
      });
      if (error) throw error;
      return data as SaldoResponse;
    },
  });

  // ─── Mutations ───────────────────────────────────────────
  const importarMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("btg-extrato", {
        body: { action: "importar", cod_empresa: codEmpresa, data_inicio: dataInicio, data_fim: dataFim },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`${data.importados} lançamentos importados`);
      queryClient.invalidateQueries({ queryKey: ["btg-extrato"] });
      queryClient.invalidateQueries({ queryKey: ["btg-extrato-resumo"] });
    },
    onError: () => toast.error("Erro ao importar extrato"),
  });

  const classificarMutation = useMutation({
    mutationFn: async ({ id, natureza }: { id: string; natureza: string }) => {
      const { error } = await supabase.functions.invoke("btg-extrato", {
        body: { action: "classificar", id, natureza },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["btg-extrato"] });
      queryClient.invalidateQueries({ queryKey: ["btg-extrato-resumo"] });
    },
  });

  const conciliarMutation = useMutation({
    mutationFn: async ({ id, conciliado }: { id: string; conciliado: boolean }) => {
      const { error } = await supabase.functions.invoke("btg-extrato", {
        body: { action: "conciliar", id, conciliado },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conciliação atualizada");
      queryClient.invalidateQueries({ queryKey: ["btg-extrato"] });
      queryClient.invalidateQueries({ queryKey: ["btg-extrato-resumo"] });
    },
  });

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const saldoDisponivel = saldo?.available?.amount;
  const saldoBloqueado = saldo?.blocked?.amount;

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Extrato Bancário"
        subtitle="Consulta de saldo, extrato, classificação por natureza e batimento de caixa"
        icon={<Landmark className="h-5 w-5" />}
      />

      {/* ── Filters ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Empresa</label>
          <Select value={String(codEmpresa)} onValueChange={(v) => setCodEmpresa(Number(v))}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(empresas || []).map((e) => (
                <SelectItem key={e.codEmpresa} value={String(e.codEmpresa)}>
                  {e.nome || `Empresa ${e.codEmpresa}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">De</label>
          <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="w-[150px]" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Até</label>
          <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="w-[150px]" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Tipo</label>
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="CREDITO">Crédito</SelectItem>
              <SelectItem value="DEBITO">Débito</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Conciliado</label>
          <Select value={filtroConciliado} onValueChange={setFiltroConciliado}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="true">Sim</SelectItem>
              <SelectItem value="false">Não</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => importarMutation.mutate()}
          disabled={importarMutation.isPending}
        >
          <Download className="h-4 w-4 mr-1" />
          Importar BTG
        </Button>
      </div>

      {/* ── KPI Cards ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Landmark className="h-4 w-4" /> Saldo Disponível
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {saldoDisponivel != null ? fmtCurrency(saldoDisponivel) : "—"}
            </p>
            {saldoBloqueado != null && saldoBloqueado > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Bloqueado: {fmtCurrency(saldoBloqueado)}
              </p>
            )}
            {saldo?.sandbox && (
              <p className="text-xs text-muted-foreground mt-1 italic">Sandbox</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-success" /> Total Créditos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-success">
              {resumo ? fmtCurrency(resumo.total_credito) : "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-destructive" /> Total Débitos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">
              {resumo ? fmtCurrency(resumo.total_debito) : "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Saldo Período
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${(resumo?.saldo_periodo ?? 0) >= 0 ? "text-success" : "text-destructive"}`}>
              {resumo ? fmtCurrency(resumo.saldo_periodo) : "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <PieChart className="h-4 w-4" /> Conciliação
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {resumo ? `${resumo.percentual_conciliado}%` : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {resumo ? `${resumo.total_conciliado}/${resumo.total_lancamentos}` : ""}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Extrato Table ───────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lançamentos do Extrato</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-[100px] text-right">Valor</TableHead>
                  <TableHead className="w-[100px] text-right">Saldo</TableHead>
                  <TableHead className="w-[150px]">Natureza</TableHead>
                  <TableHead className="w-[100px] text-center">Conciliado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : lancamentos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Nenhum lançamento encontrado. Importe o extrato do BTG.
                    </TableCell>
                  </TableRow>
                ) : (
                  lancamentos.map((item) => (
                    <TableRow key={item.id} className={item.conciliado ? "opacity-60" : ""}>
                      <TableCell className="text-sm">
                        {format(new Date(item.data_lancamento + "T12:00:00"), "dd/MM/yy")}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-2">
                          {item.tipo === "CREDITO" ? (
                            <ArrowDownCircle className="h-4 w-4 text-success shrink-0" />
                          ) : (
                            <ArrowUpCircle className="h-4 w-4 text-destructive shrink-0" />
                          )}
                          {item.descricao}
                        </div>
                      </TableCell>
                      <TableCell className={`text-sm text-right font-medium ${item.tipo === "CREDITO" ? "text-success" : "text-destructive"}`}>
                        {item.tipo === "DEBITO" ? "-" : "+"}{fmtCurrency(item.valor)}
                      </TableCell>
                      <TableCell className="text-sm text-right">
                        {item.saldo_apos != null ? fmtCurrency(item.saldo_apos) : "—"}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={item.natureza || ""}
                          onValueChange={(v) => classificarMutation.mutate({ id: item.id, natureza: v })}
                        >
                          <SelectTrigger className="h-7 text-xs w-[130px]">
                            <SelectValue placeholder="Classificar" />
                          </SelectTrigger>
                          <SelectContent>
                            {NATUREZAS.map((n) => (
                              <SelectItem key={n} value={n}>{n}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => conciliarMutation.mutate({ id: item.id, conciliado: !item.conciliado })}
                        >
                          {item.conciliado ? (
                            <CheckCircle2 className="h-4 w-4 text-success" />
                          ) : (
                            <XCircle className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Breakdown by Natureza ───────────────────────────── */}
      {resumo?.por_natureza && Object.keys(resumo.por_natureza).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Breakdown por Natureza</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(resumo.por_natureza).map(([nat, info]) => (
                <div key={nat} className="p-3 rounded-lg border bg-muted/30">
                  <p className="text-xs font-medium text-muted-foreground">{nat}</p>
                  <p className={`text-lg font-bold ${info.total >= 0 ? "text-success" : "text-destructive"}`}>
                    {fmtCurrency(Math.abs(info.total))}
                  </p>
                  <p className="text-xs text-muted-foreground">{info.count} lançamentos</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
