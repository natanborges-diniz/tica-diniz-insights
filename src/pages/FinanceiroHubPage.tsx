import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Landmark, Plus, CheckCircle2, XCircle, Eye,
  ArrowDownCircle, ArrowUpCircle, AlertTriangle,
  Package, Send, FileCheck,
  Download, CreditCard, Banknote, ShieldCheck,
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { WorkflowStepper } from "@/components/financeiro-hub/WorkflowStepper";
import { PrepararPagamentoSheet } from "@/components/financeiro-hub/PrepararPagamentoSheet";
import { BorderoGuidedActions } from "@/components/financeiro-hub/BorderoGuidedActions";

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
  btg_dda_id: string | null;
  dados_extras: Record<string, unknown> | null;
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
  const { codEmpresa: codEmpresaDefault } = useDefaultEmpresa();
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
  const [prepPaymentLanc, setPrepPaymentLanc] = useState<Lancamento | null>(null);

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
  // Banking data for creation
  const [formDadosPixKey, setFormDadosPixKey] = useState("");
  const [formDadosBarcode, setFormDadosBarcode] = useState("");

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
      const dadosExtras: Record<string, unknown> = {};
      if (formTipo === "PAGAR") {
        if (formDadosPixKey) dadosExtras.pix_key = formDadosPixKey;
        if (formDadosBarcode) {
          dadosExtras.linha_digitavel = formDadosBarcode;
          dadosExtras.btg_payment_type = "BANKSLIP";
        } else if (formDadosPixKey) {
          dadosExtras.btg_payment_type = "PIX_KEY";
        }
      }
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
        dados_extras: Object.keys(dadosExtras).length > 0 ? dadosExtras : undefined,
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

  const importErpMutation = useMutation({
    mutationFn: () => invokeAction("importar_erp_auto", { cod_empresa: codEmpresa }),
    onSuccess: (data: { inserted?: number; skipped?: number; dda_vinculados?: number; dda_orfaos?: number; message?: string }) => {
      if (data?.message) {
        toast.info(data.message);
      } else {
        toast.success(
          `Importação concluída: ${data?.inserted || 0} importados, ${data?.skipped || 0} existentes, ${data?.dda_vinculados || 0} DDA vinculados, ${data?.dda_orfaos || 0} DDA órfãos`
        );
      }
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao importar do ERP"),
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
      toast.success("Borderô criado — vá à aba Borderôs para aprovar e enviar");
      invalidateAll();
      setBorderoDialogOpen(false);
      setSelectedIds(new Set());
      setFormBorderoDesc("");
      setActiveTab("borderos");
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao criar borderô"),
  });

  const aprovarBorderoMutation = useMutation({
    mutationFn: (borderoId: string) => invokeAction("aprovar_bordero", { bordero_id: borderoId }),
    onSuccess: () => { toast.success("Borderô aprovado — agora envie ao banco BTG"); invalidateAll(); },
    onError: (e: Error) => toast.error(e.message || "Erro ao aprovar"),
  });

  const enviarBorderoMutation = useMutation({
    mutationFn: (borderoId: string) => invokeAction("enviar_bordero_btg", { bordero_id: borderoId }),
    onSuccess: (data: { sandbox?: boolean }) => {
      toast.success(data?.sandbox ? "Borderô enviado ao BTG (sandbox)" : "Borderô enviado ao BTG — aguarde processamento");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao enviar"),
  });

  const confirmarProcessamentoMutation = useMutation({
    mutationFn: (borderoId: string) => invokeAction("confirmar_processamento", { bordero_id: borderoId }),
    onSuccess: (data: { baixados?: number }) => {
      toast.success(`✓ ${data?.baixados || 0} lançamentos baixados — registrados no DRE e Fluxo de Caixa`);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao confirmar"),
  });

  const cancelarBorderoMutation = useMutation({
    mutationFn: (borderoId: string) => invokeAction("cancelar_bordero", { bordero_id: borderoId }),
    onSuccess: () => { toast.success("Borderô cancelado"); invalidateAll(); },
    onError: (e: Error) => toast.error(e.message || "Erro ao cancelar"),
  });

  const prepararPagamentoMutation = useMutation({
    mutationFn: async ({ id, dadosExtras }: { id: string; dadosExtras: Record<string, unknown> }) => {
      return invokeAction("editar", { id, dados_extras: dadosExtras });
    },
    onSuccess: () => {
      toast.success("Dados de pagamento salvos — selecione na tabela para incluir no borderô");
      invalidateAll();
      setPrepPaymentLanc(null);
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao salvar dados"),
  });

  const resetForm = () => {
    setFormDescricao(""); setFormValor(""); setFormVencimento("");
    setFormPessoa(""); setFormDocumento(""); setFormNatureza("");
    setFormCategoria(""); setFormFormaPgto("");
    setFormDadosPixKey(""); setFormDadosBarcode("");
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

  // DDA badge helper
  const getDdaBadge = (l: Lancamento) => {
    if (l.btg_dda_id && l.origem === "DDA" && l.requer_validacao) {
      return <Badge variant="outline" className="text-[10px] bg-orange-50 text-orange-700 border-orange-200">DDA sem ERP</Badge>;
    }
    if (l.btg_dda_id) {
      return <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">✓ DDA</Badge>;
    }
    if (l.tipo === "PAGAR" && !l.btg_dda_id && l.status === "PREVISTO") {
      return <Badge variant="outline" className="text-[10px] bg-yellow-50 text-yellow-700 border-yellow-200">⚠ Sem DDA</Badge>;
    }
    return null;
  };

  const hasPaymentData = (l: Lancamento) => {
    const d = l.dados_extras || {};
    return !!(d.btg_payment_type || d.linha_digitavel || d.pix_key);
  };

  // KPIs & workflow counts
  const totalPagar = lancamentos.filter(l => l.tipo === "PAGAR" && !["CANCELADO", "BAIXADO"].includes(l.status)).reduce((s, l) => s + l.valor, 0);
  const totalReceber = lancamentos.filter(l => l.tipo === "RECEBER" && !["CANCELADO", "BAIXADO"].includes(l.status)).reduce((s, l) => s + l.valor, 0);
  const pendentesValidacao = lancamentos.filter(l => l.requer_validacao).length;
  const vencidos = lancamentos.filter(l => l.status === "PREVISTO" && new Date(l.data_vencimento) < new Date()).length;
  const borderosAbertos = borderos.filter(b => ["MONTAGEM", "APROVADO"].includes(b.status)).length;

  // Workflow step counts
  const countPrevistos = lancamentos.filter(l => l.tipo === "PAGAR" && l.status === "PREVISTO").length;
  const countComPagamento = lancamentos.filter(l => l.tipo === "PAGAR" && l.status === "PREVISTO" && hasPaymentData(l)).length;
  const countBorderoMontagem = borderos.filter(b => b.status === "MONTAGEM").length;
  const countBorderoAprovado = borderos.filter(b => b.status === "APROVADO").length;
  const countBorderoEnviado = borderos.filter(b => b.status === "ENVIADO").length;
  

  // Determine active step
  const getActiveStep = () => {
    if (countBorderoEnviado > 0) return 5;
    if (countBorderoAprovado > 0) return 4;
    if (countBorderoMontagem > 0) return 3;
    if (countComPagamento > 0) return 2;
    return 1;
  };
  const activeStep = getActiveStep();

  const stepStatus = (step: number): "completed" | "active" | "pending" => {
    if (step < activeStep) return "completed";
    if (step === activeStep) return "active";
    return "pending";
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <ModuleHeader
          title="Hub Financeiro"
          subtitle="Contas a pagar e receber — controle centralizado com envio ao banco"
          icon={<Landmark className="h-5 w-5" />}
          actions={
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => importErpMutation.mutate()} disabled={importErpMutation.isPending}>
                <Download className="h-4 w-4 mr-1" /> {importErpMutation.isPending ? "Importando..." : "Importar ERP"}
              </Button>
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

        {/* ── Workflow Stepper ── */}
        <WorkflowStepper
          steps={[
            {
              number: 1,
              title: "Cadastrar Contas",
              description: "Importe do ERP ou crie manualmente",
              status: stepStatus(1),
              count: countPrevistos,
            },
            {
              number: 2,
              title: "Preparar Pagamento",
              description: "Defina PIX, boleto ou TED",
              status: stepStatus(2),
              count: countComPagamento,
            },
            {
              number: 3,
              title: "Montar Borderô",
              description: "Agrupe em lote para aprovação",
              status: stepStatus(3),
              count: countBorderoMontagem,
            },
            {
              number: 4,
              title: "Aprovar e Enviar",
              description: "Autorize e transmita ao BTG",
              status: stepStatus(4),
              count: countBorderoAprovado,
            },
            {
              number: 5,
              title: "Confirmar Baixa",
              description: "Registre no DRE e fluxo de caixa",
              status: stepStatus(5),
              count: countBorderoEnviado,
            },
          ]}
        />

        {/* Dialog criar lançamento */}
        <BaseDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title="Novo Lançamento — Passo 1"
          footer={
            <>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button
                onClick={() => criarMutation.mutate()}
                disabled={criarMutation.isPending || !formDescricao || !formValor || !formVencimento || !formNatureza}
              >
                Criar Lançamento
              </Button>
            </>
          }
        >
          <div className="space-y-4 py-2">
            {/* Guidance banner */}
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-primary">Cadastre a conta a pagar ou receber</p>
                <p className="text-xs text-muted-foreground">
                  Preencha os dados do lançamento. Campos com * são obrigatórios para garantir a classificação no DRE.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tipo *</Label>
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
                <Label>Natureza (DRE) *</Label>
                <Select value={formNatureza} onValueChange={setFormNatureza}>
                  <SelectTrigger><SelectValue placeholder="Obrigatório" /></SelectTrigger>
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

            {/* Banking data for PAGAR */}
            {formTipo === "PAGAR" && (
              <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                <p className="text-sm font-medium flex items-center gap-2">
                  <Banknote className="h-4 w-4" /> Dados para pagamento
                </p>
                <p className="text-xs text-muted-foreground">
                  Se já tiver a chave PIX ou código de barras, preencha aqui. Caso contrário, você poderá configurar depois no passo "Preparar Pagamento".
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Chave PIX</Label>
                    <Input value={formDadosPixKey} onChange={e => setFormDadosPixKey(e.target.value)} placeholder="CPF, email, tel..." />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Código de barras (boleto)</Label>
                    <Input value={formDadosBarcode} onChange={e => setFormDadosBarcode(e.target.value)} placeholder="Linha digitável" />
                  </div>
                </div>
              </div>
            )}

            {/* Next step hint */}
            <div className="bg-muted/30 rounded-lg p-2.5 border border-dashed">
              <p className="text-xs text-muted-foreground">
                <strong>Após criar:</strong> Configure a forma de pagamento (PIX/Boleto/TED) clicando no ícone <CreditCard className="h-3 w-3 inline" /> na tabela, depois agrupe em um borderô para enviar ao banco.
              </p>
            </div>
          </div>
        </BaseDialog>

        {/* Dialog criar borderô */}
        <BaseDialog
          open={borderoDialogOpen}
          onOpenChange={setBorderoDialogOpen}
          title="Passo 3 — Montar Borderô"
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
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-start gap-2">
              <Package className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-primary">Agrupar {selectedIds.size} lançamento(s) em lote</p>
                <p className="text-xs text-muted-foreground">
                  Total: <strong>{fmtCurrency(previstosPagar.filter(l => selectedIds.has(l.id)).reduce((s, l) => s + l.valor, 0))}</strong> — O borderô será criado em montagem para revisão antes do envio.
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Descrição do lote (opcional)</Label>
              <Input value={formBorderoDesc} onChange={e => setFormBorderoDesc(e.target.value)} placeholder="Ex: Fornecedores Janeiro" />
            </div>
            <div className="bg-muted/30 rounded-lg p-2.5 border border-dashed">
              <p className="text-xs text-muted-foreground">
                <strong>Próximos passos:</strong> Após criar, vá à aba "Borderôs" → Aprove o lote → Envie ao BTG → Confirme a baixa após o processamento bancário.
              </p>
            </div>
          </div>
        </BaseDialog>

        {/* Detalhe borderô */}
        <BaseDialog
          open={!!borderoDetalheId}
          onOpenChange={(open) => { if (!open) setBorderoDetalheId(null); }}
          title={`Borderô ${borderoDetalhe?.bordero?.descricao || borderoDetalheId?.slice(0, 8) || ""}`}
        >
          <div className="space-y-3 py-2">
            {borderoDetalhe?.bordero && (
              <>
                <div className="flex gap-2 items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant={BORDERO_STATUS[borderoDetalhe.bordero.status]?.variant || "outline"}>
                      {BORDERO_STATUS[borderoDetalhe.bordero.status]?.label || borderoDetalhe.bordero.status}
                    </Badge>
                    <span className="text-sm font-medium">{fmtCurrency(borderoDetalhe.bordero.total_valor)}</span>
                    <span className="text-xs text-muted-foreground">({borderoDetalhe.bordero.qtd_lancamentos} lançamentos)</span>
                  </div>
                  {borderoDetalhe.bordero.aprovado_em && (
                    <span className="text-xs text-muted-foreground">
                      Aprovado: {format(new Date(borderoDetalhe.bordero.aprovado_em), "dd/MM/yy HH:mm")}
                    </span>
                  )}
                </div>
                {/* Step hint inside detail */}
                {borderoDetalhe.bordero.status === "MONTAGEM" && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                    <p className="text-xs text-amber-800">
                      <strong>Passo 3:</strong> Revise os lançamentos abaixo. Se estiver tudo correto, feche este detalhe e clique em "Aprovar" na tabela de borderôs.
                    </p>
                  </div>
                )}
                {borderoDetalhe.bordero.status === "APROVADO" && (
                  <div className="bg-primary/5 border border-primary/20 rounded-lg p-2.5">
                    <p className="text-xs text-primary">
                      <strong>Passo 4:</strong> Borderô aprovado. Clique em "Enviar BTG" para transmitir os pagamentos ao banco.
                    </p>
                  </div>
                )}
                {borderoDetalhe.bordero.status === "ENVIADO" && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-2.5">
                    <p className="text-xs text-green-800">
                      <strong>Passo 5:</strong> Lote enviado ao banco. Após confirmação do processamento, clique em "Confirmar Baixa" para registrar no financeiro.
                    </p>
                  </div>
                )}
              </>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Pessoa</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(borderoDetalhe?.lancamentos || []).map((l: Lancamento) => {
                  const payType = l.dados_extras?.btg_payment_type;
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="text-sm">{l.descricao}</TableCell>
                      <TableCell className="text-sm">{l.pessoa_nome || "—"}</TableCell>
                      <TableCell className="text-sm">{format(new Date(l.data_vencimento), "dd/MM/yy")}</TableCell>
                      <TableCell className="text-sm text-right">{fmtCurrency(l.valor)}</TableCell>
                      <TableCell>
                        {payType ? (
                          <Badge variant="outline" className="text-[10px]">
                            {String(payType).replace("_", " ")}
                          </Badge>
                        ) : (
                          <span className="text-xs text-destructive">⚠ Sem dados</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_CONFIG[l.status]?.variant || "outline"}>
                          {STATUS_CONFIG[l.status]?.label || l.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </BaseDialog>

        {/* Sheet: Preparar Pagamento */}
        <PrepararPagamentoSheet
          lancamento={prepPaymentLanc}
          onClose={() => setPrepPaymentLanc(null)}
          onSave={(id, dadosExtras) => prepararPagamentoMutation.mutate({ id, dadosExtras })}
          isPending={prepararPagamentoMutation.isPending}
        />

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
            {/* Contextual hint */}
            {countPrevistos > 0 && countComPagamento === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-start gap-2">
                <CreditCard className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-800">
                  <strong>Dica:</strong> Você tem {countPrevistos} lançamento(s) a pagar sem forma de pagamento configurada. Clique no ícone <CreditCard className="h-3 w-3 inline" /> para definir como cada um será pago (PIX, boleto ou TED) antes de criar o borderô.
                </p>
              </div>
            )}
            {countComPagamento > 0 && selectedIds.size === 0 && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mb-4 flex items-start gap-2">
                <Package className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <p className="text-xs text-primary">
                  <strong>Próximo passo:</strong> Selecione os lançamentos com o checkbox à esquerda e clique em "Criar Borderô" para agrupá-los em um lote de pagamento.
                </p>
              </div>
            )}

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
                        <TableHead className="w-[80px]">DDA</TableHead>
                        <TableHead className="w-[65px]">Pgto</TableHead>
                        <TableHead className="w-[200px] text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                      ) : lancamentos.length === 0 ? (
                        <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Nenhum lançamento encontrado.</TableCell></TableRow>
                      ) : lancamentos.map(l => {
                        const sc = STATUS_CONFIG[l.status] || { label: l.status, variant: "outline" as const };
                        const isVencido = l.status === "PREVISTO" && new Date(l.data_vencimento) < new Date();
                        const canSelect = l.tipo === "PAGAR" && l.status === "PREVISTO";
                        const hasPay = hasPaymentData(l);
                        const payType = l.dados_extras?.btg_payment_type;
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
                            <TableCell>{getDdaBadge(l)}</TableCell>
                            <TableCell>
                              {hasPay && payType ? (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20">
                                      {String(payType).replace("_", " ")}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>Pagamento configurado</TooltipContent>
                                </Tooltip>
                              ) : l.tipo === "PAGAR" && l.status === "PREVISTO" ? (
                                <span className="text-[10px] text-muted-foreground">—</span>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                {l.tipo === "PAGAR" && l.status === "PREVISTO" && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button size="sm" variant={hasPay ? "outline" : "ghost"} onClick={() => setPrepPaymentLanc(l)}>
                                        <CreditCard className={`h-3.5 w-3.5 ${hasPay ? "text-primary" : ""}`} />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>{hasPay ? "Editar dados de pagamento" : "Passo 2: Configurar pagamento"}</TooltipContent>
                                  </Tooltip>
                                )}
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
            {/* Contextual guidance */}
            {borderos.some(b => b.status === "MONTAGEM") && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-start gap-2">
                <FileCheck className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-800">
                  <strong>Passo 3:</strong> Revise os borderôs em montagem. Clique no nome para ver os lançamentos incluídos, depois clique em "Aprovar" para liberar o envio ao banco.
                </p>
              </div>
            )}
            {borderos.some(b => b.status === "APROVADO") && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mb-4 flex items-start gap-2">
                <Send className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <p className="text-xs text-primary">
                  <strong>Passo 4:</strong> Borderô(s) aprovado(s) pronto(s) para envio. Clique em "Enviar BTG" para transmitir ao banco.
                </p>
              </div>
            )}
            {borderos.some(b => b.status === "ENVIADO") && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <p className="text-xs text-green-800">
                  <strong>Passo 5:</strong> Lote(s) enviado(s) ao banco. Após confirmação do processamento, clique em "Confirmar Baixa" para finalizar e registrar no DRE.
                </p>
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Borderôs de Pagamento</CardTitle>
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
                        <TableHead className="w-[320px] text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {borderosLoading ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                      ) : borderos.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum borderô criado. Selecione lançamentos na aba anterior e clique em "Criar Borderô".</TableCell></TableRow>
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
                              <BorderoGuidedActions
                                status={b.status}
                                isAdmin={!!authIsAdmin}
                                onAprovar={() => aprovarBorderoMutation.mutate(b.id)}
                                onEnviar={() => enviarBorderoMutation.mutate(b.id)}
                                onConfirmar={() => confirmarProcessamentoMutation.mutate(b.id)}
                                onCancelar={() => cancelarBorderoMutation.mutate(b.id)}
                                isPendingAprovar={aprovarBorderoMutation.isPending}
                                isPendingEnviar={enviarBorderoMutation.isPending}
                                isPendingConfirmar={confirmarProcessamentoMutation.isPending}
                                isPendingCancelar={cancelarBorderoMutation.isPending}
                              />
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
    </TooltipProvider>
  );
}
