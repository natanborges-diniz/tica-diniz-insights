// src/pages/HoyaTrackingPage.tsx
// F4.5: Página de acompanhamento de pedidos Hoya com timeline de status

import React, { useEffect, useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  PedidoFornecedorRecord,
  listarHistoricoPedidos,
  atualizarTrackingHoya,
  listarTimelinePedido,
  consultarXmlHoya,
  consultarDanfeHoya,
  StatusHistoryEntry,
} from "@/services/hoyaService";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Loader2,
  RefreshCw,
  Search,
  Package,
  Truck,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  MapPin,
  FileText,
  FileCode,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ============================================
// HELPERS
// ============================================

function statusBadge(status: string | null) {
  const s = (status || "").toLowerCase();
  if (s.includes("entreg")) return { color: "bg-emerald-500/15 text-emerald-700 border-emerald-300", icon: CheckCircle2 };
  if (s.includes("faturad")) return { color: "bg-blue-500/15 text-blue-700 border-blue-300", icon: Package };
  if (s.includes("produc") || s.includes("process")) return { color: "bg-amber-500/15 text-amber-700 border-amber-300", icon: Clock };
  if (s.includes("cancel") || s.includes("erro")) return { color: "bg-red-500/15 text-red-700 border-red-300", icon: XCircle };
  if (s.includes("transit") || s.includes("enviad")) return { color: "bg-indigo-500/15 text-indigo-700 border-indigo-300", icon: Truck };
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

const HoyaTrackingPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<StatusHistoryEntry[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [xmlDialog, setXmlDialog] = useState<{ open: boolean; content: string; title: string }>({ open: false, content: "", title: "" });
  const [loadingXml, setLoadingXml] = useState<string | null>(null);

  // Fetch pedidos
  const { data: pedidos = [], isLoading, refetch } = useQuery({
    queryKey: ["hoya-tracking-pedidos"],
    queryFn: () => listarHistoricoPedidos(undefined, 100),
    staleTime: 30_000,
  });

  // Filter pedidos
  const filtered = useMemo(() => {
    let result = pedidos.filter(p => p.numero_pedido); // Only those with Hoya order number
    if (statusFilter !== "all") {
      result = result.filter(p => {
        const s = (p.status || "").toLowerCase();
        if (statusFilter === "pendente") return s.includes("pend") || s.includes("enviad") || s === "enviado";
        if (statusFilter === "producao") return s.includes("produc") || s.includes("process");
        if (statusFilter === "transito") return s.includes("transit") || s.includes("faturad");
        if (statusFilter === "entregue") return s.includes("entreg");
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

  // Refresh single tracking
  const refreshMutation = useMutation({
    mutationFn: (pedido: PedidoFornecedorRecord) =>
      atualizarTrackingHoya(pedido.numero_pedido!, pedido.id),
    onSuccess: (data, pedido) => {
      queryClient.invalidateQueries({ queryKey: ["hoya-tracking-pedidos"] });
      if (data.statusChanged) {
        toast({ title: "Status atualizado", description: `Pedido ${pedido.numero_pedido}: ${data.tracking.status || "atualizado"}` });
      } else {
        toast({ title: "Sem alteração", description: "O status do pedido não mudou." });
      }
      if (expandedId === pedido.id) {
        setTimeline(data.timeline);
      }
    },
    onError: (err) => {
      toast({ title: "Erro ao atualizar tracking", description: err instanceof Error ? err.message : "Erro", variant: "destructive" });
    },
  });

  // Load timeline when expanding
  const handleExpand = async (pedidoId: string) => {
    if (expandedId === pedidoId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(pedidoId);
    setLoadingTimeline(true);
    try {
      const tl = await listarTimelinePedido(pedidoId);
      setTimeline(tl);
    } catch {
      setTimeline([]);
    } finally {
      setLoadingTimeline(false);
    }
  };

  // F4.6: XML handler
  const handleXml = async (numeroPedido: string) => {
    setLoadingXml(`xml-${numeroPedido}`);
    try {
      const result = await consultarXmlHoya(numeroPedido);
      const content = result.xml || JSON.stringify(result, null, 2);
      setXmlDialog({ open: true, content, title: `XML — Pedido #${numeroPedido}` });
    } catch (err) {
      toast({ title: "Erro ao consultar XML", description: err instanceof Error ? err.message : "Erro", variant: "destructive" });
    } finally {
      setLoadingXml(null);
    }
  };

  // F4.6: DANFE handler
  const handleDanfe = async (numeroPedido: string) => {
    setLoadingXml(`danfe-${numeroPedido}`);
    try {
      const result = await consultarDanfeHoya(numeroPedido);
      if (result.url) {
        window.open(result.url, "_blank");
      } else {
        const content = result.danfe || JSON.stringify(result, null, 2);
        setXmlDialog({ open: true, content, title: `DANFE — Pedido #${numeroPedido}` });
      }
    } catch (err) {
      toast({ title: "Erro ao consultar DANFE", description: err instanceof Error ? err.message : "Erro", variant: "destructive" });
    } finally {
      setLoadingXml(null);
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Truck className="h-5 w-5" /> Tracking Hoya
            </h1>
            <p className="text-sm text-muted-foreground">Acompanhamento de pedidos enviados ao laboratório</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Atualizar Lista
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
                <SelectItem value="pendente">Pendente/Enviado</SelectItem>
                <SelectItem value="producao">Em Produção</SelectItem>
                <SelectItem value="transito">Faturado/Trânsito</SelectItem>
                <SelectItem value="entregue">Entregue</SelectItem>
                <SelectItem value="erro">Erro/Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <Label className="text-[10px] uppercase">Buscar</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nº pedido ou OS..."
                className="pl-9 h-9"
              />
            </div>
          </div>
          <Badge variant="secondary" className="h-9 flex items-center">
            {filtered.length} pedido{filtered.length !== 1 ? "s" : ""}
          </Badge>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-12 gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-muted-foreground">Carregando pedidos...</span>
          </div>
        )}

        {/* Empty */}
        {!isLoading && filtered.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>Nenhum pedido encontrado</p>
            </CardContent>
          </Card>
        )}

        {/* Pedidos list */}
        <div className="space-y-2">
          {filtered.map((ped) => {
            const sb = statusBadge(ped.status);
            const StatusIcon = sb.icon;
            const isExpanded = expandedId === ped.id;

            return (
              <Card key={ped.id} className={isExpanded ? "border-primary/40" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    {/* Status icon */}
                    <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${sb.color}`}>
                      <StatusIcon className="h-4 w-4" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-sm">#{ped.numero_pedido}</span>
                        <Badge variant="outline" className={sb.color + " text-xs"}>
                          {ped.status || "Pendente"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">OS {ped.cod_os}</span>
                        {ped.hoya_environment === "staging" && (
                          <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-300">HML</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Empresa {ped.cod_empresa} • {formatDate(ped.requested_at || ped.created_at)}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {/* F4.6: XML/DANFE buttons — visible for faturado/entregue */}
                      {(ped.status || "").toLowerCase().match(/faturad|entreg|transit/) && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={loadingXml === `xml-${ped.numero_pedido}`}
                            onClick={(e) => { e.stopPropagation(); handleXml(ped.numero_pedido!); }}
                            title="Consultar XML"
                          >
                            {loadingXml === `xml-${ped.numero_pedido}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCode className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={loadingXml === `danfe-${ped.numero_pedido}`}
                            onClick={(e) => { e.stopPropagation(); handleDanfe(ped.numero_pedido!); }}
                            title="Consultar DANFE"
                          >
                            {loadingXml === `danfe-${ped.numero_pedido}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={refreshMutation.isPending}
                        onClick={(e) => { e.stopPropagation(); refreshMutation.mutate(ped); }}
                        title="Atualizar tracking"
                      >
                        <RefreshCw className={`h-4 w-4 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleExpand(ped.id)}
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  {/* Expanded timeline */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t">
                      {loadingTimeline ? (
                        <div className="flex items-center gap-2 justify-center py-4">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm text-muted-foreground">Carregando histórico...</span>
                        </div>
                      ) : timeline.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Nenhum histórico — clique em <RefreshCw className="h-3 w-3 inline" /> para buscar o status atual
                        </p>
                      ) : (
                        <div className="relative pl-6 space-y-4">
                          {/* Timeline line */}
                          <div className="absolute left-[11px] top-1 bottom-1 w-0.5 bg-border" />
                          {timeline.map((entry, i) => {
                            const esb = statusBadge(entry.status);
                            const EntryIcon = esb.icon;
                            return (
                              <div key={entry.id} className="relative">
                                <div className={`absolute -left-6 top-0.5 h-5 w-5 rounded-full flex items-center justify-center ${esb.color} border`}>
                                  <EntryIcon className="h-3 w-3" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-sm">{entry.status}</span>
                                    {entry.status_producao && (
                                      <Badge variant="secondary" className="text-[10px]">{entry.status_producao}</Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground">{formatDate(entry.checked_at)}</p>
                                  {entry.rastreio && (
                                    <p className="text-xs mt-0.5 flex items-center gap-1">
                                      <MapPin className="h-3 w-3" /> {entry.rastreio}
                                    </p>
                                  )}
                                  {entry.observacao && (
                                    <p className="text-xs text-muted-foreground mt-0.5">{entry.observacao}</p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* F4.6: XML/DANFE Dialog */}
      <Dialog open={xmlDialog.open} onOpenChange={(open) => setXmlDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCode className="h-4 w-4" /> {xmlDialog.title}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <pre className="text-xs bg-muted p-4 rounded-md overflow-x-auto whitespace-pre-wrap font-mono">
              {xmlDialog.content}
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
};

export default HoyaTrackingPage;
