// src/pages/HoyaTrackingPage.tsx
// F4.5: Página de acompanhamento de pedidos Hoya com timeline de status

import React, { useEffect, useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  PedidoFornecedorRecord,
  HoyaPedidoTracking,
  listarHistoricoPedidos,
  atualizarTrackingHoya,
  listarTimelinePedido,
  consultarPedidoHoya,
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
  const [searchParams] = useSearchParams();
  const pedidoParam = searchParams.get("pedido");

  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState(pedidoParam || "");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<StatusHistoryEntry[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [pedidoApiData, setPedidoApiData] = useState<Record<string, HoyaPedidoTracking>>({});
  const [pedidoApiError, setPedidoApiError] = useState<Record<string, string>>({});
  const [loadingPedidoData, setLoadingPedidoData] = useState<string | null>(null);
  const [xmlDialog, setXmlDialog] = useState<{ open: boolean; content: string; title: string }>({ open: false, content: "", title: "" });
  const [loadingXml, setLoadingXml] = useState<string | null>(null);
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());

  // Consulta avulsa — resultado de pedidos externos (não na lista local)
  const [consultaAvulsaLoading, setConsultaAvulsaLoading] = useState(false);
  const [consultaAvulsaResult, setConsultaAvulsaResult] = useState<HoyaPedidoTracking | null>(null);
  const [consultaAvulsaError, setConsultaAvulsaError] = useState<string | null>(null);
  const [consultaAvulsaNumero, setConsultaAvulsaNumero] = useState<string | null>(null);
  const [consultaAvulsaXmlLoading, setConsultaAvulsaXmlLoading] = useState(false);

  // Fetch pedidos
  const { data: pedidos = [], isLoading, refetch } = useQuery({
    queryKey: ["hoya-tracking-pedidos"],
    queryFn: () => listarHistoricoPedidos(undefined, 100),
    staleTime: 30_000,
  });

  // Auto-expand e pre-preenche busca quando vindo do monitor com ?pedido=XXXX
  useEffect(() => {
    if (!pedidoParam || pedidos.length === 0) return;
    const found = pedidos.find(p => p.numero_pedido === pedidoParam);
    if (found) {
      setExpandedId(found.id);
      handleExpand(found.id, found.numero_pedido);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoParam, pedidos]);

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

  // Consulta avulsa: busca pedido diretamente na API Hoya quando não está na lista local
  const handleConsultaAvulsa = async (num: string) => {
    if (!num.trim()) return;
    setConsultaAvulsaLoading(true);
    setConsultaAvulsaResult(null);
    setConsultaAvulsaError(null);
    setConsultaAvulsaNumero(num.trim());
    try {
      const data = await consultarPedidoHoya(num.trim());
      const raw = data as unknown as { error?: string; code?: string };
      if (raw.error) {
        setConsultaAvulsaError(raw.error);
      } else {
        setConsultaAvulsaResult(data);
      }
    } catch (err) {
      setConsultaAvulsaError(err instanceof Error ? err.message : "Erro ao consultar pedido na Hoya.");
    } finally {
      setConsultaAvulsaLoading(false);
    }
  };

  const handleConsultaAvulsaXml = async (tipo: "xml" | "danfe", numero: string) => {
    if (!numero) return;
    setConsultaAvulsaXmlLoading(true);
    try {
      if (tipo === "xml") {
        const result = await consultarXmlHoya(numero);
        const content = result.xml || JSON.stringify(result, null, 2);
        setXmlDialog({ open: true, content, title: `XML — Pedido #${numero}` });
      } else {
        const result = await consultarDanfeHoya(numero);
        if (result.url) {
          window.open(result.url, "_blank");
        } else {
          const content = result.danfe || JSON.stringify(result, null, 2);
          setXmlDialog({ open: true, content, title: `DANFE — Pedido #${numero}` });
        }
      }
    } catch (err) {
      toast({ title: `Erro ao consultar ${tipo.toUpperCase()}`, description: err instanceof Error ? err.message : "Erro", variant: "destructive" });
    } finally {
      setConsultaAvulsaXmlLoading(false);
    }
  };

  // Refresh single tracking — scoped per pedido ID to avoid spinning all buttons
  const handleRefreshPedido = async (pedido: PedidoFornecedorRecord) => {
    if (refreshingIds.has(pedido.id)) return;
    setRefreshingIds((prev) => new Set(prev).add(pedido.id));
    try {
      const data = await atualizarTrackingHoya(pedido.numero_pedido!, pedido.id);
      queryClient.invalidateQueries({ queryKey: ["hoya-tracking-pedidos"] });
      if (data.statusChanged) {
        toast({ title: "Status atualizado", description: `Pedido ${pedido.numero_pedido}: ${data.tracking.status || "atualizado"}` });
      } else {
        toast({ title: "Sem alteração", description: "O status do pedido não mudou." });
      }
      if (expandedId === pedido.id) {
        setTimeline(data.timeline);
      }
    } catch (err) {
      toast({ title: "Erro ao atualizar tracking", description: err instanceof Error ? err.message : "Erro", variant: "destructive" });
    } finally {
      setRefreshingIds((prev) => { const s = new Set(prev); s.delete(pedido.id); return s; });
    }
  };

  // Load timeline + API data when expanding
  const handleExpand = async (pedidoId: string, numeroPedido?: string | null) => {
    if (expandedId === pedidoId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(pedidoId);
    setLoadingTimeline(true);

    // Fetch timeline and Hoya API data in parallel
    const promises: Promise<void>[] = [
      listarTimelinePedido(pedidoId).then(setTimeline).catch(() => setTimeline([])),
    ];

    if (numeroPedido && !pedidoApiData[pedidoId]) {
      setLoadingPedidoData(pedidoId);
      promises.push(
        consultarPedidoHoya(numeroPedido)
          .then((data) => {
            // Edge function retorna { error, details } com status 200 quando Hoya retorna erro
            const raw = data as unknown as { error?: string; details?: { erros?: { mensagem: string }[] }; code?: string };
            if (raw.error) {
              // Extrai a mensagem mais amigável possível
              const detail = raw.details?.erros?.[0]?.mensagem || raw.error;
              setPedidoApiError((prev) => ({ ...prev, [pedidoId]: detail }));
            } else {
              setPedidoApiData((prev) => ({ ...prev, [pedidoId]: data }));
            }
          })
          .catch((err) => {
            const msg = err instanceof Error ? err.message : "Erro ao consultar dados na Hoya.";
            setPedidoApiError((prev) => ({ ...prev, [pedidoId]: msg }));
          })
          .finally(() => setLoadingPedidoData(null))
      );
    }

    await Promise.all(promises);
    setLoadingTimeline(false);
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

        {/* Filters + unified search */}
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
                  placeholder="Nº pedido, OS ou externo (Enter p/ consultar Hoya)"
                  className="pl-9 h-9 font-mono"
                />
              </div>
              {filtered.length === 0 && search.trim() && !isLoading && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 gap-2 shrink-0"
                  disabled={consultaAvulsaLoading}
                  onClick={() => handleConsultaAvulsa(search)}
                >
                  {consultaAvulsaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Consultar Hoya
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
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-muted-foreground">Carregando pedidos...</span>
          </div>
        )}

        {/* Resultado de consulta avulsa (pedido externo) */}
        {!isLoading && filtered.length === 0 && search.trim() && (consultaAvulsaResult || consultaAvulsaError || consultaAvulsaLoading) && (
          <Card className="border-dashed">
            <CardContent className="p-4 space-y-3">
              {consultaAvulsaLoading && (
                <div className="flex items-center gap-2 justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm text-muted-foreground">Consultando Hoya...</span>
                </div>
              )}
              {consultaAvulsaError && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 text-destructive p-3 text-xs flex items-start gap-2">
                  <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Pedido não encontrado ou erro na Hoya</p>
                    <p className="mt-0.5 opacity-80">{consultaAvulsaError}</p>
                  </div>
                </div>
              )}
              {consultaAvulsaResult && consultaAvulsaNumero && (
                <div className="space-y-3 text-xs">
                  {(() => {
                    const temNF = Array.isArray(consultaAvulsaResult.nf) && consultaAvulsaResult.nf.length > 0;
                    const statusFaturado = (consultaAvulsaResult.status || "").toLowerCase().match(/faturad|entreg|transit/);
                    const showDocButtons = temNF || !!statusFaturado;
                    return (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span className="font-semibold text-sm font-mono">Pedido #{consultaAvulsaResult.numeroPedidoHoya}</span>
                      <Badge variant="outline" className={statusBadge(consultaAvulsaResult.status).color + " text-xs"}>
                        {consultaAvulsaResult.status}
                      </Badge>
                      <span className="text-muted-foreground text-[10px]">(externo)</span>
                    </div>
                    {showDocButtons && (
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1" disabled={consultaAvulsaXmlLoading}
                        onClick={() => handleConsultaAvulsaXml("xml", consultaAvulsaNumero)}>
                        {consultaAvulsaXmlLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileCode className="h-3 w-3" />} XML
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1" disabled={consultaAvulsaXmlLoading}
                        onClick={() => handleConsultaAvulsaXml("danfe", consultaAvulsaNumero)}>
                        {consultaAvulsaXmlLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />} DANFE
                      </Button>
                    </div>
                    )}
                  </div>
                    );
                  })()}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 bg-muted/50 rounded p-3">
                    {consultaAvulsaResult.osCliente && (<><span className="text-muted-foreground">OS Cliente</span><span className="font-mono">{consultaAvulsaResult.osCliente}</span></>)}
                    {consultaAvulsaResult.produto && (<><span className="text-muted-foreground">Produto</span><span>{consultaAvulsaResult.produto}</span></>)}
                    {consultaAvulsaResult.tratamento && (<><span className="text-muted-foreground">Tratamento</span><span>{consultaAvulsaResult.tratamento}</span></>)}
                    {consultaAvulsaResult.statusProducao && (<><span className="text-muted-foreground">Status Produção</span><span>{consultaAvulsaResult.statusProducao}</span></>)}
                    {consultaAvulsaResult.dataInclusao && (<><span className="text-muted-foreground">Data Inclusão</span><span>{formatDate(consultaAvulsaResult.dataInclusao)}</span></>)}
                    {consultaAvulsaResult.rastreio && (<><span className="text-muted-foreground">Rastreio</span><span className="font-mono flex items-center gap-1"><MapPin className="h-3 w-3" />{consultaAvulsaResult.rastreio}</span></>)}
                  </div>
                  {consultaAvulsaResult.historico && consultaAvulsaResult.historico.length > 0 && (
                    <div>
                      <p className="font-medium text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Histórico Hoya</p>
                      <div className="relative pl-5 space-y-2">
                        <div className="absolute left-[7px] top-1 bottom-1 w-0.5 bg-border" />
                        {consultaAvulsaResult.historico.map((h, i) => (
                          <div key={i} className="relative">
                            <div className="absolute -left-5 top-0.5 h-3.5 w-3.5 rounded-full bg-muted border flex items-center justify-center">
                              <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                            </div>
                            <p className="font-medium">{h.situacao}</p>
                            <p className="text-muted-foreground">{formatDate(h.data)}</p>
                            {h.observacao && <p className="opacity-70">{h.observacao}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Empty (sem resultado local nem avulso) */}
        {!isLoading && filtered.length === 0 && !consultaAvulsaResult && !consultaAvulsaError && !consultaAvulsaLoading && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>Nenhum pedido encontrado</p>
              {search.trim() && <p className="text-xs mt-1">Pressione Enter ou clique "Consultar Hoya" para buscar diretamente no laboratório</p>}
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
                        disabled={refreshingIds.has(ped.id)}
                        onClick={(e) => { e.stopPropagation(); handleRefreshPedido(ped); }}
                        title="Atualizar tracking"
                      >
                        <RefreshCw className={`h-4 w-4 ${refreshingIds.has(ped.id) ? "animate-spin" : ""}`} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleExpand(ped.id, ped.numero_pedido)}
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t space-y-4">

                      {/* ===== CONFIRMAÇÃO ORIGINAL DA HOYA ===== */}
                      {(() => {
                        const response = ped.response as Record<string, unknown> | null;
                        const payload = ped.payload as Record<string, unknown> | null;
                        
                        if (!response && !payload) return null;

                        // Detecta se pedido foi bem-sucedido (tem numero_pedido)
                        const confirmado = !!ped.numero_pedido;
                        const isErro = (ped.status || "").toUpperCase() === "ERRO";

                        return (
                          <div className={`rounded-md border p-3 space-y-2 text-xs ${confirmado ? "bg-emerald-500/5 border-emerald-300/50" : isErro ? "bg-red-500/5 border-red-300/50" : "bg-muted/40"}`}>
                            <div className="flex items-center gap-2">
                              {confirmado ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                              ) : isErro ? (
                                <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                              ) : (
                                <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                              )}
                              <p className="font-semibold text-sm">
                                {confirmado ? "Pedido confirmado pela Hoya" : isErro ? "Falha no envio à Hoya" : "Resposta da Hoya"}
                              </p>
                            </div>

                            {/* Dados da resposta de confirmação */}
                            {response && (
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1 bg-background/60 rounded p-2">
                                {response.numeroPedido != null && (
                                  <>
                                    <span className="text-muted-foreground">Nº Pedido Hoya</span>
                                    <span className="font-mono font-bold text-emerald-700">{String(response.numeroPedido)}</span>
                                  </>
                                )}
                                {response.status != null && (
                                  <>
                                    <span className="text-muted-foreground">Status Confirmado</span>
                                    <span className="font-medium">{String(response.status)}</span>
                                  </>
                                )}
                                {response.voucherGerado != null && (
                                  <>
                                    <span className="text-muted-foreground">Voucher Gerado</span>
                                    <span className="font-mono">{String(response.voucherGerado)}</span>
                                  </>
                                )}
                                {/* Erros da Hoya no response */}
                                {Array.isArray((response as Record<string, unknown>).erros) && (
                                  <>
                                    <span className="text-muted-foreground col-span-2 text-red-600 font-medium mt-1">Erros retornados:</span>
                                    {((response as Record<string, unknown>).erros as { mensagem?: string }[]).map((e, i) => (
                                      <span key={i} className="col-span-2 text-red-600 pl-2">• {e.mensagem || JSON.stringify(e)}</span>
                                    ))}
                                  </>
                                )}
                                {/* Campos adicionais desconhecidos */}
                                {Object.entries(response)
                                  .filter(([k]) => !["numeroPedido", "status", "voucherGerado", "erros"].includes(k))
                                  .map(([k, v]) => (
                                    <>
                                      <span key={`k-${k}`} className="text-muted-foreground">{k}</span>
                                      <span key={`v-${k}`} className="font-mono break-all">{typeof v === "object" ? JSON.stringify(v) : String(v ?? "—")}</span>
                                    </>
                                  ))
                                }
                              </div>
                            )}

                            {/* OS, Empresa e Valor enviados */}
                            {payload && (
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1 bg-background/60 rounded p-2 mt-1">
                                <span className="text-muted-foreground col-span-2 font-medium text-[10px] uppercase tracking-wide">Dados enviados</span>
                                {payload.os != null && (
                                  <>
                                    <span className="text-muted-foreground">OS (enviada)</span>
                                    <span className="font-mono">{String(payload.os)}</span>
                                  </>
                                )}
                                {payload.codigoCliente != null && (
                                  <>
                                    <span className="text-muted-foreground">Código Cliente Hoya</span>
                                    <span className="font-mono">{String(payload.codigoCliente)}</span>
                                  </>
                                )}
                                {(payload.especificacoes as Record<string, unknown> | null)?.codigoProduto != null && (
                                  <>
                                    <span className="text-muted-foreground">Código Produto</span>
                                    <span className="font-mono">{String((payload.especificacoes as Record<string, unknown>).codigoProduto)}</span>
                                  </>
                                )}
                                {/* Valor do pedido — pode vir como ValorMontagemSemTriangulacao ou variantes */}
                                {(() => {
                                  const valor =
                                    payload.ValorMontagemSemTriangulacao ??
                                    payload.valorMontagemSemTriangulacao ??
                                    payload.valorTotal ??
                                    payload.total;
                                  if (valor == null) return null;
                                  const num = Number(valor);
                                  return (
                                    <>
                                      <span className="text-muted-foreground">Valor do Pedido</span>
                                      <span className="font-semibold">
                                        {isNaN(num) ? String(valor) : num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                      </span>
                                    </>
                                  );
                                })()}
                              </div>
                            )}

                            <p className="text-[10px] text-muted-foreground">
                              Enviado em {formatDate(ped.requested_at || ped.created_at)} • Ambiente: <span className="font-mono">{ped.hoya_environment || "staging"}</span>
                            </p>
                          </div>
                        );
                      })()}

                      {/* Dados do Pedido — vindos da API Hoya (tracking ao vivo) */}
                      {(() => {
                        const apiData = pedidoApiData[ped.id];
                        const isLoading = loadingPedidoData === ped.id;

                        if (isLoading) {
                          return (
                            <div className="flex items-center gap-2 justify-center py-4 rounded-md bg-muted/50">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span className="text-sm text-muted-foreground">Buscando dados na Hoya...</span>
                            </div>
                          );
                        }

                        if (!apiData) {
                          const errorMsg = pedidoApiError[ped.id];
                          if (!errorMsg) return null; // ainda não tentamos ou está carregando
                          const isNotFound = errorMsg.toLowerCase().includes("não encontrado") || errorMsg.toLowerCase().includes("nenhum pedido");
                          return (
                            <div className={`rounded-md border p-3 text-xs flex items-start gap-2 ${isNotFound ? "bg-amber-500/10 border-amber-300 text-amber-800" : "bg-destructive/10 border-destructive/30 text-destructive"}`}>
                              {isNotFound ? (
                                <Clock className="h-4 w-4 shrink-0 mt-0.5" />
                              ) : (
                                <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                              )}
                              <div>
                                <p className="font-medium">{isNotFound ? "Pedido ainda em processamento" : "Erro ao consultar Hoya"}</p>
                                <p className="mt-0.5 opacity-80">{errorMsg}</p>
                              </div>
                            </div>
                          );
                        }

                        const fmtOlho = (olho: Record<string, unknown> | undefined) => {
                          if (!olho) return "—";
                          const parts: string[] = [];
                          if (olho.esferico != null) parts.push(`ESF ${olho.esferico}`);
                          if (olho.cilindrico != null) parts.push(`CIL ${olho.cilindrico}`);
                          if (olho.eixo != null) parts.push(`EIX ${olho.eixo}°`);
                          if (olho.adicao != null) parts.push(`AD ${olho.adicao}`);
                          if (olho.dnpLonge != null) parts.push(`DNP ${olho.dnpLonge}`);
                          if (olho.alturaPupilar != null) parts.push(`ALT ${olho.alturaPupilar}`);
                          return parts.join(" | ") || "—";
                        };

                        const od = apiData.prescricao?.direito as Record<string, unknown> | undefined;
                        const oe = apiData.prescricao?.esquerdo as Record<string, unknown> | undefined;

                        return (
                          <div className="rounded-md bg-muted/50 p-3 space-y-3 text-xs">
                            <p className="font-semibold text-sm">Status ao vivo <span className="text-[10px] font-normal text-muted-foreground">(consultado agora na Hoya)</span></p>

                            {/* OS Cliente + Produto */}
                            <div className="grid grid-cols-2 gap-2">
                              {apiData.osCliente && (
                                <div>
                                  <span className="text-muted-foreground uppercase tracking-wide text-[10px]">OS</span>
                                  <p className="font-mono mt-0.5">{apiData.osCliente}</p>
                                </div>
                              )}
                              {apiData.produto && (
                                <div>
                                  <span className="text-muted-foreground uppercase tracking-wide text-[10px]">Produto</span>
                                  <p className="font-medium mt-0.5">{apiData.produto}</p>
                                </div>
                              )}
                              {apiData.tratamento && (
                                <div>
                                  <span className="text-muted-foreground uppercase tracking-wide text-[10px]">Tratamento</span>
                                  <p className="font-medium mt-0.5">{apiData.tratamento}</p>
                                </div>
                              )}
                              {apiData.statusProducao && (
                                <div>
                                  <span className="text-muted-foreground uppercase tracking-wide text-[10px]">Status Produção</span>
                                  <p className="font-medium mt-0.5">{apiData.statusProducao}</p>
                                </div>
                              )}
                            </div>

                            {/* Prescrição */}
                            {(od || oe) && (
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <span className="text-muted-foreground uppercase tracking-wide text-[10px]">OD (Direito)</span>
                                  <p className="font-mono mt-0.5">{fmtOlho(od)}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground uppercase tracking-wide text-[10px]">OE (Esquerdo)</span>
                                  <p className="font-mono mt-0.5">{fmtOlho(oe)}</p>
                                </div>
                              </div>
                            )}

                            {/* Rastreio */}
                            {apiData.rastreio && (
                              <div>
                                <span className="text-muted-foreground uppercase tracking-wide text-[10px]">Rastreio</span>
                                <p className="font-mono mt-0.5 flex items-center gap-1">
                                  <MapPin className="h-3 w-3" /> {apiData.rastreio}
                                </p>
                              </div>
                            )}

                            {/* Data inclusão */}
                            {apiData.dataInclusao && (
                              <div>
                                <span className="text-muted-foreground uppercase tracking-wide text-[10px]">Data do Pedido</span>
                                <p className="mt-0.5">{formatDate(apiData.dataInclusao)}</p>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      <Separator />

                      {/* Timeline */}
                      <div>
                        <p className="font-semibold text-sm mb-3">Histórico de Status</p>
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
                            <div className="absolute left-[11px] top-1 bottom-1 w-0.5 bg-border" />
                            {timeline.map((entry) => {
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
