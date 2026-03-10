import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Receipt, Plus, XCircle, ExternalLink, Copy, FileText,
  AlertTriangle, CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresas } from "@/hooks/useEmpresas";
import { useDefaultEmpresa } from "@/hooks/useDefaultEmpresa";
import { ModuleHeader } from "@/components/system/ModuleHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BaseDialog } from "@/components/system/BaseDialog";
import { toast } from "sonner";

interface Cobranca {
  id: string;
  cod_empresa: number;
  valor: number;
  data_vencimento: string;
  data_pagamento: string | null;
  valor_pago: number | null;
  sacado_nome: string | null;
  sacado_documento: string | null;
  linha_digitavel: string | null;
  url_boleto: string | null;
  status: string;
  btg_receivable_id: string | null;
  created_at: string;
}

// BTG v2 statuses: CREATED, REGISTERED, PAID, OVERDUE, CANCELED, WRITTEN_OFF
const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  EMITIDO: { label: "Emitido", variant: "outline" },
  CREATED: { label: "Criado", variant: "outline" },
  REGISTERED: { label: "Registrado", variant: "outline" },
  PAGO: { label: "Pago", variant: "default" },
  PAID: { label: "Pago", variant: "default" },
  VENCIDO: { label: "Vencido", variant: "destructive" },
  OVERDUE: { label: "Vencido", variant: "destructive" },
  CANCELADO: { label: "Cancelado", variant: "secondary" },
  CANCELED: { label: "Cancelado", variant: "secondary" },
  WRITTEN_OFF: { label: "Baixado", variant: "secondary" },
};

export default function BankingCobrancasDashboard() {
  const { empresas } = useEmpresas();
  const { codEmpresa: codEmpresaDefault } = useDefaultEmpresa();
  const queryClient = useQueryClient();

  const [codEmpresa, setCodEmpresa] = useState<number>(codEmpresaDefault || 1);
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form
  const [formValor, setFormValor] = useState("");
  const [formVencimento, setFormVencimento] = useState("");
  const [formNome, setFormNome] = useState("");
  const [formDocumento, setFormDocumento] = useState("");

  const { data: cobrancas = [], isLoading } = useQuery<Cobranca[]>({
    queryKey: ["btg-cobrancas", codEmpresa, filtroStatus],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("btg-cobrancas", {
        body: { action: "listar", cod_empresa: codEmpresa, status: filtroStatus !== "todos" ? filtroStatus : undefined },
      });
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    },
  });

  const emitirMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("btg-cobrancas", {
        body: {
          action: "emitir",
          cod_empresa: codEmpresa,
          valor: Number(formValor),
          data_vencimento: formVencimento,
          sacado_nome: formNome || null,
          sacado_documento: formDocumento,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Boleto emitido com sucesso");
      queryClient.invalidateQueries({ queryKey: ["btg-cobrancas"] });
      setDialogOpen(false);
      setFormValor(""); setFormVencimento(""); setFormNome(""); setFormDocumento("");
    },
    onError: () => toast.error("Erro ao emitir boleto"),
  });

  const cancelarMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.functions.invoke("btg-cobrancas", {
        body: { action: "cancelar", id },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cobrança cancelada");
      queryClient.invalidateQueries({ queryKey: ["btg-cobrancas"] });
    },
    onError: () => toast.error("Erro ao cancelar"),
  });

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado!");
  };

  const hoje = new Date().toISOString().slice(0, 10);
  const abertos = cobrancas.filter((c) => ["EMITIDO", "CREATED", "REGISTERED"].includes(c.status)).length;
  const pagosCount = cobrancas.filter((c) => ["PAGO", "PAID"].includes(c.status)).length;
  const vencidos = cobrancas.filter((c) => ["EMITIDO", "CREATED", "REGISTERED"].includes(c.status) && c.data_vencimento < hoje).length;
  const totalAberto = cobrancas
    .filter((c) => ["EMITIDO", "CREATED", "REGISTERED"].includes(c.status))
    .reduce((s, c) => s + Number(c.valor), 0);

  const isAberto = (status: string) => ["EMITIDO", "CREATED", "REGISTERED"].includes(status);

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Cobranças / Boletos"
        subtitle="Emissão e gestão de boletos via BTG Pactual"
        icon={<Receipt className="h-5 w-5" />}
        actions={
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Emitir Boleto
          </Button>
        }
      />

      <BaseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Emitir Boleto"
        footer={
          <>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => emitirMutation.mutate()} disabled={emitirMutation.isPending || !formValor || !formVencimento || !formDocumento}>
              Emitir
            </Button>
          </>
        }
      >
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Valor (R$)</Label>
            <Input type="number" step="0.01" value={formValor} onChange={(e) => setFormValor(e.target.value)} placeholder="0,00" />
          </div>
          <div className="space-y-1">
            <Label>Vencimento</Label>
            <Input type="date" value={formVencimento} onChange={(e) => setFormVencimento(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Nome do Pagador</Label>
            <Input value={formNome} onChange={(e) => setFormNome(e.target.value)} placeholder="Razão social ou nome" />
          </div>
          <div className="space-y-1">
            <Label>CPF/CNPJ do Pagador</Label>
            <Input value={formDocumento} onChange={(e) => setFormDocumento(e.target.value)} placeholder="00.000.000/0001-00" />
          </div>
        </div>
      </BaseDialog>

      {/* Filters */}
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
          <label className="text-xs text-muted-foreground">Status</label>
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="EMITIDO">Emitido</SelectItem>
              <SelectItem value="PAGO">Pago</SelectItem>
              <SelectItem value="VENCIDO">Vencido</SelectItem>
              <SelectItem value="CANCELADO">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" /> Em Aberto
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{abertos}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Pagos
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{pagosCount}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Vencidos
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold text-destructive">{vencidos}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Receipt className="h-4 w-4" /> Total em Aberto
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{fmtCurrency(totalAberto)}</p></CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Boletos Emitidos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[90px]">Vencimento</TableHead>
                  <TableHead>Pagador</TableHead>
                  <TableHead className="w-[120px] text-right">Valor</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                  <TableHead>Linha Digitável</TableHead>
                  <TableHead className="w-[120px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : cobrancas.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhuma cobrança encontrada.</TableCell></TableRow>
                ) : cobrancas.map((c) => {
                  const sc = STATUS_CONFIG[c.status] || { label: c.status, variant: "outline" as const };
                  const isVencido = isAberto(c.status) && c.data_vencimento < hoje;
                  return (
                    <TableRow key={c.id} className={isVencido ? "bg-destructive/5" : ""}>
                      <TableCell className="text-sm">
                        {format(new Date(c.data_vencimento + "T12:00:00"), "dd/MM/yy")}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div>{c.sacado_nome || "—"}</div>
                        <div className="text-xs text-muted-foreground">{c.sacado_documento}</div>
                      </TableCell>
                      <TableCell className="text-sm text-right font-medium">{fmtCurrency(c.valor)}</TableCell>
                      <TableCell>
                        <Badge variant={isVencido ? "destructive" : sc.variant}>
                          {isVencido ? "Vencido" : sc.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono max-w-[200px] truncate">
                        {c.linha_digitavel ? (
                          <div className="flex items-center gap-1">
                            <span className="truncate">{c.linha_digitavel}</span>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={() => copyToClipboard(c.linha_digitavel!)}>
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {c.url_boleto && (
                            <Button size="sm" variant="ghost" asChild>
                              <a href={c.url_boleto} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          )}
                          {isAberto(c.status) && (
                            <Button size="sm" variant="ghost" onClick={() => cancelarMutation.mutate(c.id)} disabled={cancelarMutation.isPending}>
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
