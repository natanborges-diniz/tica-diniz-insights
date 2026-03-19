import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Landmark, Plus, CheckCircle2, XCircle, Eye,
  ArrowDownCircle, ArrowUpCircle, AlertTriangle, Filter,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const { codEmpresa: codEmpresaDefault } = useDefaultEmpresa();
  const queryClient = useQueryClient();

  const [codEmpresa, setCodEmpresa] = useState<number>(codEmpresaDefault || 1);
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("lancamentos");

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

  const { data: lancamentos = [], isLoading } = useQuery<Lancamento[]>({
    queryKey: ["lancamentos", codEmpresa, filtroTipo, filtroStatus],
    queryFn: async () => {
      const params: Record<string, unknown> = { cod_empresa: codEmpresa, limit: 500 };
      if (filtroTipo !== "todos") params.tipo = filtroTipo;
      if (filtroStatus !== "todos") params.status = filtroStatus;
      return invokeAction("listar", params);
    },
  });

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
      queryClient.invalidateQueries({ queryKey: ["lancamentos"] });
      setDialogOpen(false);
      resetForm();
    },
    onError: () => toast.error("Erro ao criar lançamento"),
  });

  const autorizarMutation = useMutation({
    mutationFn: (id: string) => invokeAction("autorizar", { id }),
    onSuccess: () => {
      toast.success("Lançamento autorizado");
      queryClient.invalidateQueries({ queryKey: ["lancamentos"] });
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao autorizar"),
  });

  const baixarMutation = useMutation({
    mutationFn: (id: string) => invokeAction("baixar", { id }),
    onSuccess: () => {
      toast.success("Lançamento baixado");
      queryClient.invalidateQueries({ queryKey: ["lancamentos"] });
    },
    onError: () => toast.error("Erro ao baixar"),
  });

  const cancelarMutation = useMutation({
    mutationFn: (id: string) => invokeAction("cancelar", { id }),
    onSuccess: () => {
      toast.success("Lançamento cancelado");
      queryClient.invalidateQueries({ queryKey: ["lancamentos"] });
    },
    onError: () => toast.error("Erro ao cancelar"),
  });

  const resetForm = () => {
    setFormDescricao(""); setFormValor(""); setFormVencimento("");
    setFormPessoa(""); setFormDocumento(""); setFormNatureza("");
    setFormCategoria(""); setFormFormaPgto("");
  };

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  // KPIs
  const totalPagar = lancamentos.filter(l => l.tipo === "PAGAR" && l.status !== "CANCELADO" && l.status !== "BAIXADO").reduce((s, l) => s + l.valor, 0);
  const totalReceber = lancamentos.filter(l => l.tipo === "RECEBER" && l.status !== "CANCELADO" && l.status !== "BAIXADO").reduce((s, l) => s + l.valor, 0);
  const pendentesValidacao = lancamentos.filter(l => l.requer_validacao).length;
  const vencidos = lancamentos.filter(l => l.status === "PREVISTO" && new Date(l.data_vencimento) < new Date()).length;

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Hub Financeiro"
        subtitle="Lançamentos centralizados — fonte única de verdade"
        icon={<Landmark className="h-5 w-5" />}
        actions={
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Novo Lançamento
          </Button>
        }
      />

      {/* Dialog criar */}
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
              <AlertTriangle className="h-4 w-4 text-accent-foreground" /> Vencidos
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{vencidos}</p></CardContent>
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

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lançamentos Financeiros</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Tipo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Pessoa</TableHead>
                  <TableHead className="w-[100px]">Vencimento</TableHead>
                  <TableHead className="w-[120px] text-right">Valor</TableHead>
                  <TableHead className="w-[100px]">Natureza</TableHead>
                  <TableHead className="w-[110px]">Status</TableHead>
                  <TableHead className="w-[60px]">Origem</TableHead>
                  <TableHead className="w-[180px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : lancamentos.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nenhum lançamento encontrado.</TableCell></TableRow>
                ) : lancamentos.map(l => {
                  const sc = STATUS_CONFIG[l.status] || { label: l.status, variant: "outline" as const };
                  const isVencido = l.status === "PREVISTO" && new Date(l.data_vencimento) < new Date();
                  return (
                    <TableRow key={l.id} className={isVencido ? "bg-destructive/5" : undefined}>
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
                          {l.status === "PREVISTO" && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => autorizarMutation.mutate(l.id)} disabled={autorizarMutation.isPending}>
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Autorizar
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => cancelarMutation.mutate(l.id)} disabled={cancelarMutation.isPending}>
                                <XCircle className="h-3.5 w-3.5" />
                              </Button>
                            </>
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
    </div>
  );
}
