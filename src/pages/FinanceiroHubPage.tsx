import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Landmark, Plus, CheckCircle2, XCircle,
  ArrowDownCircle, ArrowUpCircle, AlertTriangle,
  Package, FileCheck, Download, Eye,
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
import { toast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkflowStepper } from "@/components/financeiro-hub/WorkflowStepper";
import { PrepararPagamentoSheet } from "@/components/financeiro-hub/PrepararPagamentoSheet";
import { BorderoGuidedActions } from "@/components/financeiro-hub/BorderoGuidedActions";
import { ContasPagarTable } from "@/components/financeiro-hub/ContasPagarTable";
import { NovoLancamentoDialog } from "@/components/financeiro-hub/NovoLancamentoDialog";
import { AgendaOficialTab } from "@/components/financeiro-hub/AgendaOficialTab";
import { ClassificarLoteDialog } from "@/components/financeiro-hub/ClassificarLoteDialog";

interface Lancamento {
  id: string;
  cod_empresa: number;
  tipo: string;
  status: string;
  natureza: string | null;
  categoria: string | null;
  subcategoria: string | null;
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
  CLASSIFICADO: { label: "Classificado", variant: "outline" },
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

export default function FinanceiroHubPage() {
  const { empresas } = useEmpresas();
  const { codEmpresa: codEmpresaDefault } = useDefaultEmpresa();
  const { isAdmin: authIsAdmin } = useAuth();
  const queryClient = useQueryClient();

  const [codEmpresa, setCodEmpresa] = useState<number>(codEmpresaDefault || 1);
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [filtroCampoData, setFiltroCampoData] = useState<string>("VENCIMENTO");
  const [filtroDataInicio, setFiltroDataInicio] = useState<string>("");
  const [filtroDataFim, setFiltroDataFim] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [borderoDialogOpen, setBorderoDialogOpen] = useState(false);
  const [borderoDetalheId, setBorderoDetalheId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("contas-pagar");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [prepPaymentLanc, setPrepPaymentLanc] = useState<Lancamento | null>(null);
  const [editLanc, setEditLanc] = useState<Lancamento | null>(null);
  const [baixaManualLanc, setBaixaManualLanc] = useState<Lancamento | null>(null);
  const [baixaValorPago, setBaixaValorPago] = useState("");
  const [baixaDataPgto, setBaixaDataPgto] = useState("");
  const [formBorderoDesc, setFormBorderoDesc] = useState("");
  const [classificarLoteOpen, setClassificarLoteOpen] = useState(false);

  // Edit classification state
  const [editNatureza, setEditNatureza] = useState("");
  const [editCategoria, setEditCategoria] = useState("");
  const [editSubcategoria, setEditSubcategoria] = useState("");

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
    queryKey: ["lancamentos", codEmpresa, filtroStatus, filtroCampoData, filtroDataInicio, filtroDataFim],
    queryFn: async () => {
      const params: Record<string, unknown> = { cod_empresa: codEmpresa, limit: 500, tipo: "PAGAR" };
      if (filtroStatus !== "todos") params.status = filtroStatus;
      if (filtroDataInicio) params.data_inicio = filtroDataInicio;
      if (filtroDataFim) params.data_fim = filtroDataFim;
      if (filtroCampoData) params.campo_data = filtroCampoData;
      return invokeAction("listar", params);
    },
  });

  const { data: planoContas = [] } = useQuery<{ id: string; conta_numero: string; conta_descricao: string; grupo_dre: string; categoria: string; ativo: boolean }[]>({
    queryKey: ["dre-plano-contas-ativas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dre_plano_contas")
        .select("id, conta_numero, conta_descricao, grupo_dre, categoria, ativo")
        .eq("ativo", true)
        .order("conta_descricao", { ascending: true });
      if (error) throw error;
      return data ?? [];
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
    mutationFn: async (data: Record<string, unknown>) => {
      return invokeAction("criar", { cod_empresa: codEmpresa, ...data });
    },
    onSuccess: () => { toast.success("Lançamento criado"); invalidateAll(); setDialogOpen(false); },
    onError: () => toast.error("Erro ao criar lançamento"),
  });

  const importErpMutation = useMutation({
    mutationFn: () => invokeAction("importar_erp_auto", { cod_empresa: codEmpresa }),
    onSuccess: (data: { inserted?: number; skipped?: number; dda_vinculados?: number; dda_orfaos?: number; message?: string }) => {
      if (data?.message) { toast.info(data.message); }
      else { toast.success(`Importação: ${data?.inserted || 0} novos, ${data?.skipped || 0} existentes, ${data?.dda_vinculados || 0} DDA vinculados`); }
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao importar do ERP"),
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
      invalidateAll(); setBorderoDialogOpen(false); setSelectedIds(new Set()); setFormBorderoDesc(""); setActiveTab("borderos");
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao criar borderô"),
  });

  const aprovarBorderoMutation = useMutation({
    mutationFn: (id: string) => invokeAction("aprovar_bordero", { bordero_id: id }),
    onSuccess: () => { toast.success("Borderô aprovado"); invalidateAll(); },
    onError: (e: Error) => toast.error(e.message || "Erro ao aprovar"),
  });

  const enviarBorderoMutation = useMutation({
    mutationFn: (id: string) => invokeAction("enviar_bordero_btg", { bordero_id: id }),
    onSuccess: (data: { sandbox?: boolean }) => {
      toast.success(data?.sandbox ? "Enviado ao BTG (sandbox)" : "Enviado ao BTG — aguarde processamento");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao enviar"),
  });

  const confirmarProcessamentoMutation = useMutation({
    mutationFn: (id: string) => invokeAction("confirmar_processamento", { bordero_id: id }),
    onSuccess: (data: { baixados?: number }) => {
      toast.success(`✓ ${data?.baixados || 0} lançamentos baixados`); invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao confirmar"),
  });

  const cancelarBorderoMutation = useMutation({
    mutationFn: (id: string) => invokeAction("cancelar_bordero", { bordero_id: id }),
    onSuccess: () => { toast.success("Borderô cancelado"); invalidateAll(); },
    onError: (e: Error) => toast.error(e.message || "Erro ao cancelar"),
  });

  const removerDoBorderoMutation = useMutation({
    mutationFn: ({ bordero_id, lancamento_ids }: { bordero_id: string; lancamento_ids: string[] }) =>
      invokeAction("remover_do_bordero", { bordero_id, lancamento_ids }),
    onSuccess: () => { toast.success("Lançamento removido do borderô"); invalidateAll(); },
    onError: (e: Error) => toast.error(e.message || "Erro ao remover do borderô"),
  });

  const prepararPagamentoMutation = useMutation({
    mutationFn: async ({ id, dadosExtras }: { id: string; dadosExtras: Record<string, unknown> }) => {
      return invokeAction("editar", { id, dados_extras: dadosExtras });
    },
    onSuccess: () => {
      toast.success("Dados de pagamento salvos"); invalidateAll(); setPrepPaymentLanc(null);
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao salvar dados"),
  });

  const reabrirMutation = useMutation({
    mutationFn: (id: string) => invokeAction("reabrir", { id }),
    onSuccess: () => { toast.success("Lançamento reaberto"); invalidateAll(); },
    onError: (e: Error) => toast.error(e.message || "Erro ao reabrir"),
  });

  const editNaturezaMutation = useMutation({
    mutationFn: async ({ id, natureza, categoria, subcategoria }: { id: string; natureza: string; categoria: string; subcategoria: string }) => {
      return invokeAction("editar", { id, natureza, categoria, subcategoria });
    },
    onSuccess: () => { toast.success("Classificação atualizada"); invalidateAll(); setEditLanc(null); },
    onError: (e: Error) => toast.error(e.message || "Erro ao classificar"),
  });

  const classificarLoteMutation = useMutation({
    mutationFn: async ({ ids, natureza, categoria, subcategoria }: { ids: string[]; natureza: string; categoria: string; subcategoria: string }) => {
      return invokeAction("classificar_lote", { ids, natureza, categoria, subcategoria });
    },
    onSuccess: (data: { classificados?: number }) => {
      toast.success(`${data?.classificados || 0} lançamentos classificados`);
      invalidateAll(); setSelectedIds(new Set()); setClassificarLoteOpen(false);
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao classificar em lote"),
  });

  const cancelarLoteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      return invokeAction("cancelar_lote", { ids });
    },
    onSuccess: (data: { cancelados?: number }) => {
      toast.success(`${data?.cancelados || 0} lançamentos cancelados`);
      invalidateAll(); setSelectedIds(new Set());
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao cancelar em lote"),
  });

  const baixaManualMutation = useMutation({
    mutationFn: async ({ id, valor_pago, data_pagamento }: { id: string; valor_pago?: number; data_pagamento?: string }) => {
      return invokeAction("baixar", { id, valor_pago, data_pagamento });
    },
    onSuccess: () => { toast.success("Baixa manual realizada"); invalidateAll(); setBaixaManualLanc(null); },
    onError: (e: Error) => toast.error(e.message || "Erro na baixa manual"),
  });

  const openEditNatureza = (l: Lancamento) => {
    setEditLanc(l);
    setEditNatureza(l.natureza || "");
    setEditCategoria(l.categoria || "");
    setEditSubcategoria(l.subcategoria || "");
  };

  const openBaixaManual = (l: Lancamento) => {
    setBaixaManualLanc(l);
    setBaixaValorPago(String(l.valor));
    setBaixaDataPgto(format(new Date(), "yyyy-MM-dd"));
  };

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  // Selection — can select PREVISTO and CLASSIFICADO
  const selectablePagar = lancamentos.filter(l => l.tipo === "PAGAR" && ["PREVISTO", "CLASSIFICADO"].includes(l.status));
  const previstosPagar = selectablePagar; // alias for backward compat
  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === selectablePagar.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(selectablePagar.map(l => l.id)));
  };

  const hasPaymentData = (l: Lancamento) => {
    const d = l.dados_extras || {};
    return !!(d.btg_payment_type || d.linha_digitavel || d.pix_key);
  };

  // KPIs — separate rascunho vs validado
  const totalAgenda = lancamentos.filter(l => !["CANCELADO", "BAIXADO", "PREVISTO"].includes(l.status)).reduce((s, l) => s + l.valor, 0);
  const countRascunhos = lancamentos.filter(l => l.status === "PREVISTO").length;
  const totalPagar = lancamentos.filter(l => !["CANCELADO", "BAIXADO"].includes(l.status)).reduce((s, l) => s + l.valor, 0);
  const pendentesValidacao = lancamentos.filter(l => l.requer_validacao).length;
  const vencidos = lancamentos.filter(l => l.status === "PREVISTO" && new Date(l.data_vencimento) < new Date()).length;
  const borderosAbertos = borderos.filter(b => ["MONTAGEM", "APROVADO"].includes(b.status)).length;
  const naoClassificados = lancamentos.filter(l => l.status === "PREVISTO" && !l.subcategoria).length;
  const selectedTotal = lancamentos.filter(l => selectedIds.has(l.id)).reduce((s, l) => s + l.valor, 0);

  // Workflow step counts
  const countPrevistos = lancamentos.filter(l => l.status === "PREVISTO").length;
  const classificadosSemPgto = lancamentos.filter(l => l.status === "PREVISTO" && !!l.subcategoria && !hasPaymentData(l)).length;
  const countComPagamento = lancamentos.filter(l => l.status === "PREVISTO" && hasPaymentData(l)).length;
  const countBorderoMontagem = borderos.filter(b => b.status === "MONTAGEM").length;
  const countBorderoAprovado = borderos.filter(b => b.status === "APROVADO").length;
  const countBorderoEnviado = borderos.filter(b => b.status === "ENVIADO").length;

  // Active step = first step with pending items (priority-based)
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const getActiveStep = () => {
    if (naoClassificados > 0) return 2;
    if (classificadosSemPgto > 0) return 3;
    if (countComPagamento > 0) return 4;
    if (countBorderoMontagem > 0) return 4;
    if (countBorderoAprovado > 0) return 5;
    if (countBorderoEnviado > 0) return 6;
    return 1;
  };
  const activeStep = getActiveStep();
  const stepStatus = (step: number): "completed" | "active" | "pending" => {
    if (step < activeStep) return "completed";
    if (step === activeStep) return "active";
    return "pending";
  };

  const handleStepClick = (stepNumber: number) => {
    setSelectedStep(stepNumber);
    if (stepNumber <= 3) {
      setActiveTab("contas-pagar");
      // Apply status filter based on step
      if (stepNumber === 1) setFiltroStatus("todos");
      else if (stepNumber === 2) setFiltroStatus("PREVISTO"); // show unclassified
      else if (stepNumber === 3) setFiltroStatus("PREVISTO"); // show classified without payment
    } else {
      setActiveTab("borderos");
    }
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <ModuleHeader
          title="Hub Financeiro"
          subtitle="Contas a pagar — classificação, pagamento e controle centralizado"
          icon={<Landmark className="h-5 w-5" />}
          actions={
            <div className="flex flex-wrap gap-2">
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

        {/* Workflow Stepper */}
        <WorkflowStepper
          steps={[
            { number: 1, title: "Cadastrar", description: "Importe do ERP ou crie manualmente", status: stepStatus(1), count: countPrevistos },
            { number: 2, title: "Classificar", description: "Defina a conta do plano de contas", status: stepStatus(2), count: naoClassificados },
            { number: 3, title: "Preparar Pgto", description: "PIX, boleto ou TED", status: stepStatus(3), count: classificadosSemPgto },
            { number: 4, title: "Montar Borderô", description: "Agrupe em lote para aprovação", status: stepStatus(4), count: countComPagamento + countBorderoMontagem },
            { number: 5, title: "Aprovar e Enviar", description: "Admin transmite ao BTG", status: stepStatus(5), count: countBorderoAprovado },
            { number: 6, title: "Aguardar Banco", description: "Baixa confirmada pelo retorno", status: stepStatus(6), count: countBorderoEnviado },
          ]}
          onStepClick={handleStepClick}
          activeStepNumber={selectedStep ?? undefined}
        />

        {/* Novo Lançamento Dialog */}
        <NovoLancamentoDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          planoContas={planoContas}
          onCriar={(data) => criarMutation.mutate(data as Record<string, unknown>)}
          isPending={criarMutation.isPending}
        />

        {/* Dialog criar borderô */}
        <BaseDialog
          open={borderoDialogOpen}
          onOpenChange={setBorderoDialogOpen}
          title="Montar Borderô"
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
                <p className="text-sm font-medium text-primary">Agrupar {selectedIds.size} lançamento(s)</p>
                <p className="text-xs text-muted-foreground">
                  Total: <strong>{fmtCurrency(previstosPagar.filter(l => selectedIds.has(l.id)).reduce((s, l) => s + l.valor, 0))}</strong>
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Descrição do lote (opcional)</Label>
              <Input value={formBorderoDesc} onChange={e => setFormBorderoDesc(e.target.value)} placeholder="Ex: Fornecedores Janeiro" />
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
              <div className="flex gap-2 items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant={BORDERO_STATUS[borderoDetalhe.bordero.status]?.variant || "outline"}>
                    {BORDERO_STATUS[borderoDetalhe.bordero.status]?.label || borderoDetalhe.bordero.status}
                  </Badge>
                  <span className="text-sm font-medium">{fmtCurrency(borderoDetalhe.bordero.total_valor)}</span>
                  <span className="text-xs text-muted-foreground">({borderoDetalhe.bordero.qtd_lancamentos} lançamentos)</span>
                </div>
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Pessoa</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Pgto</TableHead>
                  <TableHead>Status</TableHead>
                  {borderoDetalhe?.bordero?.status === "MONTAGEM" && <TableHead className="w-[80px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(borderoDetalhe?.lancamentos || []).map((l: Lancamento) => {
                  const payType = l.dados_extras?.btg_payment_type;
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="text-sm">{l.descricao.toUpperCase()}</TableCell>
                      <TableCell className="text-sm">{l.pessoa_nome?.toUpperCase() || "—"}</TableCell>
                      <TableCell className="text-sm">{format(new Date(l.data_vencimento), "dd/MM/yy")}</TableCell>
                      <TableCell className="text-sm text-right">{fmtCurrency(l.valor)}</TableCell>
                      <TableCell>
                        {payType ? (
                          <Badge variant="outline" className="text-[10px]">{String(payType).replace("_", " ")}</Badge>
                        ) : (
                          <span className="text-xs text-destructive">⚠ Sem dados</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_CONFIG[l.status]?.variant || "outline"}>
                          {STATUS_CONFIG[l.status]?.label || l.status}
                        </Badge>
                      </TableCell>
                      {borderoDetalhe?.bordero?.status === "MONTAGEM" && (
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-destructive hover:text-destructive"
                            disabled={removerDoBorderoMutation.isPending}
                            onClick={() => removerDoBorderoMutation.mutate({
                              bordero_id: borderoDetalhe.bordero.id,
                              lancamento_ids: [l.id],
                            })}
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1" /> Remover
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </BaseDialog>

        {/* Preparar Pagamento Sheet */}
        <PrepararPagamentoSheet
          lancamento={prepPaymentLanc}
          onClose={() => setPrepPaymentLanc(null)}
          onSave={(id, dadosExtras) => prepararPagamentoMutation.mutate({ id, dadosExtras })}
          isPending={prepararPagamentoMutation.isPending}
        />

        {/* Dialog: Classificar */}
        <BaseDialog
          open={!!editLanc}
          onOpenChange={(open) => { if (!open) setEditLanc(null); }}
          title="Classificar Lançamento"
          footer={
            <>
              <Button variant="outline" onClick={() => setEditLanc(null)}>Cancelar</Button>
              <Button
                onClick={() => editLanc && editNaturezaMutation.mutate({ id: editLanc.id, natureza: editNatureza, categoria: editCategoria, subcategoria: editSubcategoria })}
                disabled={editNaturezaMutation.isPending || !editSubcategoria}
              >
                Salvar Classificação
              </Button>
            </>
          }
        >
          {editLanc && (
            <div className="space-y-4 py-2">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-sm font-medium">{editLanc.descricao.toUpperCase()}</p>
                <p className="text-xs text-muted-foreground">{editLanc.pessoa_nome?.toUpperCase() || "—"} — {fmtCurrency(editLanc.valor)}</p>
              </div>
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">
                  Selecione a <strong>conta</strong> do plano de contas. Natureza e categoria serão preenchidas automaticamente.
                </p>
              </div>
              <div className="space-y-1">
                <Label>Conta *</Label>
                <Select
                  value={editSubcategoria}
                  onValueChange={(val) => {
                    setEditSubcategoria(val);
                    const conta = planoContas.find(c => c.conta_descricao === val);
                    if (conta) { setEditNatureza(conta.grupo_dre); setEditCategoria(conta.categoria); }
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                  <SelectContent>
                    {planoContas.map(c => (
                      <SelectItem key={c.id} value={c.conta_descricao}>
                        {c.conta_descricao.toUpperCase()} ({c.conta_numero})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {editNatureza && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Natureza (DRE)</Label>
                    <div className="text-sm px-3 py-2 border rounded-md bg-muted/30 text-muted-foreground">
                      {editNatureza.replace(/_/g, " ")}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Categoria</Label>
                    <div className="text-sm px-3 py-2 border rounded-md bg-muted/30 text-muted-foreground">
                      {editCategoria.replace(/_/g, " ")}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </BaseDialog>

        {/* Dialog: Baixa Manual */}
        <BaseDialog
          open={!!baixaManualLanc}
          onOpenChange={(open) => { if (!open) setBaixaManualLanc(null); }}
          title="Baixa Manual"
          footer={
            <>
              <Button variant="outline" onClick={() => setBaixaManualLanc(null)}>Cancelar</Button>
              <Button
                onClick={() => baixaManualLanc && baixaManualMutation.mutate({
                  id: baixaManualLanc.id,
                  valor_pago: Number(baixaValorPago) || undefined,
                  data_pagamento: baixaDataPgto || undefined,
                })}
                disabled={baixaManualMutation.isPending}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" /> Confirmar Baixa
              </Button>
            </>
          }
        >
          {baixaManualLanc && (
            <div className="space-y-4 py-2">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-800">
                  <strong>Atenção:</strong> A baixa manual registra o pagamento sem borderô/banco.
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-sm font-medium">{baixaManualLanc.descricao.toUpperCase()}</p>
                <p className="text-xs text-muted-foreground">{baixaManualLanc.pessoa_nome?.toUpperCase() || "—"}</p>
                <p className="text-lg font-bold mt-1">{fmtCurrency(baixaManualLanc.valor)}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Valor pago (R$)</Label>
                  <Input type="number" step="0.01" value={baixaValorPago} onChange={e => setBaixaValorPago(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Data do pagamento</Label>
                  <Input type="date" value={baixaDataPgto} onChange={e => setBaixaDataPgto(e.target.value)} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                💡 Para reverter, use "Reabrir" no menu de ações (⋯) da tabela.
              </p>
            </div>
          )}
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
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Campo Data</label>
            <Select value={filtroCampoData} onValueChange={setFiltroCampoData}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="VENCIMENTO">Vencimento</SelectItem>
                <SelectItem value="EMISSAO">Emissão</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">De</label>
            <Input type="date" className="w-[150px] h-9" value={filtroDataInicio} onChange={e => setFiltroDataInicio(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Até</label>
            <Input type="date" className="w-[150px] h-9" value={filtroDataFim} onChange={e => setFiltroDataFim(e.target.value)} />
          </div>
          {(filtroDataInicio || filtroDataFim) && (
            <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => { setFiltroDataInicio(""); setFiltroDataFim(""); }}>
              <XCircle className="h-3.5 w-3.5 mr-1" /> Limpar datas
            </Button>
          )}
        </div>

        {/* Quick filters */}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => {
            setFiltroCampoData("VENCIMENTO"); setFiltroDataInicio(format(new Date(), "yyyy-MM-dd")); setFiltroDataFim(format(new Date(), "yyyy-MM-dd"));
          }}>Hoje</Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => {
            const today = new Date(); const next = new Date(today); next.setDate(next.getDate() + 7);
            setFiltroCampoData("VENCIMENTO"); setFiltroDataInicio(format(today, "yyyy-MM-dd")); setFiltroDataFim(format(next, "yyyy-MM-dd"));
          }}>Próximos 7 dias</Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => {
            const now = new Date();
            setFiltroCampoData("VENCIMENTO"); setFiltroDataInicio(format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd")); setFiltroDataFim(format(new Date(now.getFullYear(), now.getMonth() + 1, 0), "yyyy-MM-dd"));
          }}>Mês atual</Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => {
            setFiltroCampoData("VENCIMENTO"); setFiltroDataInicio(""); setFiltroDataFim(format(new Date(new Date().setDate(new Date().getDate() - 1)), "yyyy-MM-dd")); setFiltroStatus("PREVISTO");
          }}>Vencidos</Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <ArrowUpCircle className="h-4 w-4 text-destructive" /> Total a Pagar
              </CardTitle>
            </CardHeader>
            <CardContent><p className="text-2xl font-bold">{fmtCurrency(totalPagar)}</p></CardContent>
          </Card>
          <Card className="border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" /> Agenda Oficial
              </CardTitle>
            </CardHeader>
            <CardContent><p className="text-2xl font-bold text-primary">{fmtCurrency(totalAgenda)}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Rascunhos
              </CardTitle>
            </CardHeader>
            <CardContent><p className="text-2xl font-bold">{countRascunhos}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" /> Vencidos
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
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setSelectedIds(new Set()); }}>
          <TabsList>
            <TabsTrigger value="contas-pagar">Contas a Pagar</TabsTrigger>
            <TabsTrigger value="agenda">
              Agenda
              {totalAgenda > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5">{fmtCurrency(totalAgenda)}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="borderos">
              Borderôs
              {borderosAbertos > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5">{borderosAbertos}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="contas-receber" disabled>
              Contas a Receber <span className="ml-1 text-[10px] text-muted-foreground">(em breve)</span>
            </TabsTrigger>
          </TabsList>

          {/* Contas a Pagar */}
          <TabsContent value="contas-pagar">
            <ContasPagarTable
              lancamentos={lancamentos}
              isLoading={isLoading}
              selectedIds={selectedIds}
              isAdmin={!!authIsAdmin}
              onToggleSelect={toggleSelect}
              onToggleSelectAll={toggleSelectAll}
              onClassificar={openEditNatureza}
              onPrepararPagamento={(l) => setPrepPaymentLanc(l)}
              onBaixaManual={openBaixaManual}
              onCancelar={(id) => cancelarMutation.mutate(id)}
              onReabrir={(id) => reabrirMutation.mutate(id)}
              onRemoverDoBordero={(l) => {
                if (l.bordero_id) removerDoBorderoMutation.mutate({ bordero_id: l.bordero_id, lancamento_ids: [l.id] });
              }}
              isCancelando={cancelarMutation.isPending}
              isReabrindo={reabrirMutation.isPending}
              isRemovendoDoBordero={removerDoBorderoMutation.isPending}
              stepFilter={selectedStep}
            />
          </TabsContent>

          {/* Borderôs */}
          <TabsContent value="borderos">
            {borderos.some(b => b.status === "MONTAGEM") && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-start gap-2">
                <FileCheck className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-800">
                  <strong>Revise e aprove</strong> os borderôs em montagem para liberar o envio ao banco.
                </p>
              </div>
            )}
            <Card>
              <CardHeader className="pb-2">
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
                        <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum borderô. Selecione lançamentos na aba "Contas a Pagar" e clique em "Criar Borderô".</TableCell></TableRow>
                      ) : borderos.map(b => {
                        const bs = BORDERO_STATUS[b.status] || { label: b.status, variant: "outline" as const };
                        return (
                          <TableRow key={b.id}>
                            <TableCell className="text-sm">
                              <button className="text-primary hover:underline" onClick={() => setBorderoDetalheId(b.id)}>
                                {b.descricao || `BORDERÔ ${b.id.slice(0, 8).toUpperCase()}`}
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

          {/* Agenda Oficial */}
          <TabsContent value="agenda">
            <AgendaOficialTab
              lancamentos={lancamentos}
              isLoading={isLoading}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onToggleSelectAll={(ids) => {
                const next = new Set(selectedIds);
                const allSelected = ids.every(id => next.has(id));
                if (allSelected) { ids.forEach(id => next.delete(id)); }
                else { ids.forEach(id => next.add(id)); }
                setSelectedIds(next);
              }}
              onPrepararPagamento={(l) => setPrepPaymentLanc(l as Lancamento)}
            />
          </TabsContent>

          <TabsContent value="contas-receber">
            <div className="text-center py-12 text-muted-foreground">
              <ArrowDownCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Contas a Receber — em desenvolvimento</p>
            </div>
          </TabsContent>
        </Tabs>

        {/* Classificar em Lote Dialog */}
        <ClassificarLoteDialog
          open={classificarLoteOpen}
          onOpenChange={setClassificarLoteOpen}
          planoContas={planoContas}
          selectedCount={selectedIds.size}
          selectedTotal={selectedTotal}
          onConfirm={(natureza, categoria, subcategoria) => {
            classificarLoteMutation.mutate({ ids: Array.from(selectedIds), natureza, categoria, subcategoria });
          }}
          isPending={classificarLoteMutation.isPending}
        />

        {/* Floating action bar */}
        {selectedIds.size > 0 && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-lg border bg-background/95 backdrop-blur-sm shadow-lg px-5 py-3 animate-in slide-in-from-bottom-2 duration-200">
            <span className="text-sm text-muted-foreground font-medium">
              {selectedIds.size} selecionado(s) — {fmtCurrency(selectedTotal)}
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="default" onClick={() => setClassificarLoteOpen(true)}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Classificar
              </Button>
              <Button size="sm" variant="outline" onClick={() => setBorderoDialogOpen(true)}>
                <Package className="h-4 w-4 mr-1" /> Criar Borderô
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  if (confirm(`Cancelar ${selectedIds.size} lançamento(s)?`)) {
                    cancelarLoteMutation.mutate(Array.from(selectedIds));
                  }
                }}
                disabled={cancelarLoteMutation.isPending}
              >
                <XCircle className="h-4 w-4 mr-1" /> Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
