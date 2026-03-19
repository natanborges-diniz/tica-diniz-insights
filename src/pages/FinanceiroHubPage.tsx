import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Landmark, Plus, CheckCircle2, XCircle, Eye,
  ArrowDownCircle, ArrowUpCircle, AlertTriangle,
  Package, Send, FileCheck, Trash2, PlusCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresas } from "@/hooks/useEmpresas";
import { useDefaultEmpresa } from "@/hooks/useDefaultEmpresa";
import { useAuth } from "@/contexts/AuthContext";
import { ModuleHeader } from "@/components/system/ModuleHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BaseDialog } from "@/components/system/BaseDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

interface Lancamento {
  id: string;
  cod_empresa: number;
  tipo: string;
  status: string;
  natureza: string | null;
  categoria: string | null;
  descricao: string;
  pessoa_nome: string | null;
  pessoa_documento: string | null;
  valor: number;
  valor_pago: number | null;
  data_emissao: string | null;
  data_vencimento: string;
  data_pagamento: string | null;
  data_baixa: string | null;
  forma_pagamento: string | null;
  origem: string;
  requer_validacao: boolean;
  bordero_id: string | null;
  created_at: string;
}

interface Bordero {
  id: string;
  cod_empresa: number;
  status: string;
  descricao: string | null;
  total_valor: number;
  qtd_lancamentos: number;
  criado_por: string | null;
  aprovado_por: string | null;
  aprovado_em: string | null;
  btg_batch_id: string | null;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  PREVISTO: { label: "Previsto", variant: "secondary" },
  BORDERO: { label: "Borderô", variant: "outline" },
  AUTORIZADO: { label: "Autorizado", variant: "default" },
  PROCESSANDO: { label: "Processando", variant: "outline" },
  BAIXADO: { label: "Baixado", variant: "default" },
  CANCELADO: { label: "Cancelado", variant: "destructive" },
  CONCILIADO_CARTAO: { label: "Conciliado", variant: "default" },
};

const BORDERO_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  MONTAGEM: { label: "Em Montagem", variant: "secondary" },
  APROVADO: { label: "Aprovado", variant: "default" },
  ENVIADO: { label: "Enviado BTG", variant: "outline" },
  PROCESSADO: { label: "Processado", variant: "default" },
  CANCELADO: { label: "Cancelado", variant: "destructive" },
};

const NATUREZAS = [
  "RECEITA_BRUTA", "RECEITA_FINANCEIRA", "DEVOLUCOES",
  "DESPESAS_OPERACIONAIS", "DESPESAS_ADMINISTRATIVAS", "DESPESAS_FINANCEIRAS",
  "CUSTOS_MERCADORIA", "IMPOSTOS", "FOLHA_PAGAMENTO",
  "TAXA_ADQUIRENTE", "OUTROS",
];

const CATEGORIAS = [
  "VENDA_PRODUTO", "VENDA_SERVICO", "ALUGUEL", "SALARIOS",
  "ENERGIA", "TELEFONE", "INTERNET", "AGUA", "MANUTENCAO",
  "FORNECEDORES", "IMPOSTOS", "TAXAS_BANCARIAS", "CARTAO",
  "OUTROS",
];

export default function FinanceiroHubPage() {
  const { empresas } = useEmpresas();
  const { codEmpresa: codEmpresaDefault, isAdmin } = useDefaultEmpresa();
  const { isAdmin: authIsAdmin } = useAuth();
  const queryClient = useQueryClient();

  const [codEmpresa, setCodEmpresa] = useState<number>(codEmpresaDefault || 1);
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [borderoDialogOpen, setBorderoDialogOpen] = useState(false);
  const [borderoDetalheId, setBorderoDetalheId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("lancamentos");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Form state
  const [formTipo, setFormTipo] = useState("PAGAR");
  const [formDescricao, setFormDescricao] = useState("");
  const [formValor, setFormValor] = useState("");
  const [formVencimento, setFormVencimento] = useState("");
  const [formPessoa, setFormPessoa] = useState("");
  const [formDocumento, setFormDocumento] = useState("");
  const [formNatureza, setFormNatureza] = useState("");
  const [formCategoria, setFormCategoria] = useState("");
  const [formFormaPgto, setFormFormaPgto] = useState("");
  const [formBorderoDesc, setFormBorderoDesc] = useState("");

  const invokeAction = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("Sessão expirada");

    const { data, error } = await supabase.functions.invoke("financeiro-lancamentos", {
      body: { action, ...extra },
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error) throw error;
    return data;
  };

  // ── Queries ──
  const { data: lancamentos = [], isLoading } = useQuery<Lancamento[]>({
    queryKey: ["lancamentos", codEmpresa, filtroTipo, filtroStatus],
    queryFn: async () => {
      const params: Record<string, unknown> = { cod_empresa: codEmpresa, limit: 500 };
      if (filtroTipo !== "todos") params.tipo = filtroTipo;
      if (filtroStatus !== "todos") params.status = filtroStatus;
      return invokeAction("listar", params);
    },
  });

  const { data: borderos = [], isLoading: borderosLoading } = useQuery<Bordero[]>({
    queryKey: ["borderos", codEmpresa],
    queryFn: () => invokeAction("listar_borderos", { cod_empresa: codEmpresa }),
  });

  const { data: borderoDetalhe } = useQuery({
    queryKey: ["bordero-detalhe", borderoDetalheId],
    queryFn: () => invokeAction("detalhe_bordero", { bordero_id: borderoDetalheId }),
    enabled: !!borderoDetalheId,
  });

  // ── Mutations ──
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["lancamentos"] });
    queryClient.invalidateQueries({ queryKey: ["borderos"] });
    queryClient.invalidateQueries({ queryKey: ["bordero-detalhe"] });
  };

  const criarMutation = useMutation({
    mutationFn: async () => {
      return invokeAction("criar", {
        cod_empresa: codEmpresa,
        tipo: formTipo,
        descricao: formDescricao,
        valor: Number(formValor),
        data_vencimento: formVencimento,
        pessoa_nome: formPessoa || null,
        pessoa_documento: formDocumento || null,
        natureza: formNatureza || null,
        categoria: formCategoria || null,
        forma_pagamento: formFormaPgto || null,
      });
    },
    onSuccess: () => {
      toast.success("Lançamento criado");
      invalidateAll();
      setDialogOpen(false);
      resetForm();
    },
    onError: () => toast.error("Erro ao criar lançamento"),
  });

  const autorizarMutation = useMutation({
    mutationFn: (id: string) => invokeAction("autorizar", { id }),
    onSuccess: () => { toast.success("Lançamento autorizado"); invalidateAll(); },
    onError: (e: Error) => toast.error(e.message || "Erro ao autorizar"),
  });

  const baixarMutation = useMutation({
    mutationFn: (id: string) => invokeAction("baixar", { id }),
    onSuccess: () => { toast.success("Lançamento baixado"); invalidateAll(); },
    onError: () => toast.error("Erro ao baixar"),
  });

  const cancelarMutation = useMutation({
    mutationFn: (id: string) => invokeAction("cancelar", { id }),
    onSuccess: () => { toast.success("Lançamento cancelado"); invalidateAll(); },
    onError: () => toast.error("Erro ao cancelar"),
  });

  const criarBorderoMutation = useMutation({
    mutationFn: () => invokeAction("criar_bordero", {
      cod_empresa: codEmpresa,
      descricao: formBorderoDesc || null,
      lancamento_ids: Array.from(selectedIds),
    }),
    onSuccess: () => {
      toast.success("Borderô criado");
      invalidateAll();
      setBorderoDialogOpen(false);
      setSelectedIds(new Set());
      setFormBorderoDesc("");
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao criar borderô"),
  });

  const aprovarBorderoMutation = useMutation({
    mutationFn: (borderoId: string) => invokeAction("aprovar_bordero", { bordero_id: borderoId }),
    onSuccess: () => { toast.success("Borderô aprovado — lançamentos autorizados"); invalidateAll(); },
    onError: (e: Error) => toast.error(e.message || "Erro ao aprovar"),
  });

  const enviarBorderoMutation = useMutation({
    mutationFn: (borderoId: string) => invokeAction("enviar_bordero_btg", { bordero_id: borderoId }),
    onSuccess: (data: { sandbox?: boolean }) => {
      toast.success(data?.sandbox ? "Borderô enviado (sandbox)" : "Borderô enviado ao BTG");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao enviar"),
  });

  const cancelarBorderoMutation = useMutation({
    mutationFn: (borderoId: string) => invokeAction("cancelar_bordero", { bordero_id: borderoId }),
    onSuccess: () => { toast.success("Borderô cancelado"); invalidateAll(); },
    onError: (e: Error) => toast.error(e.message || "Erro ao cancelar"),
  });

  const resetForm = () => {
    setFormDescricao(""); setFormValor(""); setFormVencimento("");
    setFormPessoa(""); setFormDocumento(""); setFormNatureza("");
    setFormCategoria(""); setFormFormaPgto("");
  };

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  // Selection helpers
  const previstosPagar = lancamentos.filter(l => l.tipo === "PAGAR" && l.status === "PREVISTO");
  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === previstosPagar.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(previstosPagar.map(l => l.id)));
    }
  };

  // KPIs
  const totalPagar = lancamentos.filter(l => l.tipo === "PAGAR" && !["CANCELADO", "BAIXADO"].includes(l.status)).reduce((s, l) => s + l.valor, 0);
  const totalReceber = lancamentos.filter(l => l.tipo === "RECEBER" && !["CANCELADO", "BAIXADO"].includes(l.status)).reduce((s, l) => s + l.valor, 0);
  const pendentesValidacao = lancamentos.filter(l => l.requer_validacao).length;
  const vencidos = lancamentos.filter(l => l.status === "PREVISTO" && new Date(l.data_vencimento) < new Date()).length;
  const borderosAbertos = borderos.filter(b => ["MONTAGEM", "APROVADO"].includes(b.status)).length;

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Hub Financeiro"
        subtitle="Lançamentos centralizados — fonte única de verdade"
        icon={<Landmark className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            {selectedIds.size > 0 && (
              <Button size="sm" variant="outline" onClick={() => setBorderoDialogOpen(true)}>
                <Package className="h-4 w-4 mr-1" /> Criar Borderô ({selectedIds.size})
              </Button>
            )}
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Novo Lançamento
            </Button>
          </div>
        }
      />

      {/* Dialog criar lançamento */}
      <BaseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Criar Lançamento"
        footer={
          <>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => criarMutation.mutate()} disabled={criarMutation.isPending || !formDescricao || !formValor || !formVencimento}>
              Criar
            </Button>
          </>
        }
      >
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={formTipo} onValueChange={setFormTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PAGAR">A Pagar</SelectItem>
                  <SelectItem value="RECEBER">A Receber</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Forma Pagamento</Label>
              <Select value={formFormaPgto} onValueChange={setFormFormaPgto}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BOLETO">Boleto</SelectItem>
                  <SelectItem value="PIX">PIX</SelectItem>
                  <SelectItem value="TED">TED</SelectItem>
                  <SelectItem value="CARTAO_CREDITO">Cartão Crédito</SelectItem>
                  <SelectItem value="CARTAO_DEBITO">Cartão Débito</SelectItem>
                  <SelectItem value="DINHEIRO">Dinheiro</SelectItem>
                  <SelectItem value="CHEQUE">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Descrição *</Label>
            <Input value={formDescricao} onChange={e => setFormDescricao(e.target.value)} placeholder="Ex: Aluguel loja centro" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Valor (R$) *</Label>
              <Input type="number" step="0.01" value={formValor} onChange={e => setFormValor(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Vencimento *</Label>
              <Input type="date" value={formVencimento} onChange={e => setFormVencimento(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Beneficiário / Pagador</Label>
              <Input value={formPessoa} onChange={e => setFormPessoa(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>CPF/CNPJ</Label>
              <Input value={formDocumento} onChange={e => setFormDocumento(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Natureza (DRE)</Label>
              <Select value={formNatureza} onValueChange={setFormNatureza}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {NATUREZAS.map(n => <SelectItem key={n} value={n}>{n.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Categoria</Label>
              <Select value={formCategoria} onValueChange={setFormCategoria}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </BaseDialog>

      {/* Dialog criar borderô */}
      <BaseDialog
        open={borderoDialogOpen}
        onOpenChange={setBorderoDialogOpen}
        title="Criar Borderô de Pagamento"
        subtitle={`${selectedIds.size} lançamento(s) selecionado(s) — ${fmtCurrency(
          previstosPagar.filter(l => selectedIds.has(l.id)).reduce((s, l) => s + l.valor, 0)
        )}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setBorderoDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => criarBorderoMutation.mutate()} disabled={criarBorderoMutation.isPending || selectedIds.size === 0}>
              <Package className="h-4 w-4 mr-1" /> Criar Borderô
            </Button>
          </>
        }
      >
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>Descrição do Lote (opcional)</Label>
            <Input value={formBorderoDesc} onChange={e => setFormBorderoDesc(e.target.value)} placeholder="Ex: Fornecedores Janeiro" />
          </div>
          <div className="text-sm text-muted-foreground">
            O borderô será criado em status <Badge variant="secondary">Montagem</Badge> — você poderá adicionar ou remover lançamentos antes de solicitar aprovação.
          </div>
        </div>
      </BaseDialog>

      {/* Detalhe borderô */}
      <BaseDialog
        open={!!borderoDetalheId}
        onOpenChange={(open) => { if (!open) setBorderoDetalheId(null); }}
        title={`Borderô ${borderoDetalhe?.bordero?.descricao || borderoDetalheId?.slice(0, 8) || ""}`}
        subtitle={borderoDetalhe?.bordero ? `${fmtCurrency(borderoDetalhe.bordero.total_valor)} — ${borderoDetalhe.bordero.qtd_lancamentos} lançamentos` : undefined}
      >
        <div className="space-y-3 py-2">
          {borderoDetalhe?.bordero && (
            <div className="flex gap-2 items-center">
              <Badge variant={BORDERO_STATUS[borderoDetalhe.bordero.status]?.variant || "outline"}>
                {BORDERO_STATUS[borderoDetalhe.bordero.status]?.label || borderoDetalhe.bordero.status}
              </Badge>
              {borderoDetalhe.bordero.aprovado_em && (
                <span className="text-xs text-muted-foreground">
                  Aprovado em {format(new Date(borderoDetalhe.bordero.aprovado_em), "dd/MM/yy HH:mm")}
                </span>
              )}
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>Pessoa</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(borderoDetalhe?.lancamentos || []).map((l: Lancamento) => (
                <TableRow key={l.id}>
                  <TableCell className="text-sm">{l.descricao}</TableCell>
                  <TableCell className="text-sm">{l.pessoa_nome || "—"}</TableCell>
                  <TableCell className="text-sm">{format(new Date(l.data_vencimento), "dd/MM/yy")}</TableCell>
                  <TableCell className="text-sm text-right">{fmtCurrency(l.valor)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_CONFIG[l.status]?.variant || "outline"}>
                      {STATUS_CONFIG[l.status]?.label || l.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </BaseDialog>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Empresa</label>
          <Select value={String(codEmpresa)} onValueChange={v => setCodEmpresa(Number(v))}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(empresas || []).map(e => (
                <SelectItem key={e.codEmpresa} value={String(e.codEmpresa)}>
                  {e.nome || `Empresa ${e.codEmpresa}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Tipo</label>
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="PAGAR">A Pagar</SelectItem>
              <SelectItem value="RECEBER">A Receber</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Status</label>
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <ArrowUpCircle className="h-4 w-4 text-destructive" /> A Pagar
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{fmtCurrency(totalPagar)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <ArrowDownCircle className="h-4 w-4 text-primary" /> A Receber
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{fmtCurrency(totalReceber)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Vencidos
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{vencidos}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Package className="h-4 w-4" /> Borderôs Abertos
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{borderosAbertos}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Eye className="h-4 w-4" /> Pend. Validação
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{pendentesValidacao}</p></CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="lancamentos">Lançamentos</TabsTrigger>
          <TabsTrigger value="borderos">
            Borderôs
            {borderosAbertos > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5">{borderosAbertos}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Tab Lançamentos ── */}
        <TabsContent value="lancamentos">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lançamentos Financeiros</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]">
                        {filtroTipo !== "RECEBER" && (
                          <Checkbox
                            checked={previstosPagar.length > 0 && selectedIds.size === previstosPagar.length}
                            onCheckedChange={toggleSelectAll}
                          />
                        )}
                      </TableHead>
                      <TableHead className="w-[70px]">Tipo</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Pessoa</TableHead>
                      <TableHead className="w-[95px]">Vencimento</TableHead>
                      <TableHead className="w-[110px] text-right">Valor</TableHead>
                      <TableHead className="w-[90px]">Natureza</TableHead>
                      <TableHead className="w-[100px]">Status</TableHead>
                      <TableHead className="w-[55px]">Origem</TableHead>
                      <TableHead className="w-[170px] text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                    ) : lancamentos.length === 0 ? (
                      <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Nenhum lançamento encontrado.</TableCell></TableRow>
                    ) : lancamentos.map(l => {
                      const sc = STATUS_CONFIG[l.status] || { label: l.status, variant: "outline" as const };
                      const isVencido = l.status === "PREVISTO" && new Date(l.data_vencimento) < new Date();
                      const canSelect = l.tipo === "PAGAR" && l.status === "PREVISTO";
                      return (
                        <TableRow key={l.id} className={isVencido ? "bg-destructive/5" : undefined}>
                          <TableCell>
                            {canSelect && (
                              <Checkbox
                                checked={selectedIds.has(l.id)}
                                onCheckedChange={() => toggleSelect(l.id)}
                              />
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={l.tipo === "PAGAR" ? "destructive" : "default"} className="text-xs">
                              {l.tipo === "PAGAR" ? "Pagar" : "Receber"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate">
                            {l.descricao}
                            {l.requer_validacao && <Badge variant="outline" className="ml-2 text-[10px]">Validar</Badge>}
                          </TableCell>
                          <TableCell className="text-sm">{l.pessoa_nome || "—"}</TableCell>
                          <TableCell className="text-sm">{format(new Date(l.data_vencimento), "dd/MM/yy")}</TableCell>
                          <TableCell className="text-sm text-right font-medium">{fmtCurrency(l.valor)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{l.natureza?.replace(/_/g, " ") || "—"}</TableCell>
                          <TableCell><Badge variant={sc.variant}>{sc.label}</Badge></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{l.origem}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {l.status === "PREVISTO" && authIsAdmin && (
                                <Button size="sm" variant="outline" onClick={() => autorizarMutation.mutate(l.id)} disabled={autorizarMutation.isPending}>
                                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Autorizar
                                </Button>
                              )}
                              {l.status === "PREVISTO" && (
                                <Button size="sm" variant="ghost" onClick={() => cancelarMutation.mutate(l.id)} disabled={cancelarMutation.isPending}>
                                  <XCircle className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {(l.status === "AUTORIZADO" || l.status === "PROCESSANDO") && (
                                <Button size="sm" variant="default" onClick={() => baixarMutation.mutate(l.id)} disabled={baixarMutation.isPending}>
                                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Baixar
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
        </TabsContent>

        {/* ── Tab Borderôs ── */}
        <TabsContent value="borderos">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Borderôs de Pagamento</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="w-[60px] text-center">Qtd</TableHead>
                      <TableHead className="w-[130px] text-right">Total</TableHead>
                      <TableHead className="w-[120px]">Status</TableHead>
                      <TableHead className="w-[100px]">Criado em</TableHead>
                      <TableHead className="w-[100px]">Aprovado em</TableHead>
                      <TableHead className="w-[220px] text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {borderosLoading ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                    ) : borderos.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum borderô criado.</TableCell></TableRow>
                    ) : borderos.map(b => {
                      const bs = BORDERO_STATUS[b.status] || { label: b.status, variant: "outline" as const };
                      return (
                        <TableRow key={b.id}>
                          <TableCell className="text-sm">
                            <button className="text-primary hover:underline" onClick={() => setBorderoDetalheId(b.id)}>
                              {b.descricao || `Borderô ${b.id.slice(0, 8)}`}
                            </button>
                          </TableCell>
                          <TableCell className="text-center text-sm">{b.qtd_lancamentos}</TableCell>
                          <TableCell className="text-right text-sm font-medium">{fmtCurrency(b.total_valor)}</TableCell>
                          <TableCell><Badge variant={bs.variant}>{bs.label}</Badge></TableCell>
                          <TableCell className="text-sm text-muted-foreground">{format(new Date(b.created_at), "dd/MM/yy")}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {b.aprovado_em ? format(new Date(b.aprovado_em), "dd/MM/yy HH:mm") : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {b.status === "MONTAGEM" && authIsAdmin && (
                                <Button size="sm" variant="outline" onClick={() => aprovarBorderoMutation.mutate(b.id)} disabled={aprovarBorderoMutation.isPending}>
                                  <FileCheck className="h-3.5 w-3.5 mr-1" /> Aprovar
                                </Button>
                              )}
                              {b.status === "APROVADO" && authIsAdmin && (
                                <Button size="sm" variant="default" onClick={() => enviarBorderoMutation.mutate(b.id)} disabled={enviarBorderoMutation.isPending}>
                                  <Send className="h-3.5 w-3.5 mr-1" /> Enviar BTG
                                </Button>
                              )}
                              {["MONTAGEM", "APROVADO"].includes(b.status) && (
                                <Button size="sm" variant="ghost" onClick={() => cancelarBorderoMutation.mutate(b.id)} disabled={cancelarBorderoMutation.isPending}>
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
