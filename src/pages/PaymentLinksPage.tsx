import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Link2, Plus, XCircle, RefreshCw, Copy, ExternalLink,
  CreditCard, Clock, CheckCircle2, AlertTriangle, MessageCircle, Receipt,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresas } from "@/hooks/useEmpresas";
import { useDefaultEmpresa } from "@/hooks/useDefaultEmpresa";
import { ModuleHeader } from "@/components/system/ModuleHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import ReceiptSheet from "@/components/checkout/ReceiptSheet";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ElementType }> = {
  ATIVO: { label: "Ativo", variant: "default", icon: Clock },
  PENDENTE: { label: "Pendente", variant: "secondary", icon: Clock },
  PAGO: { label: "Pago", variant: "default", icon: CheckCircle2 },
  EXPIRADO: { label: "Expirado", variant: "outline", icon: AlertTriangle },
  CANCELADO: { label: "Cancelado", variant: "destructive", icon: XCircle },
};

export default function PaymentLinksPage() {
  const { empresas } = useEmpresas();
  const { codEmpresa: codEmpresaDefault } = useDefaultEmpresa();
  const queryClient = useQueryClient();

  const [codEmpresa, setCodEmpresa] = useState<number>(codEmpresaDefault || 1);
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [dialogOpen, setDialogOpen] = useState(false);

  // New link form
  const [newLink, setNewLink] = useState({
    valor: "",
    descricao: "",
    parcelas_max: "1",
    cliente_nome: "",
    cliente_telefone: "",
  });

  const invokeAction = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("Sessão expirada");

    const { data, error } = await supabase.functions.invoke("payment-links", {
      body: { action, ...extra },
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error) throw error;
    return data;
  };

  const { data: links = [], isLoading } = useQuery({
    queryKey: ["payment-links", codEmpresa, filtroStatus],
    queryFn: () => invokeAction("listar", { cod_empresa: codEmpresa, status: filtroStatus }),
  });

  const criarMutation = useMutation({
    mutationFn: () => invokeAction("criar", {
      cod_empresa: codEmpresa,
      valor: parseFloat(newLink.valor),
      descricao: newLink.descricao,
      parcelas_max: parseInt(newLink.parcelas_max),
      cliente_nome: newLink.cliente_nome || undefined,
      cliente_telefone: newLink.cliente_telefone || undefined,
    }),
    onSuccess: (data: { url_pagamento?: string; tid?: string }) => {
      toast.success(`Link criado${data?.tid ? ` — TID: ${data.tid}` : ""}`);
      setDialogOpen(false);
      setNewLink({ valor: "", descricao: "", parcelas_max: "1", cliente_nome: "", cliente_telefone: "" });
      queryClient.invalidateQueries({ queryKey: ["payment-links"] });
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao criar link"),
  });

  const cancelarMutation = useMutation({
    mutationFn: (linkId: string) => invokeAction("cancelar", { link_id: linkId }),
    onSuccess: () => {
      toast.success("Link cancelado");
      queryClient.invalidateQueries({ queryKey: ["payment-links"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("URL copiada!");
  };

  const shareWhatsApp = (link: { url_pagamento: string | null; descricao: string; valor: number; cliente_telefone: string | null }) => {
    if (!link.url_pagamento) return;
    const msg = encodeURIComponent(
      `💳 Link de Pagamento\n\n${link.descricao}\nValor: ${fmtCurrency(Number(link.valor))}\n\n${link.url_pagamento}`
    );
    const phone = link.cliente_telefone?.replace(/\D/g, "") || "";
    const waUrl = phone ? `https://wa.me/55${phone}?text=${msg}` : `https://wa.me/?text=${msg}`;
    window.open(waUrl, "_blank");
  };

  // KPIs
  const totalAtivos = links.filter((l: { status: string }) => l.status === "ATIVO" || l.status === "PENDENTE").length;
  const totalPagos = links.filter((l: { status: string }) => l.status === "PAGO").length;
  const valorPago = links
    .filter((l: { status: string }) => l.status === "PAGO")
    .reduce((s: number, l: { valor: number }) => s + Number(l.valor), 0);
  const valorPendente = links
    .filter((l: { status: string }) => l.status === "ATIVO" || l.status === "PENDENTE")
    .reduce((s: number, l: { valor: number }) => s + Number(l.valor), 0);

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Links de Pagamento"
        subtitle="Geração e acompanhamento de links de pagamento via adquirente"
        icon={<Link2 className="h-5 w-5" />}
        actions={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo Link</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Link de Pagamento</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Valor (R$)</Label>
                    <Input
                      type="number" step="0.01" min="0.01"
                      value={newLink.valor}
                      onChange={e => setNewLink(f => ({ ...f, valor: e.target.value }))}
                      placeholder="0,00"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Parcelas</Label>
                    <Select value={newLink.parcelas_max} onValueChange={v => setNewLink(f => ({ ...f, parcelas_max: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                          <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Descrição</Label>
                  <Input
                    value={newLink.descricao}
                    onChange={e => setNewLink(f => ({ ...f, descricao: e.target.value }))}
                    placeholder="Ex: Óculos progressivos - OS 1234"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Nome do cliente (opcional)</Label>
                    <Input
                      value={newLink.cliente_nome}
                      onChange={e => setNewLink(f => ({ ...f, cliente_nome: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Telefone (opcional)</Label>
                    <Input
                      value={newLink.cliente_telefone}
                      onChange={e => setNewLink(f => ({ ...f, cliente_telefone: e.target.value }))}
                    />
                  </div>
                </div>
                <Button
                  className="w-full"
                  disabled={!newLink.valor || !newLink.descricao || criarMutation.isPending}
                  onClick={() => criarMutation.mutate()}
                >
                  {criarMutation.isPending ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <CreditCard className="h-4 w-4 mr-1" />}
                  Gerar Link
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground">Ativos / Pendentes</p>
          <p className="text-lg font-bold">{totalAtivos}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground">Valor Pendente</p>
          <p className="text-lg font-bold text-foreground">{fmtCurrency(valorPendente)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground">Pagos</p>
          <p className="text-lg font-bold text-primary">{totalPagos}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground">Valor Recebido</p>
          <p className="text-lg font-bold text-primary">{fmtCurrency(valorPago)}</p>
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
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos Status</SelectItem>
            <SelectItem value="ATIVO">Ativo</SelectItem>
            <SelectItem value="PENDENTE">Pendente</SelectItem>
            <SelectItem value="PAGO">Pago</SelectItem>
            <SelectItem value="EXPIRADO">Expirado</SelectItem>
            <SelectItem value="CANCELADO">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Parcelas</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead className="w-32">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : links.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum link encontrado. Crie o primeiro!</TableCell></TableRow>
              ) : (
                links.map((link: {
                  id: string; descricao: string; cliente_nome: string | null; cliente_telefone: string | null;
                  valor: number; parcelas_max: number; status: string; origem: string;
                  url_pagamento: string | null; tid: string | null; created_at: string;
                }) => {
                  const st = STATUS_MAP[link.status] || { label: link.status, variant: "outline" as const, icon: Clock };
                  const Icon = st.icon;
                  return (
                    <TableRow key={link.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{link.descricao}</p>
                          {link.tid && <p className="text-[10px] text-muted-foreground font-mono">TID: {link.tid}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {link.cliente_nome || "—"}
                        {link.cliente_telefone && (
                          <p className="text-[10px] text-muted-foreground">{link.cliente_telefone}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">{fmtCurrency(Number(link.valor))}</TableCell>
                      <TableCell className="text-center">{link.parcelas_max}x</TableCell>
                      <TableCell>
                        <Badge variant={st.variant} className="gap-1">
                          <Icon className="h-3 w-3" />
                          {st.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{link.origem}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {new Date(link.created_at).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {link.url_pagamento && (
                            <>
                              <Button size="icon" variant="ghost" title="Copiar URL" onClick={() => copyUrl(link.url_pagamento!)}>
                                <Copy className="h-3 w-3" />
                              </Button>
                              <Button size="icon" variant="ghost" title="Abrir link" asChild>
                                <a href={link.url_pagamento} target="_blank" rel="noreferrer">
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </Button>
                              <Button size="icon" variant="ghost" title="Enviar via WhatsApp" onClick={() => {
                                const msg = encodeURIComponent(`💳 Link de Pagamento\n\n${link.descricao}\nValor: ${fmtCurrency(Number(link.valor))}\n\n${link.url_pagamento}`);
                                const phone = link.cliente_telefone?.replace(/\D/g, "") || "";
                                const waUrl = phone ? `https://wa.me/55${phone}?text=${msg}` : `https://wa.me/?text=${msg}`;
                                window.open(waUrl, "_blank");
                              }}>
                                <MessageCircle className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                          {(link.status === "ATIVO" || link.status === "PENDENTE") && (
                            <Button
                              size="icon" variant="ghost" title="Cancelar"
                              className="text-destructive hover:text-destructive"
                              onClick={() => cancelarMutation.mutate(link.id)}
                            >
                              <XCircle className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
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
