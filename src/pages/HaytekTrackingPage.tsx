// src/pages/HaytekTrackingPage.tsx
// Tracking dashboard for Haytek orders

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useUserEmpresas } from "@/hooks/useUserEmpresas";
import {
  PedidoFornecedorRecord,
  HaytekOrderTracking,
  StatusHistoryEntry,
  listarHistoricoPedidosHaytek,
  listarTimelinePedidoHaytek,
  atualizarTrackingHaytek,
  consultarPedidoHaytek,
} from "@/services/haytekService";
import { toast } from "@/hooks/use-toast";
import { usePedidoAlertas } from "@/hooks/usePedidoAlertas";
import { PendingAlertsCard } from "@/components/tracking/PendingAlertsCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
  if (s.includes("entreg")) return { color: "bg-success-soft text-success border-success-muted", icon: CheckCircle2 };
  if (s.includes("faturad")) return { color: "bg-info-soft text-info border-info-muted", icon: Package };
  if (s.includes("produc") || s.includes("process") || s.includes("confirmado")) return { color: "bg-warning-soft text-warning border-warning-muted", icon: Clock };
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

const HaytekTrackingPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const pedidoParam = searchParams.get("pedido");

  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState(pedidoParam || "");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<StatusHistoryEntry[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());

  // Alertas de status negativo
  const { alertas, acknowledgeAlerta } = usePedidoAlertas("HAYTEK");

  // Consulta avulsa
  const [consultaAvulsaLoading, setConsultaAvulsaLoading] = useState(false);
  const [consultaAvulsaResult, setConsultaAvulsaResult] = useState<HaytekOrderTracking | null>(null);
  const [consultaAvulsaError, setConsultaAvulsaError] = useState<string | null>(null);
  const [consultaEmpresa, setConsultaEmpresa] = useState<string>("");

  const handleConsultaAvulsa = async (num: string) => {
    if (!num.trim()) return;
    if (!consultaEmpresa) {
      toast({ title: "Selecione a loja para consultar", variant: "destructive" });
      return;
    }
    setConsultaAvulsaLoading(true);
    setConsultaAvulsaResult(null);
    setConsultaAvulsaError(null);
    try {
      const data = await consultarPedidoHaytek(num.trim(), Number(consultaEmpresa));
      if ((data as any)?.error) {
        setConsultaAvulsaError((data as any).error);
      } else {
        setConsultaAvulsaResult(data);
      }
    } catch (err: any) {
      setConsultaAvulsaError(err?.message || "Erro ao consultar pedido na Haytek.");
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
    queryKey: ["haytek-tracking-pedidos"],
    queryFn: () => listarHistoricoPedidosHaytek(undefined, 100),
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
    let result = pedidos;
    if (statusFilter !== "all") {
      result = result.filter(p => {
        const s = (p.status || "").toLowerCase();
        if (statusFilter === "pendente") return s.includes("pend") || s.includes("enviad") || s === "confirmado";
        if (statusFilter === "producao") return s.includes("produc") || s.includes("process");
        if (statusFilter === "entregue") return s.includes("entreg") || s.includes("faturad");
        if (statusFilter === "erro") return s.includes("erro") || s.includes("cancel");
        return true;
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        (p.numero_pedido || "").toLowerCase().includes(q) ||
        String(p.cod_os).includes(q)
      );
    }
    return result;
  }, [pedidos, statusFilter, search]);

  const showConsultaAvulsa = !isLoading && filtered.length === 0 && search.trim().length > 0;

  const handleRefreshPedido = async (pedido: PedidoFornecedorRecord) => {
    if (!pedido.numero_pedido || refreshingIds.has(pedido.id)) return;
    setRefreshingIds(prev => new Set(prev).add(pedido.id));
    try {
      const data = await atualizarTrackingHaytek(pedido.numero_pedido, pedido.cod_empresa, pedido.id);
      queryClient.invalidateQueries({ queryKey: ["haytek-tracking-pedidos"] });
      if (data.statusChanged) {
        toast({ title: "Status atualizado", description: `Pedido ${pedido.numero_pedido}: ${data.tracking?.status || "atualizado"}` });
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

  // Live API data per pedido
  const [liveApiData, setLiveApiData] = useState<Record<string, HaytekOrderTracking | null>>({});
  const [liveApiLoading, setLiveApiLoading] = useState<Record<string, boolean>>({});
  const [liveApiError, setLiveApiError] = useState<Record<string, string | null>>({});

  const handleExpand = async (pedidoId: string) => {
    if (expandedId === pedidoId) { setExpandedId(null); return; }
    setExpandedId(pedidoId);
    setLoadingTimeline(true);

    const pedido = pedidos.find(p => p.id === pedidoId);

    // Load timeline
    try {
      const tl = await listarTimelinePedidoHaytek(pedidoId);
      setTimeline(tl);
    } catch { setTimeline([]); }
    setLoadingTimeline(false);

    // Live API consultation
    if (pedido?.numero_pedido) {
      setLiveApiLoading(prev => ({ ...prev, [pedidoId]: true }));
      setLiveApiError(prev => ({ ...prev, [pedidoId]: null }));
      try {
        const apiData = await consultarPedidoHaytek(pedido.numero_pedido, pedido.cod_empresa);
        if ((apiData as any)?.error) {
          setLiveApiError(prev => ({ ...prev, [pedidoId]: (apiData as any).error }));
          setLiveApiData(prev => ({ ...prev, [pedidoId]: null }));
        } else {
          setLiveApiData(prev => ({ ...prev, [pedidoId]: apiData }));
        }
      } catch (err: any) {
        setLiveApiError(prev => ({ ...prev, [pedidoId]: err?.message || "Erro ao consultar API" }));
      } finally {
        setLiveApiLoading(prev => ({ ...prev, [pedidoId]: false }));
      }
    }
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
                <Truck className="h-5 w-5" /> Tracking Haytek
              </h1>
              <p className="text-sm text-muted-foreground">Acompanhamento de pedidos Haytek (Dmax)</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
        </div>

        {/* Pending alerts */}
        <PendingAlertsCard alertas={alertas} onAcknowledge={acknowledgeAlerta} />

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="w-48">
            <Label className="text-[10px] uppercase">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pendente">Pendente/Confirmado</SelectItem>
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
            <Label className="text-[10px] uppercase">Buscar — Nº pedido ou OS</Label>
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
                  placeholder="Nº pedido ou OS (Enter p/ consultar Haytek)"
                  className="pl-9 h-9 font-mono"
                />
              </div>
              {showConsultaAvulsa && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 gap-2 shrink-0"
                  disabled={consultaAvulsaLoading || !consultaEmpresa}
                  onClick={() => handleConsultaAvulsa(search)}
                >
                  {consultaAvulsaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Consultar Haytek
                </Button>
              )}
            </div>
          </div>
          <Badge variant="secondary" className="h-9 flex items-center">
            {filtered.length} pedido{filtered.length !== 1 ? "s" : ""}
          </Badge>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-12 gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> <span className="text-muted-foreground">Carregando pedidos...</span>
          </div>
        )}

        {/* Consulta avulsa result */}
        {showConsultaAvulsa && (consultaAvulsaResult || consultaAvulsaError || consultaAvulsaLoading) && (
          <Card className="border-dashed">
            <CardContent className="p-4 space-y-3">
              {consultaAvulsaLoading && (
                <div className="flex items-center gap-2 justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm text-muted-foreground">Consultando Haytek...</span>
                </div>
              )}
              {consultaAvulsaError && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 text-destructive p-3 text-xs flex items-start gap-2">
                  <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Pedido não encontrado ou erro</p>
                    <p className="mt-0.5 opacity-80">{consultaAvulsaError}</p>
                  </div>
                </div>
              )}
              {consultaAvulsaResult && (
                <div className="space-y-3 text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <span className="font-semibold text-sm font-mono">Pedido #{search}</span>
                    <Badge variant="outline" className={statusBadge(consultaAvulsaResult.status as string || "").color + " text-xs"}>
                      {String(consultaAvulsaResult.status || "Desconhecido")}
                    </Badge>
                    <span className="text-muted-foreground text-[10px]">(consulta avulsa)</span>
                  </div>
                  <pre className="text-xs bg-muted/50 rounded p-3 overflow-x-auto whitespace-pre-wrap max-h-60">
                    {JSON.stringify(consultaAvulsaResult, null, 2)}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Pedidos list */}
        {!isLoading && filtered.length === 0 && !showConsultaAvulsa && (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>Nenhum pedido Haytek encontrado.</p>
          </div>
        )}

        <div className="space-y-2">
          {filtered.map((pedido) => {
            const sb = statusBadge(pedido.status);
            const Icon = sb.icon;
            const isExpanded = expandedId === pedido.id;

            return (
              <Card key={pedido.id} className="overflow-hidden">
                <button
                  type="button"
                  className="w-full text-left p-4 hover:bg-muted/30 transition-colors"
                  onClick={() => handleExpand(pedido.id)}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-semibold text-sm">
                          {pedido.numero_pedido || "Sem número"}
                        </span>
                        <Badge variant="outline" className={sb.color + " text-xs"}>
                          {pedido.status || "Desconhecido"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          OS {pedido.cod_os}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {getEmpresaNome(pedido.cod_empresa)} · {formatDate(pedido.created_at)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => { e.stopPropagation(); handleRefreshPedido(pedido); }}
                        disabled={refreshingIds.has(pedido.id) || !pedido.numero_pedido}
                        title="Atualizar status"
                      >
                        <RefreshCw className={`h-4 w-4 ${refreshingIds.has(pedido.id) ? "animate-spin" : ""}`} />
                      </Button>
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t px-4 pb-4 pt-3 space-y-4 bg-muted/10">
                    {/* Timeline */}
                    <div>
                      <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Histórico de Status</p>
                      {loadingTimeline ? (
                        <div className="flex items-center gap-2 py-3">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-xs text-muted-foreground">Carregando timeline...</span>
                        </div>
                      ) : timeline.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Nenhum histórico registrado.</p>
                      ) : (
                        <div className="space-y-2">
                          {timeline.map((entry, i) => {
                            const esb = statusBadge(entry.status);
                            const EntryIcon = esb.icon;
                            return (
                              <div key={entry.id} className="flex items-start gap-3">
                                <div className="flex flex-col items-center">
                                  <EntryIcon className="h-4 w-4 shrink-0" />
                                  {i < timeline.length - 1 && <div className="w-px h-6 bg-border mt-1" />}
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className={esb.color + " text-[10px]"}>
                                      {entry.status}
                                    </Badge>
                                    <span className="text-[10px] text-muted-foreground">{formatDate(entry.checked_at)}</span>
                                  </div>
                                  {entry.observacao && <p className="text-xs text-muted-foreground mt-0.5">{entry.observacao}</p>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <Separator />

                    {/* Structured payload */}
                    <div>
                      <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Dados do Pedido</p>
                      {pedido.payload ? (() => {
                        const pl = pedido.payload as any;
                        const prod = pl?.products || pl?.pedido?.products || {};
                        const right = prod?.right || {};
                        const left = prod?.left || {};
                        const frame = prod?.frame || {};
                        return (
                          <div className="space-y-3 text-xs">
                            {/* Produto + Paciente */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              <div><span className="text-muted-foreground">Produto:</span> <span className="font-mono font-medium">{prod.productId || "—"}</span></div>
                              <div><span className="text-muted-foreground">Tratamento:</span> <span className="font-medium">{prod.treatment || "—"}</span></div>
                              <div><span className="text-muted-foreground">Paciente:</span> <span className="font-medium">{pl.patientName || pl.pedido?.patientName || "—"}</span></div>
                              <div><span className="text-muted-foreground">OS:</span> <span className="font-mono">{pl.osId || pl.pedido?.osId || "—"}</span></div>
                            </div>

                            {/* Prescrição OD/OE */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {[{ label: "OD", eye: right }, { label: "OE", eye: left }].map(({ label, eye }) => (
                                <div key={label} className="rounded border p-2 bg-background">
                                  <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">{label}</p>
                                  <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-[11px]">
                                    <div>ESF: <span className="font-mono">{eye.spherical || "—"}</span></div>
                                    <div>CIL: <span className="font-mono">{eye.cylindrical || "—"}</span></div>
                                    <div>EIX: <span className="font-mono">{eye.axis || "—"}</span></div>
                                    <div>AD: <span className="font-mono">{eye.addition || "—"}</span></div>
                                    <div>DNP: <span className="font-mono">{eye.ndp || "—"}</span></div>
                                    <div>ALT: <span className="font-mono">{eye.height || "—"}</span></div>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Armação */}
                            {(frame.code || frame.bridge) && (
                              <div className="rounded border p-2 bg-background">
                                <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Armação</p>
                                <div className="grid grid-cols-3 sm:grid-cols-6 gap-x-3 gap-y-1 text-[11px]">
                                  <div>Tipo: <span className="font-medium">{frame.code || "—"}</span></div>
                                  <div>Material: <span className="font-medium">{frame.material || "—"}</span></div>
                                  <div>Formato: <span className="font-mono">{frame.modelImage || "—"}</span></div>
                                  <div>Ponte: <span className="font-mono">{frame.bridge || "—"}</span></div>
                                  <div>Altura: <span className="font-mono">{frame.height || "—"}</span></div>
                                  <div>Largura: <span className="font-mono">{frame.width || "—"}</span></div>
                                </div>
                              </div>
                            )}

                            {/* Corredor + Coloração */}
                            {(prod.corridor || prod.coloring) && (
                              <div className="flex gap-4 text-[11px]">
                                {prod.corridor && <div><span className="text-muted-foreground">Corredor:</span> {prod.corridor}mm</div>}
                                {prod.coloring && <div><span className="text-muted-foreground">Coloração:</span> {prod.coloring.color} {prod.coloring.intensityCode}</div>}
                              </div>
                            )}
                          </div>
                        );
                      })() : (
                        <p className="text-xs text-muted-foreground">Payload não disponível.</p>
                      )}
                    </div>

                    {/* Resposta da API */}
                    {pedido.response && (
                      <>
                        <Separator />
                        <div>
                          <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Resposta da API</p>
                          <div className="text-xs space-y-1">
                            {(pedido.response as any)?.orderId && (
                              <div><span className="text-muted-foreground">Order ID:</span> <span className="font-mono font-medium">{(pedido.response as any).orderId}</span></div>
                            )}
                            {(pedido.response as any)?.status && (
                              <div><span className="text-muted-foreground">Status:</span> {(pedido.response as any).status}</div>
                            )}
                            {(pedido.response as any)?.error && (
                              <div className="text-destructive"><span className="text-muted-foreground">Erro:</span> {(pedido.response as any).error}</div>
                            )}
                            {(pedido.response as any)?.message && (
                              <div><span className="text-muted-foreground">Mensagem:</span> {(pedido.response as any).message}</div>
                            )}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Live API status */}
                    <Separator />
                    <div>
                      <p className="text-xs font-semibold uppercase text-muted-foreground mb-2 flex items-center gap-2">
                        Status ao Vivo (API Haytek)
                        {liveApiLoading[pedido.id] && <Loader2 className="h-3 w-3 animate-spin" />}
                      </p>
                      {liveApiLoading[pedido.id] && (
                        <p className="text-xs text-muted-foreground">Consultando API Haytek...</p>
                      )}
                      {liveApiError[pedido.id] && (
                        <div className="rounded border border-destructive/30 bg-destructive/10 text-destructive p-2 text-xs">
                          {liveApiError[pedido.id]}
                        </div>
                      )}
                      {liveApiData[pedido.id] && !liveApiLoading[pedido.id] && (
                        <div className="rounded border p-2 bg-background text-xs space-y-1">
                          {liveApiData[pedido.id]!.status && (
                            <div><span className="text-muted-foreground">Status:</span> <Badge variant="outline" className={statusBadge(liveApiData[pedido.id]!.status as string).color + " text-[10px] ml-1"}>{String(liveApiData[pedido.id]!.status)}</Badge></div>
                          )}
                          {liveApiData[pedido.id]!.orderId && (
                            <div><span className="text-muted-foreground">Order ID:</span> <span className="font-mono">{String(liveApiData[pedido.id]!.orderId)}</span></div>
                          )}
                          {Array.isArray(liveApiData[pedido.id]!.deliveries) && (liveApiData[pedido.id]!.deliveries as any[]).length > 0 && (
                            <div><span className="text-muted-foreground">Entregas:</span> {(liveApiData[pedido.id]!.deliveries as any[]).length} registro(s)</div>
                          )}
                        </div>
                      )}
                      {!liveApiLoading[pedido.id] && !liveApiError[pedido.id] && !liveApiData[pedido.id] && !pedido.numero_pedido && (
                        <p className="text-xs text-muted-foreground">Sem número de pedido para consultar.</p>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
};

export default HaytekTrackingPage;
