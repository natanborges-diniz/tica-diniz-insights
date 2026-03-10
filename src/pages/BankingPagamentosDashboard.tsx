import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  CreditCard, Plus, CheckCircle2, Send, Clock,
  Ban,
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

interface Pagamento {
  id: string;
  cod_empresa: number;
  tipo: string;
  valor: number;
  beneficiario: string | null;
  status: string;
  solicitado_por: string | null;
  aprovado_por: string | null;
  aprovado_em: string | null;
  btg_payment_id: string | null;
  dados_pagamento: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

const TIPOS = [
  { value: "PIX_KEY", label: "PIX (Chave)" },
  { value: "PIX_MANUAL", label: "PIX (Manual)" },
  { value: "TED", label: "TED" },
  { value: "BANKSLIP", label: "Boleto" },
  { value: "DARF", label: "DARF" },
];

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  RASCUNHO: { label: "Rascunho", variant: "secondary" },
  APROVADO_INTERNO: { label: "Aprovado", variant: "default" },
  ENVIADO_BTG: { label: "Enviado BTG", variant: "outline" },
  AGUARDANDO_APROVACAO_BTG: { label: "Aguardando BTG", variant: "outline" },
  PAGO: { label: "Pago", variant: "default" },
  REJEITADO: { label: "Rejeitado", variant: "destructive" },
  CANCELADO: { label: "Cancelado", variant: "destructive" },
};

export default function BankingPagamentosDashboard() {
  const { empresas } = useEmpresas();
  const { codEmpresa: codEmpresaDefault } = useDefaultEmpresa();
  const queryClient = useQueryClient();

  const [codEmpresa, setCodEmpresa] = useState<number>(codEmpresaDefault || 1);
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form state
  const [formTipo, setFormTipo] = useState("PIX_KEY");
  const [formValor, setFormValor] = useState("");
  const [formBeneficiario, setFormBeneficiario] = useState("");
  // PIX fields
  const [formChavePix, setFormChavePix] = useState("");
  // Boleto fields
  const [formBarcode, setFormBarcode] = useState("");
  // TED fields
  const [formBanco, setFormBanco] = useState("");
  const [formAgencia, setFormAgencia] = useState("");
  const [formConta, setFormConta] = useState("");
  const [formDocumento, setFormDocumento] = useState("");

  const { data: pagamentos = [], isLoading } = useQuery<Pagamento[]>({
    queryKey: ["btg-pagamentos", codEmpresa, filtroStatus],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("btg-pagamentos", {
        body: { action: "listar", cod_empresa: codEmpresa, status: filtroStatus !== "todos" ? filtroStatus : undefined },
      });
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    },
  });

  const buildDadosPagamento = () => {
    switch (formTipo) {
      case "PIX_KEY":
        return { chave_pix: formChavePix };
      case "PIX_MANUAL":
        return { banco: formBanco, agencia: formAgencia, conta: formConta, documento: formDocumento };
      case "TED":
        return { banco: formBanco, agencia: formAgencia, conta: formConta, documento: formDocumento };
      case "BANKSLIP":
        return { barcode: formBarcode };
      default:
        return {};
    }
  };

  const criarMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("btg-pagamentos", {
        body: {
          action: "criar",
          cod_empresa: codEmpresa,
          tipo: formTipo,
          valor: Number(formValor),
          beneficiario: formBeneficiario || null,
          dados_pagamento: buildDadosPagamento(),
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Pagamento criado como rascunho");
      queryClient.invalidateQueries({ queryKey: ["btg-pagamentos"] });
      setDialogOpen(false);
      resetForm();
    },
    onError: () => toast.error("Erro ao criar pagamento"),
  });

  const resetForm = () => {
    setFormValor(""); setFormBeneficiario(""); setFormChavePix("");
    setFormBarcode(""); setFormBanco(""); setFormAgencia("");
    setFormConta(""); setFormDocumento("");
  };

  const aprovarMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.functions.invoke("btg-pagamentos", {
        body: { action: "aprovar_interno", id },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pagamento aprovado internamente");
      queryClient.invalidateQueries({ queryKey: ["btg-pagamentos"] });
    },
    onError: () => toast.error("Erro ao aprovar"),
  });

  const enviarBtgMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke("btg-pagamentos", {
        body: { action: "enviar_btg", id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Pagamento enviado ao BTG");
      queryClient.invalidateQueries({ queryKey: ["btg-pagamentos"] });
    },
    onError: () => toast.error("Erro ao enviar ao BTG"),
  });

  const cancelarMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.functions.invoke("btg-pagamentos", {
        body: { action: "cancelar", id },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pagamento cancelado");
      queryClient.invalidateQueries({ queryKey: ["btg-pagamentos"] });
    },
    onError: () => toast.error("Erro ao cancelar"),
  });

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const tipoLabel = (tipo: string) => TIPOS.find((t) => t.value === tipo)?.label || tipo;

  const rascunhos = pagamentos.filter((p) => p.status === "RASCUNHO").length;
  const aprovados = pagamentos.filter((p) => p.status === "APROVADO_INTERNO").length;
  const enviados = pagamentos.filter((p) => ["ENVIADO_BTG", "AGUARDANDO_APROVACAO_BTG"].includes(p.status)).length;
  const pagos = pagamentos.filter((p) => p.status === "PAGO").length;

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Pagamentos"
        subtitle="Programação de pagamentos via BTG Pactual"
        icon={<CreditCard className="h-5 w-5" />}
        actions={
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Novo Pagamento
          </Button>
        }
      />

      <BaseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Criar Pagamento"
        footer={
          <>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => criarMutation.mutate()} disabled={criarMutation.isPending || !formValor}>
              Criar Rascunho
            </Button>
          </>
        }
      >
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Tipo</Label>
            <Select value={formTipo} onValueChange={setFormTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Valor (R$)</Label>
            <Input type="number" step="0.01" value={formValor} onChange={(e) => setFormValor(e.target.value)} placeholder="0,00" />
          </div>
          <div className="space-y-1">
            <Label>Beneficiário</Label>
            <Input value={formBeneficiario} onChange={(e) => setFormBeneficiario(e.target.value)} placeholder="Nome do beneficiário" />
          </div>

          {/* Type-specific fields */}
          {formTipo === "PIX_KEY" && (
            <div className="space-y-1">
              <Label>Chave PIX</Label>
              <Input value={formChavePix} onChange={(e) => setFormChavePix(e.target.value)} placeholder="CPF, email, telefone ou aleatória" />
            </div>
          )}

          {formTipo === "BANKSLIP" && (
            <div className="space-y-1">
              <Label>Código de barras</Label>
              <Input value={formBarcode} onChange={(e) => setFormBarcode(e.target.value)} placeholder="Linha digitável ou código de barras" />
            </div>
          )}

          {(formTipo === "TED" || formTipo === "PIX_MANUAL") && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label>Banco</Label>
                  <Input value={formBanco} onChange={(e) => setFormBanco(e.target.value)} placeholder="001" />
                </div>
                <div className="space-y-1">
                  <Label>Agência</Label>
                  <Input value={formAgencia} onChange={(e) => setFormAgencia(e.target.value)} placeholder="0001" />
                </div>
                <div className="space-y-1">
                  <Label>Conta</Label>
                  <Input value={formConta} onChange={(e) => setFormConta(e.target.value)} placeholder="12345-6" />
                </div>
              </div>
              <div className="space-y-1">
                <Label>CPF/CNPJ do beneficiário</Label>
                <Input value={formDocumento} onChange={(e) => setFormDocumento(e.target.value)} placeholder="000.000.000-00" />
              </div>
            </>
          )}
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
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" /> Rascunhos
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{rascunhos}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Aprovados
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{aprovados}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Send className="h-4 w-4" /> Enviados BTG
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{enviados}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Pagos
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{pagos}</p></CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lista de Pagamentos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[90px]">Data</TableHead>
                  <TableHead>Beneficiário</TableHead>
                  <TableHead className="w-[100px]">Tipo</TableHead>
                  <TableHead className="w-[120px] text-right">Valor</TableHead>
                  <TableHead className="w-[140px]">Status</TableHead>
                  <TableHead className="w-[180px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : pagamentos.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum pagamento encontrado.</TableCell></TableRow>
                ) : pagamentos.map((p) => {
                  const sc = STATUS_CONFIG[p.status] || { label: p.status, variant: "outline" as const };
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm">{format(new Date(p.created_at), "dd/MM/yy")}</TableCell>
                      <TableCell className="text-sm">{p.beneficiario || "—"}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{tipoLabel(p.tipo)}</Badge></TableCell>
                      <TableCell className="text-sm text-right font-medium">{fmtCurrency(p.valor)}</TableCell>
                      <TableCell><Badge variant={sc.variant}>{sc.label}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {p.status === "RASCUNHO" && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => aprovarMutation.mutate(p.id)} disabled={aprovarMutation.isPending}>
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Aprovar
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => cancelarMutation.mutate(p.id)} disabled={cancelarMutation.isPending}>
                                <Ban className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                          {p.status === "APROVADO_INTERNO" && (
                            <>
                              <Button size="sm" variant="default" onClick={() => enviarBtgMutation.mutate(p.id)} disabled={enviarBtgMutation.isPending}>
                                <Send className="h-3.5 w-3.5 mr-1" /> Enviar BTG
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => cancelarMutation.mutate(p.id)} disabled={cancelarMutation.isPending}>
                                <Ban className="h-3.5 w-3.5" />
                              </Button>
                            </>
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
