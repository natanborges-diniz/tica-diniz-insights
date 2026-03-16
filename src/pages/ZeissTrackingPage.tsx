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
  const [consultaNumero, setConsultaNumero] = useState("");
  const [consultaEmpresa, setConsultaEmpresa] = useState<string>("");
  const [consultando, setConsultando] = useState(false);
  const [consultaResult, setConsultaResult] = useState<ZeissTrackingData | null>(null);

  const handleConsultaAvulsa = async () => {
    if (!consultaNumero.trim() || !consultaEmpresa) {
      toast({ title: "Preencha o número do pedido e selecione a loja", variant: "destructive" });
      return;
    }
    setConsultando(true);
    setConsultaResult(null);
    try {
      const data = await consultarPedidoZeiss(consultaNumero.trim(), Number(consultaEmpresa));
      setConsultaResult(data);
      if (!data?.situacao) {
        toast({ title: "Pedido não encontrado", description: "Verifique o número e a loja selecionada.", variant: "destructive" });
      }
    } catch (err: any) {
      const msg = err?.message || (typeof err === "object" && err?.code ? err.code : "Erro ao consultar");
      toast({ title: "Erro na consulta", description: msg, variant: "destructive" });
    } finally {
      setConsultando(false);
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

        {/* Filters */}
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
          <div className="flex-1 min-w-[220px]">
            <Label className="text-[10px] uppercase">Buscar</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nº pedido ou OS..." className="pl-9 h-9 font-mono" />
            </div>
          </div>
          <Badge variant="secondary" className="h-9 flex items-center">
            {filtered.length} pedido{filtered.length !== 1 ? "s" : ""}
          </Badge>
        </div>

        {/* Consulta Avulsa */}
        <Card className="border-dashed">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">Consultar pedido avulso</p>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="w-48">
                <Label className="text-[10px] uppercase">Loja</Label>
                <Select value={consultaEmpresa} onValueChange={setConsultaEmpresa}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {empresas.map(e => (
                      <SelectItem key={e.codEmpresa} value={String(e.codEmpresa)}>{e.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-[180px]">
                <Label className="text-[10px] uppercase">Nº Pedido Zeiss</Label>
                <Input
                  value={consultaNumero}
                  onChange={e => setConsultaNumero(e.target.value)}
                  placeholder="Ex: 1012334"
                  className="h-9 font-mono"
                  onKeyDown={e => e.key === "Enter" && handleConsultaAvulsa()}
                />
              </div>
              <Button onClick={handleConsultaAvulsa} disabled={consultando} className="h-9 gap-2">
                {consultando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Consultar Zeiss
              </Button>
            </div>

            {consultaResult?.situacao && (
              <div className="mt-4 p-3 rounded-md bg-muted/50 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={statusBadge(consultaResult.situacao).color}>
                    {consultaResult.situacao}
                  </Badge>
                  <span className="font-mono text-sm font-bold">Pedido {consultaResult.nrpedido || consultaNumero}</span>
                </div>
                {consultaResult.previsao && (
                  <p className="text-xs text-muted-foreground">Previsão: {consultaResult.previsao}</p>
                )}
                {consultaResult.precoTotal && (
                  <p className="text-xs text-muted-foreground">Preço total: R$ {consultaResult.precoTotal}</p>
                )}
                {consultaResult.rastreamento && (
                  <p className="text-xs font-mono">Rastreio: {consultaResult.rastreamento}</p>
                )}
                {consultaResult.detalhes && consultaResult.detalhes.length > 0 && (
                  <div className="mt-2 relative pl-4 border-l-2 border-border space-y-2">
                    {consultaResult.detalhes.map((d, i) => (
                      <div key={i} className="relative">
                        <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-background border-2 border-primary" />
                        <p className="text-xs">
                          <span className="font-medium">{d.situacao}</span>
                          <span className="text-muted-foreground ml-2">{d.data} {d.hora}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-12 gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> <span className="text-muted-foreground">Carregando pedidos...</span>
          </div>
        )}

        {/* List */}
        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p>Nenhum pedido Zeiss encontrado</p>
          </div>
        )}

        <div className="space-y-2">
          {filtered.map(pedido => {
            const badge = statusBadge(pedido.status);
            const IconComp = badge.icon;
            const isExpanded = expandedId === pedido.id;

            return (
              <Card key={pedido.id} className="overflow-hidden">
                <button
                  onClick={() => handleExpand(pedido.id)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-accent/30 transition-colors"
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
