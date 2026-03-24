import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CreditCard, Download, RefreshCw, AlertTriangle, CheckCircle2,
  ChevronDown, ChevronRight, Search,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresas } from "@/hooks/useEmpresas";
import { useDefaultEmpresa } from "@/hooks/useDefaultEmpresa";
import { ModuleHeader } from "@/components/system/ModuleHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

const STATUS_CFG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  CONCILIADO: { label: "Conciliado", variant: "default" },
  DIVERGENTE: { label: "Divergente", variant: "destructive" },
  PENDENTE_ERP: { label: "Pendente ERP", variant: "outline" },
  PENDENTE_ADQ: { label: "Pendente Adq.", variant: "secondary" },
};

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export default function ConciliacaoCartoesPage() {
  const { empresas } = useEmpresas();
  const { codEmpresa: codEmpresaDefault } = useDefaultEmpresa();
  const queryClient = useQueryClient();

  const [codEmpresa, setCodEmpresa] = useState<number>(codEmpresaDefault || 1);
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [dataFim, setDataFim] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1, 0);
    return d.toISOString().slice(0, 10);
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const invokeFunc = async (fnName: string, body: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("Sessão expirada");
    const { data, error } = await supabase.functions.invoke(fnName, {
      body,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error) throw error;
    return data;
  };

  // Vendas Cartão (source of truth for card transactions)
  const { data: vendasCartao = [], isLoading: loadingVendas } = useQuery({
    queryKey: ["vendas-cartao", codEmpresa, dataInicio, dataFim],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendas_cartao")
        .select("*")
        .eq("cod_empresa", codEmpresa)
        .gte("data_venda", dataInicio)
        .lte("data_venda", dataFim)
        .order("data_venda", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
  });

  // Conciliação records
  const { data: conciliacoes = [], isLoading: loadingConc } = useQuery({
    queryKey: ["conciliacao-vendas", codEmpresa, filtroStatus],
    queryFn: async () => {
      let query = supabase
        .from("conciliacao_vendas")
        .select("*")
        .eq("cod_empresa", codEmpresa)
        .order("created_at", { ascending: false })
        .limit(500);
      if (filtroStatus !== "todos") query = query.eq("status", filtroStatus);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const concMap = new Map(conciliacoes.map((c: any) => [c.venda_cartao_id, c]));

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["vendas-cartao"] });
    queryClient.invalidateQueries({ queryKey: ["conciliacao-vendas"] });
  };

  // Sync from Rede
  const syncMutation = useMutation({
    mutationFn: () => invokeFunc("sync-vendas-cartao", {
      cod_empresa: codEmpresa,
      data_inicio: dataInicio,
      data_fim: dataFim,
    }),
    onSuccess: (data: any) => {
      toast.success(`Sincronizado: ${data?.inserted || 0} novas transações | ${data?.skipped || 0} já existentes`);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao sincronizar"),
  });

  // Auto-conciliate
  const conciliarMutation = useMutation({
    mutationFn: () => invokeFunc("conciliar-vendas", {
      action: "conciliar_auto",
      cod_empresa: codEmpresa,
      data_inicio: dataInicio,
      data_fim: dataFim,
    }),
    onSuccess: (data: any) => {
      toast.success(`Conciliados: ${data?.conciliados || 0} | Divergentes: ${data?.divergentes || 0}`);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "Erro na conciliação"),
  });

  // KPIs
  const totalBruto = vendasCartao.reduce((s: number, r: any) => s + Number(r.valor_bruto || 0), 0);
  const totalLiquido = vendasCartao.reduce((s: number, r: any) => s + Number(r.valor_liquido || 0), 0);
  const totalTaxas = vendasCartao.reduce((s: number, r: any) => s + Number(r.taxa_valor || 0), 0);
  const qtdConciliados = conciliacoes.filter((c: any) => c.status === "CONCILIADO").length;
  const qtdDivergentes = conciliacoes.filter((c: any) => ["DIVERGENTE", "PENDENTE_ERP"].includes(c.status)).length;
  const qtdPendentes = vendasCartao.length - conciliacoes.length;

  const isLoading = loadingVendas || loadingConc;

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Conciliação de Cartões"
        subtitle="Vendas Rede × ERP — conciliação automática e manual"
        icon={<CreditCard className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
              <Download className="h-4 w-4 mr-1" /> Importar Rede
            </Button>
            <Button size="sm" onClick={() => conciliarMutation.mutate()} disabled={conciliarMutation.isPending}>
              <RefreshCw className="h-4 w-4 mr-1" /> Conciliar Auto
            </Button>
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground">Transações</p>
          <p className="text-lg font-bold">{vendasCartao.length}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground">Valor Bruto</p>
          <p className="text-lg font-bold">{fmtCurrency(totalBruto)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground">Valor Líquido</p>
          <p className="text-lg font-bold text-primary">{fmtCurrency(totalLiquido)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground">Taxas</p>
          <p className="text-lg font-bold text-destructive">{fmtCurrency(totalTaxas)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><CheckCircle2 className="h-3 w-3" /> Conciliados</p>
          <p className="text-lg font-bold text-primary">{qtdConciliados}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><AlertTriangle className="h-3 w-3" /> Pendentes</p>
          <p className="text-lg font-bold text-amber-500">{qtdPendentes > 0 ? qtdPendentes : qtdDivergentes}</p>
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
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos Status</SelectItem>
            <SelectItem value="CONCILIADO">Conciliado</SelectItem>
            <SelectItem value="DIVERGENTE">Divergente</SelectItem>
            <SelectItem value="PENDENTE_ERP">Pendente ERP</SelectItem>
            <SelectItem value="PENDENTE_ADQ">Pendente Adq.</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Transactions Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Bandeira</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>NSU</TableHead>
                <TableHead className="text-right">Bruto</TableHead>
                <TableHead className="text-right">Líquido</TableHead>
                <TableHead className="text-right">Taxa</TableHead>
                <TableHead>Parcelas</TableHead>
                <TableHead>Conciliação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : vendasCartao.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                  Nenhuma transação encontrada. Clique em "Importar Rede" para sincronizar.
                </TableCell></TableRow>
              ) : (
                vendasCartao.map((vc: any) => {
                  const conc = concMap.get(vc.id);
                  const concStatus = conc ? STATUS_CFG[conc.status] || { label: conc.status, variant: "outline" as const } : null;
                  const isExpanded = expandedId === vc.id;

                  return (
                    <TableRow
                      key={vc.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setExpandedId(isExpanded ? null : vc.id)}
                    >
                      <TableCell>
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{vc.data_venda}</TableCell>
                      <TableCell>{vc.bandeira || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{vc.tipo}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{vc.nsu || "—"}</TableCell>
                      <TableCell className="text-right font-mono">{fmtCurrency(Number(vc.valor_bruto))}</TableCell>
                      <TableCell className="text-right font-mono text-primary">{fmtCurrency(Number(vc.valor_liquido))}</TableCell>
                      <TableCell className="text-right font-mono text-destructive">
                        {vc.taxa_valor ? fmtCurrency(Number(vc.taxa_valor)) : "—"}
                      </TableCell>
                      <TableCell className="text-center">{vc.parcelas || 1}x</TableCell>
                      <TableCell>
                        {concStatus ? (
                          <Badge variant={concStatus.variant}>{concStatus.label}</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Não conciliado</Badge>
                        )}
                      </TableCell>
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
