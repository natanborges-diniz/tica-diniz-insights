// src/pages/ZeissTrackingPage.tsx
// Tracking dashboard for Zeiss orders

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useUserEmpresas } from "@/hooks/useUserEmpresas";
import {
  PedidoFornecedorRecord,
  ZeissTrackingData,
  StatusHistoryEntry,
  listarHistoricoPedidosZeiss,
  atualizarTrackingZeiss,
  listarTimelinePedidoZeiss,
  consultarPedidoZeiss,
} from "@/services/zeissService";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2, RefreshCw, Search, Package, Truck, Clock,
  CheckCircle2, XCircle, ChevronDown, ChevronUp,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ============================================
// HELPERS
// ============================================

function statusBadge(status: string | null) {
  const s = (status || "").toLowerCase();
  if (s.includes("entreg") || s.includes("faturado")) return { color: "bg-success-soft text-success border-success-muted", icon: CheckCircle2 };
  if (s.includes("produc") || s.includes("process") || s.includes("surfac")) return { color: "bg-warning-soft text-warning border-warning-muted", icon: Clock };
  if (s.includes("cancel") || s.includes("erro")) return { color: "bg-danger-soft text-danger border-danger-muted", icon: XCircle };
  if (s.includes("transit") || s.includes("enviad")) return { color: "bg-chart-5/15 text-chart-5 border-chart-5/30", icon: Truck };
  return { color: "bg-muted text-muted-foreground", icon: Clock };
}

function formatDate(d: string | null) {
  if (!d) return "—";
  try { return format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR }); }
  catch { return d; }
}

// ============================================
// COMPONENT
// ============================================

const ZeissTrackingPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const pedidoParam = searchParams.get("pedido");

  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState(pedidoParam || "");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<StatusHistoryEntry[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());

  // Consulta avulsa
  const [consultaAvulsaLoading, setConsultaAvulsaLoading] = useState(false);
  const [consultaAvulsaResult, setConsultaAvulsaResult] = useState<ZeissTrackingData | null>(null);
  const [consultaAvulsaError, setConsultaAvulsaError] = useState<string | null>(null);
  const [consultaEmpresa, setConsultaEmpresa] = useState<string>("");

  const handleConsultaAvulsa = async (num: string) => {
    if (!num.trim()) return;
    if (!consultaEmpresa) {
      toast({ title: "Selecione a loja para consultar na Zeiss", variant: "destructive" });
      return;
    }
    setConsultaAvulsaLoading(true);
    setConsultaAvulsaResult(null);
    setConsultaAvulsaError(null);
    try {
      const data = await consultarPedidoZeiss(num.trim(), Number(consultaEmpresa));
      if (!data?.situacao) {
        setConsultaAvulsaError("Pedido não encontrado. Verifique o número e a loja.");
      } else {
        setConsultaAvulsaResult(data);
      }
    } catch (err: any) {
      setConsultaAvulsaError(err?.message || "Erro ao consultar pedido na Zeiss.");
    } finally {
      setConsultaAvulsaLoading(false);
    }
  };

  const { empresas } = useUserEmpresas();
  const empresaNameMap = useMemo(() => {
    const map = new Map<number, string>();
    empresas.forEach(e => map.set(e.codEmpresa, e.nome));
    return map;
  }, [empresas]);
  const getEmpresaNome = useCallback((cod: number) => empresaNameMap.get(cod) || `Loja ${cod}`, [empresaNameMap]);

  const { data: pedidos = [], isLoading, refetch } = useQuery({
    queryKey: ["zeiss-tracking-pedidos"],
    queryFn: () => listarHistoricoPedidosZeiss(undefined, 100),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!pedidoParam || pedidos.length === 0) return;
    const found = pedidos.find(p => p.numero_pedido === pedidoParam);
    if (found) {
      setExpandedId(found.id);
      handleExpand(found.id);
    }
  }, [pedidoParam, pedidos]);

  const filtered = useMemo(() => {
    let result = pedidos.filter(p => p.numero_pedido);
    if (statusFilter !== "all") {
      result = result.filter(p => {
        const s = (p.status || "").toLowerCase();
        if (statusFilter === "pendente") return s.includes("pend") || s.includes("enviad") || s === "confirmado";
        if (statusFilter === "producao") return s.includes("produc") || s.includes("surfac");
        if (statusFilter === "entregue") return s.includes("entreg") || s.includes("faturad");
        if (statusFilter === "erro") return s.includes("erro") || s.includes("cancel");
        return true;
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p => (p.numero_pedido || "").toLowerCase().includes(q) || String(p.cod_os).includes(q));
    }
    return result;
  }, [pedidos, statusFilter, search]);

  const showConsultaAvulsa = !isLoading && filtered.length === 0 && search.trim().length > 0;

  const handleRefreshPedido = async (pedido: PedidoFornecedorRecord) => {
    if (refreshingIds.has(pedido.id)) return;
    setRefreshingIds(prev => new Set(prev).add(pedido.id));
    try {
      const data = await atualizarTrackingZeiss(pedido.numero_pedido!, pedido.cod_empresa, pedido.id);
      queryClient.invalidateQueries({ queryKey: ["zeiss-tracking-pedidos"] });
      if (data.statusChanged) {
        toast({ title: "Status atualizado", description: `Pedido ${pedido.numero_pedido}: ${data.tracking?.situacao || "atualizado"}` });
      } else {
        toast({ title: "Sem alteração", description: "O status do pedido não mudou." });
      }
      if (expandedId === pedido.id) setTimeline(data.timeline);
    } catch (err) {
      toast({ title: "Erro ao atualizar tracking", description: err instanceof Error ? err.message : "Erro", variant: "destructive" });
    } finally {
      setRefreshingIds(prev => { const s = new Set(prev); s.delete(pedido.id); return s; });
    }
  };

  const handleExpand = async (pedidoId: string) => {
    if (expandedId === pedidoId) { setExpandedId(null); return; }
    setExpandedId(pedidoId);
    setLoadingTimeline(true);
    try {
      const tl = await listarTimelinePedidoZeiss(pedidoId);
      setTimeline(tl);
    } catch { setTimeline([]); }
    setLoadingTimeline(false);
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
              <ChevronDown className="h-5 w-5 rotate-90" />
            </Button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Truck className="h-5 w-5" /> Tracking Zeiss
              </h1>
              <p className="text-sm text-muted-foreground">Acompanhamento de pedidos MaisZeiss</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
        </div>

        {/* Filters + unified search */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="w-48">
            <Label className="text-[10px] uppercase">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="producao">Em Produção</SelectItem>
                <SelectItem value="entregue">Faturado/Entregue</SelectItem>
                <SelectItem value="erro">Erro/Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-44">
            <Label className="text-[10px] uppercase">Loja (consulta avulsa)</Label>
            <Select value={consultaEmpresa} onValueChange={setConsultaEmpresa}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {empresas.map(e => (
                  <SelectItem key={e.codEmpresa} value={String(e.codEmpresa)}>{e.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[220px]">
            <Label className="text-[10px] uppercase">Buscar — Nº pedido, OS ou pedido externo</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    if (consultaAvulsaResult || consultaAvulsaError) {
                      setConsultaAvulsaResult(null);
                      setConsultaAvulsaError(null);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && filtered.length === 0 && search.trim()) {
                      handleConsultaAvulsa(search);
                    }
                  }}
                  placeholder="Nº pedido, OS ou externo (Enter p/ consultar Zeiss)"
                  className="pl-9 h-9 font-mono"
                />
              </div>
              {filtered.length === 0 && search.trim() && !isLoading && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 gap-2 shrink-0"
                  disabled={consultaAvulsaLoading || !consultaEmpresa}
                  onClick={() => handleConsultaAvulsa(search)}
                  title={!consultaEmpresa ? "Selecione a loja primeiro" : "Consultar pedido na Zeiss"}
                >
                  {consultaAvulsaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Consultar Zeiss
                </Button>
              )}
            </div>
          </div>
          <Badge variant="secondary" className="h-9 flex items-center">
            {filtered.length} pedido{filtered.length !== 1 ? "s" : ""}
          </Badge>
        </div>

        {/* Loading list */}
        {isLoading && (
          <div className="flex items-center justify-center py-12 gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> <span className="text-muted-foreground">Carregando pedidos...</span>
          </div>
        )}

        {/* Resultado de consulta avulsa (pedido externo) */}
        {showConsultaAvulsa && (consultaAvulsaResult || consultaAvulsaError || consultaAvulsaLoading) && (
          <Card className="border-dashed">
            <CardContent className="p-4 space-y-3">
              {consultaAvulsaLoading && (
                <div className="flex items-center gap-2 justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm text-muted-foreground">Consultando Zeiss...</span>
                </div>
              )}
              {consultaAvulsaError && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 text-destructive p-3 text-xs flex items-start gap-2">
                  <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Pedido não encontrado ou erro na Zeiss</p>
                    <p className="mt-0.5 opacity-80">{consultaAvulsaError}</p>
                  </div>
                </div>
              )}
              {consultaAvulsaResult && (() => {
                const r = consultaAvulsaResult;
                const totalPreco = r.precototal || r.precoTotal;
                const timeline = r.detalhe_sit || r.detalhes || [];
                return (
                <div className="space-y-4 text-xs">
                  {/* Header com status */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      <span className="font-semibold text-sm font-mono">Pedido #{r.nrpedido || search}</span>
                      <Badge variant="outline" className={statusBadge(r.situacao || "").color + " text-xs"}>
                        {r.situacao}
                      </Badge>
                      <span className="text-muted-foreground text-[10px]">(externo)</span>
                    </div>
                    {totalPreco && (
                      <span className="font-semibold text-sm">R$ {totalPreco}</span>
                    )}
                  </div>

                  {/* Grid de informações principais */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 bg-muted/50 rounded-lg p-3">
                    {r.oscliente && (<div><span className="text-muted-foreground block text-[10px] uppercase">OS Cliente</span><span className="font-mono font-medium">{r.oscliente}</span></div>)}
                    {(r.est || r.estabel) && (<div><span className="text-muted-foreground block text-[10px] uppercase">Estabelecimento</span><span className="font-mono">{r.est || r.estabel}</span></div>)}
                    {r.previsao && (<div><span className="text-muted-foreground block text-[10px] uppercase">Previsão Entrega</span><span>{r.previsao}</span></div>)}
                    {r.primprevisao && r.primprevisao !== r.previsao && (<div><span className="text-muted-foreground block text-[10px] uppercase">1ª Previsão</span><span>{r.primprevisao}</span></div>)}
                    {r.rastreamento && (<div><span className="text-muted-foreground block text-[10px] uppercase">Rastreio</span><span className="font-mono">{r.rastreamento}</span></div>)}
                    {(r.codsituacao || r.codigoSituacao) && (<div><span className="text-muted-foreground block text-[10px] uppercase">Cód. Situação</span><span className="font-mono">{r.codsituacao || r.codigoSituacao}</span></div>)}
                    {r.nomeneg && (<div><span className="text-muted-foreground block text-[10px] uppercase">Negociação</span><span>{r.nomeneg}</span></div>)}
                    {r.campanha && (<div><span className="text-muted-foreground block text-[10px] uppercase">Campanha</span><span>{r.campanha}</span></div>)}
                  </div>

                  {/* Paciente e Médico */}
                  {(r.paciente || r.medico) && (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 bg-muted/30 rounded-lg p-3">
                      {r.paciente && (<div><span className="text-muted-foreground block text-[10px] uppercase">Paciente</span><span className="font-medium">{r.paciente}</span></div>)}
                      {r.medico && (<div><span className="text-muted-foreground block text-[10px] uppercase">Médico</span><span>{r.medico}{r.crm ? ` (CRM ${r.crm})` : ""}</span></div>)}
                      {r.voucher && (<div><span className="text-muted-foreground block text-[10px] uppercase">Voucher</span><span className="font-mono">{r.voucher}{r.descrvoucher ? ` — ${r.descrvoucher}` : ""}</span></div>)}
                    </div>
                  )}

                  {/* Cliente (ótica) */}
                  {r.cliente?.nome && (
                    <div className="bg-muted/30 rounded-lg p-3">
                      <span className="text-muted-foreground block text-[10px] uppercase mb-1">Cliente (Ótica)</span>
                      <span className="font-medium">{r.cliente.nome}</span>
                      {r.cliente.cnpj && <span className="text-muted-foreground ml-2 font-mono text-[10px]">CNPJ {r.cliente.cnpj}</span>}
                    </div>
                  )}

                  {/* Datas de etapas */}
                  {(r.entrada?.data || r.producao?.data || r.fatur?.data) && (
                    <div className="flex flex-wrap gap-4">
                      {r.entrada?.data && (
                        <div className="flex items-center gap-2 bg-muted/30 rounded px-3 py-1.5">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          <div>
                            <span className="text-muted-foreground text-[10px] uppercase block">Entrada</span>
                            <span>{r.entrada.data} {r.entrada.hora}</span>
                          </div>
                        </div>
                      )}
                      {r.producao?.data && (
                        <div className="flex items-center gap-2 bg-muted/30 rounded px-3 py-1.5">
                          <Package className="h-3.5 w-3.5 text-muted-foreground" />
                          <div>
                            <span className="text-muted-foreground text-[10px] uppercase block">Produção</span>
                            <span>{r.producao.data} {r.producao.hora}</span>
                          </div>
                        </div>
                      )}
                      {r.fatur?.data && (
                        <div className="flex items-center gap-2 bg-muted/30 rounded px-3 py-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                          <div>
                            <span className="text-muted-foreground text-[10px] uppercase block">Faturamento</span>
                            <span>{r.fatur.data} {r.fatur.hora}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Garantia */}
                  {(r.prazogarprod || r.prazogarserv) && (
                    <div className="flex gap-4 text-[10px]">
                      {r.prazogarprod && r.prazogarprod !== "0" && (
                        <span className="text-muted-foreground">Garantia Produto: <span className="text-foreground font-medium">{r.prazogarprod} meses</span></span>
                      )}
                      {r.prazogarserv && r.prazogarserv !== "0" && (
                        <span className="text-muted-foreground">Garantia Serviço: <span className="text-foreground font-medium">{r.prazogarserv} meses</span></span>
                      )}
                    </div>
                  )}

                  {/* Timeline */}
                  {timeline.length > 0 && (
                    <div>
                      <Separator className="mb-3" />
                      <p className="font-medium text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Histórico de Produção</p>
                      <div className="relative pl-5 space-y-2">
                        <div className="absolute left-[7px] top-1 bottom-1 w-0.5 bg-border" />
                        {timeline.map((d, i) => (
                          <div key={i} className="relative">
                            <div className={`absolute -left-5 top-0.5 h-3.5 w-3.5 rounded-full border flex items-center justify-center ${i === 0 ? "bg-primary border-primary" : "bg-muted border-border"}`}>
                              <div className={`h-1.5 w-1.5 rounded-full ${i === 0 ? "bg-primary-foreground" : "bg-muted-foreground"}`} />
                            </div>
                            <p className="font-medium">{d.situacao}</p>
                            <p className="text-muted-foreground">{d.data} {d.hora}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                );
              })()}
            </CardContent>
          </Card>
        )}

        {/* Empty (sem resultado local nem avulso) */}
        {!isLoading && filtered.length === 0 && !consultaAvulsaResult && !consultaAvulsaError && !consultaAvulsaLoading && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>Nenhum pedido encontrado</p>
              {search.trim() && <p className="text-xs mt-1">Selecione a loja e pressione Enter ou clique "Consultar Zeiss" para buscar no laboratório</p>}
            </CardContent>
          </Card>
        )}

        <div className="space-y-2">
          {filtered.map(pedido => {
            const badge = statusBadge(pedido.status);
            const IconComp = badge.icon;
            const isExpanded = expandedId === pedido.id;

            return (
              <Card key={pedido.id} className="overflow-hidden">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleExpand(pedido.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleExpand(pedido.id); }}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-accent/30 transition-colors cursor-pointer"
                >
                  <IconComp className="h-5 w-5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm">{pedido.numero_pedido}</span>
                      <Badge variant="outline" className={`text-[10px] ${badge.color}`}>{pedido.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      OS {pedido.cod_os} • {getEmpresaNome(pedido.cod_empresa)} • {formatDate(pedido.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8"
                      onClick={e => { e.stopPropagation(); handleRefreshPedido(pedido); }}
                      disabled={refreshingIds.has(pedido.id)}
                    >
                      <RefreshCw className={`h-4 w-4 ${refreshingIds.has(pedido.id) ? "animate-spin" : ""}`} />
                    </Button>
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </button>

                {isExpanded && (
                  <CardContent className="border-t pt-4">
                    {loadingTimeline ? (
                      <div className="flex items-center gap-2 py-4"><Loader2 className="h-4 w-4 animate-spin" /> Carregando timeline...</div>
                    ) : timeline.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4">Nenhuma atualização de status registrada.</p>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase">Timeline</p>
                        <div className="relative pl-4 border-l-2 border-border space-y-3">
                          {timeline.map((entry, i) => {
                            const entryBadge = statusBadge(entry.status);
                            return (
                              <div key={entry.id} className="relative">
                                <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-background border-2 border-primary" />
                                <div className="flex items-start gap-2">
                                  <Badge variant="outline" className={`text-[10px] shrink-0 ${entryBadge.color}`}>{entry.status}</Badge>
                                  <span className="text-xs text-muted-foreground">{formatDate(entry.checked_at)}</span>
                                </div>
                                {entry.status_producao && (
                                  <p className="text-xs text-muted-foreground ml-1 mt-0.5">Código: {entry.status_producao}</p>
                                )}
                                {entry.rastreio && (
                                  <p className="text-xs font-mono mt-0.5 ml-1">Rastreio: {entry.rastreio}</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
};

export default ZeissTrackingPage;
