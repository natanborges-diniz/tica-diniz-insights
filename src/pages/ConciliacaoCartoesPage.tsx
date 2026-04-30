import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CreditCard, Download, RefreshCw, AlertTriangle, CheckCircle2,
  ChevronDown, ChevronRight, Store, Layers, List, ArrowLeft, Wifi, WifiOff,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ModuleHeader } from "@/components/system/ModuleHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

const STATUS_CFG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  CONCILIADO: { label: "Conciliado", variant: "default" },
  DIVERGENTE: { label: "Divergente", variant: "destructive" },
  PENDENTE_ERP: { label: "Pendente ERP", variant: "outline" },
  PENDENTE_ADQ: { label: "Pendente Adq.", variant: "secondary" },
};

const fmtBRL = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const fmtPct = (v: number) => `${(v * 100).toFixed(0)}%`;

type LojaResumo = {
  cod_empresa: number;
  nome_fantasia: string | null;
  ambiente: string | null;
  gv_optin_status: string | null;
  gv_last_healthcheck_status: string | null;
  qtd_pvs: number;
  qtd_vendas: number;
  total_bruto: number;
  total_liquido: number;
  total_taxas: number;
  ultima_venda: string | null;
  ultima_sync: string | null;
  qtd_conciliado: number;
  qtd_divergente: number;
  qtd_pendente: number;
};

export default function ConciliacaoCartoesPage() {
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<"lojas" | "pvs" | "transacoes">("lojas");
  const [lojaSelecionada, setLojaSelecionada] = useState<number | null>(null);
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dataFim, setDataFim] = useState(() => new Date().toISOString().slice(0, 10));
  const [expandedTx, setExpandedTx] = useState<string | null>(null);

  const invokeFunc = async (fnName: string, body: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("Sessão expirada");
    const { data, error } = await supabase.functions.invoke(fnName, {
      body, headers: { Authorization: `Bearer ${token}` },
    });
    if (error) throw error;
    return data;
  };

  // KPIs por loja (view)
  const { data: lojas = [], isLoading: loadingLojas, refetch: refetchLojas } = useQuery({
    queryKey: ["conciliacao-loja-resumo"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_conciliacao_loja_resumo")
        .select("*");
      if (error) throw error;
      return ((data || []) as unknown) as LojaResumo[];
    },
  });

  // Transações (todas ou filtradas por loja)
  const { data: vendasCartao = [], isLoading: loadingVendas } = useQuery({
    queryKey: ["vendas-cartao", lojaSelecionada, dataInicio, dataFim],
    queryFn: async () => {
      let q = supabase
        .from("vendas_cartao")
        .select("*")
        .gte("data_venda", dataInicio)
        .lte("data_venda", dataFim)
        .order("data_venda", { ascending: false })
        .limit(1000);
      if (lojaSelecionada) q = q.eq("cod_empresa", lojaSelecionada);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: conciliacoes = [] } = useQuery({
    queryKey: ["conciliacao-vendas", lojaSelecionada],
    queryFn: async () => {
      let q = supabase
        .from("conciliacao_vendas")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (lojaSelecionada) q = q.eq("cod_empresa", lojaSelecionada);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const concMap = useMemo(() => new Map(conciliacoes.map((c: any) => [c.venda_cartao_id, c])), [conciliacoes]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["vendas-cartao"] });
    queryClient.invalidateQueries({ queryKey: ["conciliacao-vendas"] });
    queryClient.invalidateQueries({ queryKey: ["conciliacao-loja-resumo"] });
  };

  const syncMutation = useMutation({
    mutationFn: (codEmpresa?: number) => invokeFunc("sync-vendas-cartao", {
      data_inicio: dataInicio,
      data_fim: dataFim,
      ...(codEmpresa ? { cod_empresa: codEmpresa } : {}),
    }),
    onSuccess: (data: any) => {
      toast.success(`Sync: ${data?.inserted || 0} venda(s) inseridas em ${data?.pvs_com_dados || 0}/${data?.pvs_consultados || 0} PV(s)`);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao sincronizar"),
  });

  const conciliarMutation = useMutation({
    mutationFn: (codEmpresa: number) => invokeFunc("conciliar-vendas", {
      action: "conciliar_auto",
      cod_empresa: codEmpresa,
      data_inicio: dataInicio,
      data_fim: dataFim,
    }),
    onSuccess: (data: any) => {
      toast.success(`✅ ${data?.conciliados || 0} conciliados | ⚠️ ${data?.divergentes || 0} divergentes | ⏳ ${data?.pendentes || 0} pendentes`);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "Erro na conciliação"),
  });

  // Totais globais
  const totaisGlobais = useMemo(() => {
    const t = lojas.reduce((acc, l) => ({
      bruto: acc.bruto + Number(l.total_bruto || 0),
      liquido: acc.liquido + Number(l.total_liquido || 0),
      taxas: acc.taxas + Number(l.total_taxas || 0),
      vendas: acc.vendas + Number(l.qtd_vendas || 0),
      conc: acc.conc + Number(l.qtd_conciliado || 0),
      div: acc.div + Number(l.qtd_divergente || 0),
      pend: acc.pend + Number(l.qtd_pendente || 0),
    }), { bruto: 0, liquido: 0, taxas: 0, vendas: 0, conc: 0, div: 0, pend: 0 });
    return t;
  }, [lojas]);

  const pctConciliado = totaisGlobais.vendas > 0
    ? totaisGlobais.conc / totaisGlobais.vendas
    : 0;

  // Breakdown por PV (Tab 2)
  const pvBreakdown = useMemo(() => {
    if (!lojaSelecionada) return null;
    const loja = lojas.find(l => l.cod_empresa === lojaSelecionada);
    if (!loja) return null;

    // Busca PVs configurados via vendas (dados_extras.merchant.companyNumber agrupado)
    const pvMap = new Map<string, { pv: string; qtd: number; bruto: number; liquido: number; ultima: string | null }>();
    vendasCartao.forEach((vc: any) => {
      const pv = vc.dados_extras?.merchant?.companyNumber
        || vc.dados_extras?._source_matriz_pv
        || "—";
      const key = String(pv);
      const cur = pvMap.get(key) || { pv: key, qtd: 0, bruto: 0, liquido: 0, ultima: null };
      cur.qtd++;
      cur.bruto += Number(vc.valor_bruto || 0);
      cur.liquido += Number(vc.valor_liquido || 0);
      if (!cur.ultima || vc.data_venda > cur.ultima) cur.ultima = vc.data_venda;
      pvMap.set(key, cur);
    });
    return { loja, pvsComMov: [...pvMap.values()].sort((a, b) => b.qtd - a.qtd) };
  }, [lojaSelecionada, lojas, vendasCartao]);

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Conciliação de Cartões"
        subtitle="Vendas REDE × ERP — visão por loja, PV e transação"
        icon={<CreditCard className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => syncMutation.mutate(undefined)} disabled={syncMutation.isPending}>
              <Download className="h-4 w-4 mr-1" />
              {syncMutation.isPending ? "Sincronizando..." : "Sincronizar todas"}
            </Button>
          </div>
        }
      />

      {/* KPIs globais */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground">Lojas Ativas</p>
          <p className="text-lg font-bold">{lojas.length}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground">Vendas</p>
          <p className="text-lg font-bold">{totaisGlobais.vendas}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground">Bruto</p>
          <p className="text-lg font-bold">{fmtBRL(totaisGlobais.bruto)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground">Líquido</p>
          <p className="text-lg font-bold text-primary">{fmtBRL(totaisGlobais.liquido)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground">Taxas</p>
          <p className="text-lg font-bold text-destructive">{fmtBRL(totaisGlobais.taxas)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><CheckCircle2 className="h-3 w-3" /> Conciliado</p>
          <p className="text-lg font-bold text-primary">{fmtPct(pctConciliado)}</p>
        </CardContent></Card>
      </div>

      {/* Filtros de período */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <p className="text-xs text-muted-foreground mb-1">De</p>
          <Input type="date" className="w-36" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Até</p>
          <Input type="date" className="w-36" value={dataFim} onChange={e => setDataFim(e.target.value)} />
        </div>
        {tab === "transacoes" && (
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos Status</SelectItem>
              <SelectItem value="CONCILIADO">Conciliado</SelectItem>
              <SelectItem value="DIVERGENTE">Divergente</SelectItem>
              <SelectItem value="PENDENTE_ERP">Pendente ERP</SelectItem>
              <SelectItem value="nao_conciliado">Não conciliado</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="lojas"><Store className="h-4 w-4 mr-1" /> Lojas</TabsTrigger>
          <TabsTrigger value="pvs" disabled={!lojaSelecionada}>
            <Layers className="h-4 w-4 mr-1" /> PVs {lojaSelecionada && `(${lojas.find(l => l.cod_empresa === lojaSelecionada)?.nome_fantasia})`}
          </TabsTrigger>
          <TabsTrigger value="transacoes"><List className="h-4 w-4 mr-1" /> Transações</TabsTrigger>
        </TabsList>

        {/* TAB 1: LOJAS */}
        <TabsContent value="lojas">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Loja</TableHead>
                    <TableHead className="text-center">Opt-in</TableHead>
                    <TableHead className="text-center">PVs</TableHead>
                    <TableHead className="text-right">Vendas</TableHead>
                    <TableHead className="text-right">Bruto</TableHead>
                    <TableHead className="text-right">Líquido</TableHead>
                    <TableHead className="text-right">Taxas</TableHead>
                    <TableHead>Conciliação</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingLojas ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                  ) : lojas.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nenhuma loja com REDE configurada</TableCell></TableRow>
                  ) : lojas.map((l) => {
                    const total = l.qtd_conciliado + l.qtd_divergente + l.qtd_pendente;
                    const pct = total > 0 ? (l.qtd_conciliado / total) * 100 : 0;
                    const optinOk = l.gv_optin_status === "APROVADO";
                    return (
                      <TableRow key={l.cod_empresa}>
                        <TableCell>
                          <div className="font-medium">{l.nome_fantasia || `Empresa ${l.cod_empresa}`}</div>
                          <div className="text-xs text-muted-foreground">cod {l.cod_empresa}</div>
                        </TableCell>
                        <TableCell className="text-center">
                          {optinOk ? (
                            <Badge variant="default" className="text-xs"><Wifi className="h-3 w-3 mr-1" /> Aprovado</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs"><WifiOff className="h-3 w-3 mr-1" /> {l.gv_optin_status || "—"}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center font-mono text-sm">{l.qtd_pvs}</TableCell>
                        <TableCell className="text-right font-mono">{l.qtd_vendas}</TableCell>
                        <TableCell className="text-right font-mono">{fmtBRL(Number(l.total_bruto))}</TableCell>
                        <TableCell className="text-right font-mono text-primary">{fmtBRL(Number(l.total_liquido))}</TableCell>
                        <TableCell className="text-right font-mono text-destructive">{fmtBRL(Number(l.total_taxas))}</TableCell>
                        <TableCell className="min-w-[140px]">
                          <div className="flex items-center gap-2">
                            <Progress value={pct} className="h-1.5 flex-1" />
                            <span className="text-xs font-mono">{pct.toFixed(0)}%</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {l.qtd_conciliado}✓ · {l.qtd_divergente}⚠ · {l.qtd_pendente}⏳
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" variant="ghost"
                              onClick={() => conciliarMutation.mutate(l.cod_empresa)}
                              disabled={conciliarMutation.isPending || !l.qtd_vendas}>
                              <RefreshCw className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="outline"
                              onClick={() => { setLojaSelecionada(l.cod_empresa); setTab("pvs"); }}>
                              Detalhar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: PVs por loja */}
        <TabsContent value="pvs">
          {!pvBreakdown ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Selecione uma loja na aba Lojas.</CardContent></Card>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => { setLojaSelecionada(null); setTab("lojas"); }}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
                <h3 className="font-semibold">{pvBreakdown.loja.nome_fantasia}</h3>
                <Badge variant="outline">{pvBreakdown.loja.qtd_pvs} PVs configurados</Badge>
              </div>
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>PV (Merchant)</TableHead>
                        <TableHead>Última venda</TableHead>
                        <TableHead className="text-right">Vendas</TableHead>
                        <TableHead className="text-right">Bruto</TableHead>
                        <TableHead className="text-right">Líquido</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pvBreakdown.pvsComMov.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Sem movimento no período</TableCell></TableRow>
                      ) : pvBreakdown.pvsComMov.map(p => (
                        <TableRow key={p.pv}>
                          <TableCell className="font-mono">{p.pv}</TableCell>
                          <TableCell>{p.ultima || "—"}</TableCell>
                          <TableCell className="text-right font-mono">{p.qtd}</TableCell>
                          <TableCell className="text-right font-mono">{fmtBRL(p.bruto)}</TableCell>
                          <TableCell className="text-right font-mono text-primary">{fmtBRL(p.liquido)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* TAB 3: Transações */}
        <TabsContent value="transacoes">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Loja</TableHead>
                    <TableHead>Bandeira</TableHead>
                    <TableHead>NSU</TableHead>
                    <TableHead className="text-right">Bruto</TableHead>
                    <TableHead className="text-right">Líquido</TableHead>
                    <TableHead className="text-right">Taxa</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingVendas ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                  ) : vendasCartao.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Sem transações no período.</TableCell></TableRow>
                  ) : vendasCartao
                      .filter((vc: any) => {
                        if (filtroStatus === "todos") return true;
                        const conc = concMap.get(vc.id);
                        if (filtroStatus === "nao_conciliado") return !conc;
                        return conc?.status === filtroStatus;
                      })
                      .map((vc: any) => {
                        const conc = concMap.get(vc.id);
                        const concStatus = conc ? STATUS_CFG[conc.status] : null;
                        const isExp = expandedTx === vc.id;
                        const lojaNome = lojas.find(l => l.cod_empresa === vc.cod_empresa)?.nome_fantasia || vc.cod_empresa;
                        return (
                          <>
                            <TableRow key={vc.id} className="cursor-pointer hover:bg-muted/50"
                              onClick={() => setExpandedTx(isExp ? null : vc.id)}>
                              <TableCell>{isExp ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                              <TableCell className="font-mono text-sm">{vc.data_venda}</TableCell>
                              <TableCell className="text-xs">{lojaNome}</TableCell>
                              <TableCell>{vc.bandeira || "—"}</TableCell>
                              <TableCell className="font-mono text-xs">{vc.nsu || "—"}</TableCell>
                              <TableCell className="text-right font-mono">{fmtBRL(Number(vc.valor_bruto))}</TableCell>
                              <TableCell className="text-right font-mono text-primary">{fmtBRL(Number(vc.valor_liquido))}</TableCell>
                              <TableCell className="text-right font-mono text-destructive">{vc.taxa_valor ? fmtBRL(Number(vc.taxa_valor)) : "—"}</TableCell>
                              <TableCell>
                                {concStatus ? (
                                  <Badge variant={concStatus.variant}>{concStatus.label}</Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-xs">Não conciliado</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                            {isExp && (
                              <TableRow key={vc.id + "_exp"}>
                                <TableCell colSpan={9} className="bg-muted/30">
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs py-2">
                                    <div><span className="text-muted-foreground">TID:</span> <span className="font-mono">{vc.tid || "—"}</span></div>
                                    <div><span className="text-muted-foreground">Autorização:</span> <span className="font-mono">{vc.autorizacao || "—"}</span></div>
                                    <div><span className="text-muted-foreground">Tipo:</span> {vc.tipo} ({vc.parcelas}x)</div>
                                    <div><span className="text-muted-foreground">Crédito previsto:</span> {vc.data_prevista_credito || "—"}</div>
                                    <div><span className="text-muted-foreground">MDR:</span> {vc.taxa_percentual ? `${vc.taxa_percentual}%` : "—"}</div>
                                    <div><span className="text-muted-foreground">PV:</span> <span className="font-mono">{vc.dados_extras?.merchant?.companyNumber || "—"}</span></div>
                                    <div><span className="text-muted-foreground">Captura:</span> {vc.dados_extras?.captureType || "—"}</div>
                                    <div><span className="text-muted-foreground">Cartão:</span> <span className="font-mono">{vc.dados_extras?.cardNumber || "—"}</span></div>
                                    {conc && (
                                      <div className="col-span-full pt-2 border-t">
                                        <span className="text-muted-foreground">Conciliação:</span> {conc.observacao || conc.status}
                                        {conc.diferenca_valor !== 0 && (
                                          <span className="ml-2">| Diferença: <span className={Math.abs(Number(conc.diferenca_valor)) > 0.01 ? "text-destructive font-mono" : "font-mono"}>{fmtBRL(Number(conc.diferenca_valor))}</span></span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </>
                        );
                      })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {totaisGlobais.pend > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <span className="text-sm">
            {totaisGlobais.pend} transação(ões) sem match no ERP. Use "Conciliar" por loja para tentar nova rodada.
          </span>
        </div>
      )}
    </div>
  );
}
