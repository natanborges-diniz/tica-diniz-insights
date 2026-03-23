import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  CreditCard, Download, RefreshCw, AlertTriangle, CheckCircle2,
  ChevronDown, ChevronRight, Eye, XCircle,
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

interface RecebiveisCartaoParcela {
  id: string;
  lancamento_id: string;
  valor_parcela: number | null;
  numero_parcela: number | null;
}

interface Recebivel {
  id: string;
  cod_empresa: number;
  adquirente: string | null;
  bandeira: string | null;
  data_vencimento: string;
  valor_bruto: number;
  valor_liquido: number;
  taxa_percentual: number | null;
  taxa_valor: number | null;
  status: string;
  btg_receivable_id: string | null;
  created_at: string;
  recebiveis_cartao_parcelas: RecebiveisCartaoParcela[];
}

const STATUS_CFG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  PREVISTO: { label: "Previsto", variant: "secondary" },
  CONCILIADO: { label: "Conciliado", variant: "default" },
  RECEBIDO: { label: "Recebido", variant: "default" },
  DIVERGENTE: { label: "Divergente", variant: "destructive" },
};

export default function ConciliacaoCartoesPage() {
  const { empresas } = useEmpresas();
  const { codEmpresa: codEmpresaDefault } = useDefaultEmpresa();
  const queryClient = useQueryClient();

  const [codEmpresa, setCodEmpresa] = useState<number>(codEmpresaDefault || 1);
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroAdquirente, setFiltroAdquirente] = useState("todos");
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [dataFim, setDataFim] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1, 0);
    return d.toISOString().slice(0, 10);
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const invokeAction = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("Sessão expirada");

    const { data, error } = await supabase.functions.invoke("btg-recebiveis-cartao", {
      body: { action, ...extra },
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error) throw error;
    return data;
  };

  const { data: recebiveis = [], isLoading } = useQuery<Recebivel[]>({
    queryKey: ["recebiveis-cartao", codEmpresa, filtroStatus, filtroAdquirente, dataInicio, dataFim],
    queryFn: async () => {
      const params: Record<string, unknown> = {
        cod_empresa: codEmpresa,
        data_inicio: dataInicio,
        data_fim: dataFim,
        limit: 500,
      };
      if (filtroStatus !== "todos") params.status = filtroStatus;
      if (filtroAdquirente !== "todos") params.adquirente = filtroAdquirente;
      return invokeAction("listar", params);
    },
  });

  const { data: detalheData } = useQuery({
    queryKey: ["recebivel-detalhe", expandedId],
    queryFn: () => invokeAction("detalhe", { recebivel_id: expandedId }),
    enabled: !!expandedId,
  });

  const invalidateAll = () => queryClient.invalidateQueries({ queryKey: ["recebiveis-cartao"] });

  const importarMutation = useMutation({
    mutationFn: () => invokeAction("importar_agenda", { cod_empresa: codEmpresa, data_inicio: dataInicio, data_fim: dataFim }),
    onSuccess: (data: { total?: number; inserted?: number; skipped_duplicates?: number; total_no_periodo?: number; sandbox_no_periodo?: number; sandbox?: boolean }) => {
      const totalApi = data?.total || 0;
      const inserted = data?.inserted || 0;
      const skipped = data?.skipped_duplicates || 0;
      const totalNoPeriodo = data?.total_no_periodo || 0;
      const sandboxNoPeriodo = data?.sandbox_no_periodo || 0;

      if (!data?.sandbox && totalApi === 0) {
        toast.warning(
          `BTG retornou 0 no período. Já existem ${totalNoPeriodo} recebíveis no painel${sandboxNoPeriodo > 0 ? ` (${sandboxNoPeriodo} de sandbox)` : ""}.`
        );
      } else {
        toast.success(
          `Importação concluída — BTG: ${totalApi} | novos: ${inserted} | já existentes: ${skipped}${data?.sandbox ? " (sandbox)" : ""}`
        );
      }
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao importar agenda"),
  });

  const conciliarMutation = useMutation({
    mutationFn: () => invokeAction("conciliar_auto", { cod_empresa: codEmpresa }),
    onSuccess: (data: { conciliados?: number; taxas_geradas?: number }) => {
      toast.success(`Conciliados: ${data?.conciliados || 0} | Taxas geradas: ${data?.taxas_geradas || 0}`);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "Erro na conciliação"),
  });

  const divergenteMutation = useMutation({
    mutationFn: (recebivelId: string) => invokeAction("marcar_divergente", { recebivel_id: recebivelId }),
    onSuccess: () => { toast.success("Marcado como divergente"); invalidateAll(); },
    onError: () => toast.error("Erro ao marcar divergência"),
  });

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  // KPIs
  const totalBruto = recebiveis.reduce((s, r) => s + Number(r.valor_bruto), 0);
  const totalLiquido = recebiveis.reduce((s, r) => s + Number(r.valor_liquido), 0);
  const totalTaxas = recebiveis.reduce((s, r) => s + Number(r.taxa_valor || 0), 0);
  const qtdPrevistos = recebiveis.filter(r => r.status === "PREVISTO").length;
  const qtdConciliados = recebiveis.filter(r => r.status === "CONCILIADO").length;
  const qtdDivergentes = recebiveis.filter(r => r.status === "DIVERGENTE").length;

  const adquirentes = [...new Set(recebiveis.map(r => r.adquirente).filter(Boolean))] as string[];

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Conciliação de Cartões"
        subtitle="Agenda de recebíveis — confronto ERP vs adquirentes"
        icon={<CreditCard className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => importarMutation.mutate()} disabled={importarMutation.isPending}>
              <Download className="h-4 w-4 mr-1" /> Importar Agenda
            </Button>
            <Button size="sm" onClick={() => conciliarMutation.mutate()} disabled={conciliarMutation.isPending}>
              <RefreshCw className="h-4 w-4 mr-1" /> Conciliar Auto
            </Button>
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground">Valor Bruto</p>
          <p className="text-lg font-bold text-foreground">{fmtCurrency(totalBruto)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground">Valor Líquido</p>
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
          <p className="text-xs text-muted-foreground">Divergentes</p>
          <p className="text-lg font-bold text-destructive">{qtdDivergentes}</p>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        {empresas.length > 1 && (
          <div className="w-40">
            <Select value={String(codEmpresa)} onValueChange={v => setCodEmpresa(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {empresas.map(e => (
                  <SelectItem key={e.codEmpresa} value={String(e.codEmpresa)}>
                    {e.nome || `Empresa ${e.codEmpresa}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <Input type="date" className="w-36" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
        <Input type="date" className="w-36" value={dataFim} onChange={e => setDataFim(e.target.value)} />
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos Status</SelectItem>
            <SelectItem value="PREVISTO">Previsto</SelectItem>
            <SelectItem value="CONCILIADO">Conciliado</SelectItem>
            <SelectItem value="RECEBIDO">Recebido</SelectItem>
            <SelectItem value="DIVERGENTE">Divergente</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtroAdquirente} onValueChange={setFiltroAdquirente}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas Adquirentes</SelectItem>
            {adquirentes.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Adquirente</TableHead>
                <TableHead>Bandeira</TableHead>
                <TableHead className="text-right">Bruto</TableHead>
                <TableHead className="text-right">Líquido</TableHead>
                <TableHead className="text-right">Taxa</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Parcelas</TableHead>
                <TableHead className="w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : recebiveis.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Nenhum recebível encontrado. Importe a agenda para começar.</TableCell></TableRow>
              ) : (
                recebiveis.map(r => {
                  const isExpanded = expandedId === r.id;
                  const stCfg = STATUS_CFG[r.status] || { label: r.status, variant: "outline" as const };
                  return (
                    <>
                      <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setExpandedId(isExpanded ? null : r.id)}>
                        <TableCell>
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{r.data_vencimento}</TableCell>
                        <TableCell>{r.adquirente}</TableCell>
                        <TableCell>{r.bandeira}</TableCell>
                        <TableCell className="text-right font-mono">{fmtCurrency(r.valor_bruto)}</TableCell>
                        <TableCell className="text-right font-mono text-primary">{fmtCurrency(r.valor_liquido)}</TableCell>
                        <TableCell className="text-right font-mono text-destructive">
                          {r.taxa_valor ? fmtCurrency(r.taxa_valor) : "—"}
                          {r.taxa_percentual ? <span className="text-xs text-muted-foreground ml-1">({r.taxa_percentual}%)</span> : null}
                        </TableCell>
                        <TableCell><Badge variant={stCfg.variant}>{stCfg.label}</Badge></TableCell>
                        <TableCell className="text-right">{r.recebiveis_cartao_parcelas?.length || 0}</TableCell>
                        <TableCell>
                          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                            {r.status === "PREVISTO" && (
                              <Button size="icon" variant="ghost" title="Marcar divergente" onClick={() => divergenteMutation.mutate(r.id)}>
                                <AlertTriangle className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && detalheData && (
                        <TableRow key={`${r.id}-detail`}>
                          <TableCell colSpan={10} className="bg-muted/30 p-4">
                            <div className="space-y-2">
                              <p className="text-sm font-medium">Parcelas ERP vinculadas</p>
                              {detalheData.lancamentos && detalheData.lancamentos.length > 0 ? (
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Descrição</TableHead>
                                      <TableHead>Pessoa</TableHead>
                                      <TableHead className="text-right">Valor</TableHead>
                                      <TableHead>Vencimento</TableHead>
                                      <TableHead>Status</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {detalheData.lancamentos.map((l: { id: string; descricao: string; pessoa_nome?: string; valor: number; data_vencimento: string; status: string }) => (
                                      <TableRow key={l.id}>
                                        <TableCell className="text-sm">{l.descricao}</TableCell>
                                        <TableCell className="text-sm">{l.pessoa_nome || "—"}</TableCell>
                                        <TableCell className="text-right font-mono text-sm">{fmtCurrency(l.valor)}</TableCell>
                                        <TableCell className="font-mono text-sm">{l.data_vencimento}</TableCell>
                                        <TableCell><Badge variant="outline" className="text-xs">{l.status}</Badge></TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              ) : (
                                <p className="text-sm text-muted-foreground">Nenhuma parcela vinculada. Execute a conciliação automática ou vincule manualmente.</p>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
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
