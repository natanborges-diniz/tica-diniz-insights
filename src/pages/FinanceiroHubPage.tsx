import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Landmark, Plus, CheckCircle2, XCircle,
  ArrowDownCircle, ArrowUpCircle, AlertTriangle,
  Package, FileCheck, Download, Eye, Layers, Trash2, Receipt, RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresas } from "@/hooks/useEmpresas";
import { useDefaultEmpresa } from "@/hooks/useDefaultEmpresa";
import { useAuth } from "@/contexts/AuthContext";
import { ModuleHeader } from "@/components/system/ModuleHeader";
import { usePendenciasFinanceiro } from "@/hooks/usePendenciasFinanceiro";
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
import { BorderoBloqueioDialog, type BorderoBloqueioPayload } from "@/components/financeiro-hub/BorderoBloqueioDialog";

import { ContasPagarTable } from "@/components/financeiro-hub/ContasPagarTable";
import { SearchField } from "@/components/system/SearchField";
import { filtrarPorBusca } from "@/lib/busca";
import { NovoLancamentoDialog } from "@/components/financeiro-hub/NovoLancamentoDialog";

import { ClassificarLoteDialog } from "@/components/financeiro-hub/ClassificarLoteDialog";
import { agoraSP } from "@/lib/datetime";
import { estadoBordero, resumirComposicao, falhouNoBanco, type ComposicaoBordero } from "../../supabase/functions/_shared/borderoEstado";

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
  /** Lastro de rubrica: a competência é campo próprio, independente do vencimento. */
  rubrica_id?: string | null;
  /** Selo de governança, calculado na listagem pelo backend. */
  selo?: string | null;
  selo_motivo?: string | null;
  pode_bordero?: boolean;
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
  updated_at: string | null;
  data_pagamento: string | null;
  /** Contagem de pagos/recusados/pendentes vinda do listar_borderos. */
  composicao?: ComposicaoBordero | null;
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  PREVISTO: { label: "Previsto", variant: "secondary" },
  CLASSIFICADO: { label: "Em preparo", variant: "secondary" },
  BORDERO: { label: "Borderô", variant: "outline" },
  AUTORIZADO: { label: "Autorizado", variant: "default" },
  PROCESSANDO: { label: "Processando", variant: "outline" },
  BAIXADO: { label: "Baixado", variant: "default" },
  CANCELADO: { label: "Cancelado", variant: "destructive" },
  CONCILIADO_CARTAO: { label: "Conciliado", variant: "default" },
};

/**
 * O filtro de status fala a língua da operação, não a do banco de dados.
 *
 * "Em preparo" não é um status gravado: o título recém-importado fica PREVISTO,
 * o classificado fica CLASSIFICADO e o unificado fica AGRUPADO. Filtrar por um
 * único valor devolvia lista vazia justamente na etapa mais usada.
 */
const GRUPOS_STATUS: Record<string, { label: string; status: string[] }> = {
  EM_PREPARO: { label: "Em preparo", status: ["PREVISTO", "CLASSIFICADO", "AGRUPADO"] },
  BORDERO: { label: "Em borderô", status: ["BORDERO"] },
  AUTORIZADO: { label: "Autorizado / processando", status: ["AUTORIZADO", "PROCESSANDO"] },
  BAIXADO: { label: "Pagos", status: ["BAIXADO", "CONCILIADO_CARTAO"] },
  CANCELADO: { label: "Cancelados", status: ["CANCELADO"] },
};

// Mantido só para o detalhe do borderô, onde o status gravado ainda é a
// referência. Na lista quem manda é estadoBordero(), que lê a composição dos
// itens — "ENVIADO" cobria situações opostas demais para virar um badge.
const BORDERO_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  MONTAGEM: { label: "Em Montagem", variant: "secondary" },
  APROVADO: { label: "Aprovado", variant: "default" },
  ENVIADO: { label: "Enviado BTG", variant: "outline" },
  PROCESSADO: { label: "Processado", variant: "default" },
  PROCESSADO_PARCIAL: { label: "Processado c/ Rejeições", variant: "destructive" },
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
  const [busca, setBusca] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [borderoDialogOpen, setBorderoDialogOpen] = useState(false);
  const [borderoDetalheId, setBorderoDetalheId] = useState<string | null>(null);
  /** Data em edição no detalhe do borderô — vazio = mostrando a atual. */
  const [novaDataBordero, setNovaDataBordero] = useState("");
  /** Confirmação de que o lote foi cancelado/expirou no BTG, antes de refazer. */
  const [confirmouBanco, setConfirmouBanco] = useState(false);
  const [motivoRefazer, setMotivoRefazer] = useState("");
  const [borderoBloqueio, setBorderoBloqueio] = useState<BorderoBloqueioPayload | null>(null);

  const [activeTab, setActiveTab] = useState("contas-pagar");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [prepPaymentLanc, setPrepPaymentLanc] = useState<Lancamento | null>(null);
  const [editLanc, setEditLanc] = useState<Lancamento | null>(null);
  const [baixaManualLanc, setBaixaManualLanc] = useState<Lancamento | null>(null);
  const [baixaValorPago, setBaixaValorPago] = useState("");
  const [baixaDataPgto, setBaixaDataPgto] = useState("");
  const [formBorderoDesc, setFormBorderoDesc] = useState("");
  // Prática da casa: pagamentos executados na segunda → default = próxima segunda
  const proximaSegundaStr = () => {
    const d = agoraSP();
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7));
    return format(d, "yyyy-MM-dd");
  };
  const [formBorderoDataPg, setFormBorderoDataPg] = useState<string>(proximaSegundaStr);
  // Prática da casa é pagar tudo na segunda — por isso DATA_UNICA é o default.
  const [formBorderoModoData, setFormBorderoModoData] = useState<"DATA_UNICA" | "VENCIMENTO">("DATA_UNICA");
  const [unificarDialogOpen, setUnificarDialogOpen] = useState(false);
  const [formUnificarDesc, setFormUnificarDesc] = useState("");
  // Quando o boleto já existe como lançamento (veio do DDA), ele é o pagador e
  // os demais viram componentes. Vazio = criamos um pagador a partir da soma.
  const [formUnificarPagador, setFormUnificarPagador] = useState<string>("");
  const [classificarLoteOpen, setClassificarLoteOpen] = useState(false);

  // Edit classification state
  const [editNatureza, setEditNatureza] = useState("");
  const [editValor, setEditValor] = useState("");
  const [editVencimento, setEditVencimento] = useState("");
  const [editMotivoReprog, setEditMotivoReprog] = useState("");
  const [comprovante, setComprovante] = useState<{ url: string; nome: string } | null>(null);
  const [liberarBorderoId, setLiberarBorderoId] = useState<string | null>(null);
  // Escopo da liberação por item: a decisão do admin pode virar política em vez
  // de morrer neste borderô. Default UNICA — o mais conservador.
  const [escoposLiberacao, setEscoposLiberacao] = useState<Record<string, { escopo: string; quantidade: number }>>({});
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
      // Grupo com um único status vai ao servidor; grupo com vários é recortado
      // na tela, para não multiplicar requisições.
      const grupo = GRUPOS_STATUS[filtroStatus]?.status;
      if (grupo?.length === 1) params.status = grupo[0];
      if (filtroDataInicio) params.data_inicio = filtroDataInicio;
      if (filtroDataFim) params.data_fim = filtroDataFim;
      if (filtroCampoData) params.campo_data = filtroCampoData;
      return invokeAction("listar", params);
    },
  });

  // Pagos tem consulta própria, pelo eixo da DATA DE PAGAMENTO.
  //
  // A listagem principal filtra por vencimento, e isso escondia o pagamento
  // feito hoje de um boleto que vence semana que vem — exatamente o caso do
  // borderô de R$ 15,96 (pago 03/08, vencimento 07/08). Quem procura
  // comprovante pensa em quando saiu da conta.
  const { data: pagos = [] } = useQuery<Lancamento[]>({
    queryKey: ["lancamentos-pagos", codEmpresa, filtroDataInicio, filtroDataFim],
    queryFn: async () => {
      const params: Record<string, unknown> = {
        cod_empresa: codEmpresa,
        tipo: "PAGAR",
        status: "BAIXADO",
        campo_data: "PAGAMENTO",
        limit: 500,
      };
      if (filtroDataInicio) params.data_inicio = filtroDataInicio;
      if (filtroDataFim) params.data_fim = filtroDataFim;
      const r = await invokeAction("listar", params) as Lancamento[];
      return [...r].sort((a, b) =>
        String(b.data_pagamento ?? "").localeCompare(String(a.data_pagamento ?? "")));
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

  // ── Pesquisa livre (descrição, fornecedor, valor) ──
  //
  // Filtro de tela, não de servidor: a listagem já vem por período e status, e o
  // termo apenas recorta o que está à vista. Assim continua instantâneo e não
  // dispara consulta a cada letra digitada.
  const camposLancamento = (l: Lancamento) => [
    l.descricao, l.pessoa_nome, l.pessoa_documento, l.valor, l.valor_pago,
    l.natureza, l.categoria, l.subcategoria, l.forma_pagamento, l.origem,
  ];
  const lancamentosFiltrados = filtrarPorBusca(lancamentos, busca, camposLancamento);
  const pagosFiltrados = filtrarPorBusca(pagos, busca, camposLancamento);
  const borderosFiltrados = filtrarPorBusca(borderos, busca, (b) => [
    b.descricao, b.total_valor, b.status, b.criado_por, b.aprovado_por,
  ]);

  // Diagnóstico da trava: por que não sai, o que resolve, e se ESTE usuário
  // pode liberar. Carregado só quando o diálogo abre.
  const { data: diagnostico } = useQuery<{
    total_itens: number; travados: number; valor_travado: number;
    pode_liberar: boolean; impedimento: string | null;
    itens: Array<{ id: string; descricao: string; pessoa_nome: string | null; valor: number; selo: string; motivo: string; trava: boolean; como_resolver: string | null }>;
  }>({
    queryKey: ["bordero-diagnostico", liberarBorderoId],
    queryFn: () => invokeAction("diagnostico_bordero", { bordero_id: liberarBorderoId }),
    enabled: !!liberarBorderoId,
  });

  const { data: borderoDetalhe } = useQuery({
    queryKey: ["bordero-detalhe", borderoDetalheId],
    queryFn: () => invokeAction("detalhe_bordero", { bordero_id: borderoDetalheId }),
    enabled: !!borderoDetalheId,
  });

  // ── Mutations ──
  // Chegando de "Pagamentos parados" com um borderô para resolver: a página
  // aponta, o detalhe do borderô é onde a confirmação e os campos moram.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const id = searchParams.get("bordero");
    const aba = searchParams.get("tab");
    const buscaUrl = searchParams.get("busca");
    if (!id && !aba && !buscaUrl) return;
    if (id) {
      setActiveTab("borderos");
      setBorderoDetalheId(id);
    } else if (aba) {
      setActiveTab(aba);
    }
    // Título solto vindo de "Pagamentos parados": já chega filtrado, senão o
    // operador aterrissa numa lista de centenas e não acha a linha.
    if (buscaUrl) setBusca(buscaUrl);
    // Limpa os parâmetros: recarregar a página não deve reabrir o mesmo diálogo.
    searchParams.delete("bordero");
    searchParams.delete("tab");
    searchParams.delete("busca");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);


  // Contador do aviso — mesma consulta da página de pendências.
  const { data: pendenciasData } = usePendenciasFinanceiro(invokeAction);
  const qtdPendencias = pendenciasData?.pendencias.length ?? 0;
  const pendenciasGraves = pendenciasData?.resumo.alta ?? 0;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["lancamentos"] });
    queryClient.invalidateQueries({ queryKey: ["borderos"] });
    queryClient.invalidateQueries({ queryKey: ["bordero-detalhe"] });
    // Enviar, aprovar ou cancelar muda o que está parado — o painel de
    // pendências tem de acompanhar, senão mostra um retrato velho.
    queryClient.invalidateQueries({ queryKey: ["painel-pendencias"] });
  };

  const criarMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      return invokeAction("criar", { cod_empresa: codEmpresa, ...data });
    },
    onSuccess: () => { toast.success("Lançamento criado"); invalidateAll(); setDialogOpen(false); },
    onError: () => toast.error("Erro ao criar lançamento"),
  });

  // P2 — o import legado (importar_erp_auto, chave frouxa por documento) foi
  // aposentado; o botão agora dispara o sync-ledger (chave dura por parcela),
  // o mesmo que roda sozinho a cada 30 min.
  const importErpMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("sync-ledger", {
        body: { mode: "full", codEmpresa: String(codEmpresa) },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      return data as { inseridos?: number; baixados_erp?: number; atualizados?: number; dda_vinculados?: number };
    },
    onSuccess: (data) => {
      toast.success(`Sync ERP: ${data?.inseridos || 0} novos, ${data?.baixados_erp || 0} baixados pelo ERP, ${data?.atualizados || 0} atualizados, ${data?.dda_vinculados || 0} DDA vinculados`);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao sincronizar com o ERP"),
  });

  const cancelarMutation = useMutation({
    mutationFn: (id: string) => invokeAction("cancelar", { id }),
    onSuccess: () => { toast.success("Lançamento cancelado"); invalidateAll(); },
    onError: () => toast.error("Erro ao cancelar"),
  });

  const unificarMutation = useMutation({
    mutationFn: () => invokeAction("agrupar_lancamentos", {
      lancamento_ids: Array.from(selectedIds),
      pagador_id: formUnificarPagador || null,
      descricao: formUnificarDesc || null,
    }),
    onSuccess: (r: { componentes?: number }) => {
      toast.success(`Pagamento unificado criado com ${r?.componentes ?? 0} componentes`);
      setUnificarDialogOpen(false);
      setFormUnificarDesc("");
      setFormUnificarPagador("");
      setSelectedIds(new Set());
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Aprova o borderô (assumindo os itens sinalizados) e envia na sequência. */
  const aprovarEEnviarMutation = useMutation({
    mutationFn: async (borderoId: string) => {
      await invokeAction("aprovar_bordero", {
        bordero_id: borderoId,
        liberacoes: Object.entries(escoposLiberacao)
          .filter(([, v]) => v.escopo !== "UNICA")
          .map(([lancamento_id, v]) => ({ lancamento_id, escopo: v.escopo, quantidade: v.quantidade })),
      });
      return invokeAction("enviar_bordero_btg", { bordero_id: borderoId });
    },
    onSuccess: (r: { ok?: boolean; error?: string }) => {
      if (r?.ok === false) { toast.error(r.error || "O banco recusou o envio"); return; }
      toast.success("Borderô liberado e enviado ao BTG");
      setLiberarBorderoId(null);
      setEscoposLiberacao({});
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const criarBorderoMutation = useMutation({
    mutationFn: () => invokeAction("criar_bordero", {
      cod_empresa: codEmpresa,
      descricao: formBorderoDesc || null,
      data_pagamento: formBorderoDataPg || null,
      modo_data: formBorderoModoData,
      lancamento_ids: Array.from(selectedIds),
    }),
    onSuccess: () => {
      toast.success("Borderô criado — 100% no lastro envia direto; itens fora da faixa passam pela Mesa");
      invalidateAll(); setBorderoDialogOpen(false); setSelectedIds(new Set()); setFormBorderoDesc(""); setFormBorderoDataPg(proximaSegundaStr()); setActiveTab("borderos");
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao criar borderô"),
  });


  // A recusa do banco aparecia só num toast, que morre em segundos e não diz de
  // qual borderô era. Guardamos por id para a linha continuar mostrando o motivo.
  const [erroEnvio, setErroEnvio] = useState<Record<string, string>>({});

  const enviarBorderoMutation = useMutation({
    mutationFn: (id: string) => invokeAction("enviar_bordero_btg", { bordero_id: id }),
    onSuccess: (data: { sandbox?: boolean; ok?: boolean; error?: string; code?: string } & Partial<BorderoBloqueioPayload>, id: string) => {
      // Bloqueio de governança: em vez de um toast genérico, abrimos o painel com
      // item, motivo e ação — e o atalho que leva à Mesa já filtrada nesse borderô.
      if (data?.code === "MESA_REQUIRED" && data.bordero_id) {
        setBorderoBloqueio({
          bordero_id: data.bordero_id,
          cod_empresa: data.cod_empresa ?? null,
          bloqueios: data.bloqueios ?? [],
          qtd_total: data.qtd_total,
          qtd_bloqueados: data.qtd_bloqueados,
          valor_bloqueado: data.valor_bloqueado,
        });
        invalidateAll();
        return;
      }
      if (data?.ok === false) {
        const msg = data.error || "O BTG não aceitou o pagamento. Confira o extrato antes de tentar novamente.";
        setErroEnvio(prev => ({ ...prev, [id]: msg }));
        toast.error(msg, { duration: 12000 });
        invalidateAll();
        return;
      }

      setErroEnvio(prev => { const n = { ...prev }; delete n[id]; return n; });
      toast.success(data?.sandbox ? "Enviado ao BTG (sandbox)" : "Enviado ao BTG — aguarde processamento");
      invalidateAll();
    },
    onError: (e: Error, id: string) => {
      const msg = e.message || "Erro ao enviar";
      setErroEnvio(prev => ({ ...prev, [id]: msg }));
      toast.error(msg, { duration: 12000 });
    },
  });


  const confirmarProcessamentoMutation = useMutation({
    mutationFn: (id: string) => invokeAction("confirmar_processamento", { bordero_id: id }),
    onSuccess: (data: { baixados?: number }) => {
      toast.success(`✓ ${data?.baixados || 0} lançamentos baixados`); invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao confirmar"),
  });

  // A data do borderô era decidida na criação e virava pedra: quem errasse
  // cancelava o borderô inteiro e remontava. Com folha de 30 pessoas, é refazer
  // tudo por causa de um campo.
  const editarBorderoMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: string }) =>
      invokeAction("editar_bordero", { bordero_id: id, data_pagamento: data }),
    onSuccess: (r: { titulos_atualizados?: number }) => {
      toast.success(
        `Data do borderô alterada` +
        ((r?.titulos_atualizados ?? 0) > 0 ? ` — ${r.titulos_atualizados} título(s) acompanharam` : ""),
      );
      setNovaDataBordero("");
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ["bordero-detalhe"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // O item recusado voltava como AUTORIZADO preso ao borderô antigo, e criar
  // borderô só aceita PREVISTO/CLASSIFICADO: o sistema mandava reenviar e não
  // deixava. Aqui ele é solto para entrar num borderô novo — nunca no mesmo,
  // que já tem lote no banco com itens pagos.
  const devolverPreparoMutation = useMutation({
    mutationFn: (alvo: string | { lancamento_ids: string[] }) =>
      typeof alvo === "string"
        ? invokeAction("devolver_para_preparo", { bordero_id: alvo })
        : invokeAction("devolver_para_preparo", { lancamento_ids: alvo.lancamento_ids }),
    onSuccess: (r: {
      ok?: boolean; devolvidos?: number; mensagem?: string; error?: string;
      bloqueados?: Array<{ descricao: string; explicacao?: string }>;
    }) => {
      if (r?.ok === false) {
        toast.error(r.error || "Nenhum pagamento em condição de reenvio");
        (r.bloqueados || []).slice(0, 3).forEach((b) =>
          toast.info(`${b.descricao}: ${b.explicacao ?? ""}`));
        return;
      }
      toast.success(r?.mensagem || `${r?.devolvidos ?? 0} título(s) devolvidos ao preparo`);
      (r?.bloqueados || []).slice(0, 3).forEach((b) =>
        toast.info(`${b.descricao}: ${b.explicacao ?? ""}`));
      setBorderoDetalheId(null);
      setActiveTab("contas-pagar");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Borderô cujos títulos saíram por fora — débito automático, ou alguém pagou
  // no app. Encerrar fecha a casca sem tocar nos títulos, que já estão baixados
  // com o valor e a data reais do ERP.
  // Lote enviado que o master não autorizou e cuja data venceu. A data não pode
  // mais ser mudada (está no lote do BTG) e os títulos não voltam sozinhos.
  // Refazer devolve os que continuam em trânsito e cancela o borderô, para
  // montar outro com data nova.
  const refazerBorderoMutation = useMutation({
    mutationFn: (borderoId: string) => invokeAction("refazer_bordero", {
      bordero_id: borderoId,
      confirmado_no_banco: confirmouBanco,
      motivo: motivoRefazer.trim(),
    }),
    onSuccess: (r: { ok?: boolean; error?: string; mensagem?: string }) => {
      if (r?.ok === false) {
        toast.error(r.error || "Não foi possível refazer o borderô");
        return;
      }
      toast.success(r?.mensagem || "Títulos devolvidos ao preparo");
      setBorderoDetalheId(null);
      setConfirmouBanco(false);
      setMotivoRefazer("");
      setActiveTab("contas-pagar");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const encerrarBorderoMutation = useMutation({
    mutationFn: (borderoId: string) => invokeAction("encerrar_bordero", { bordero_id: borderoId }),
    onSuccess: (r: { ok?: boolean; error?: string; mensagem?: string; pendentes?: Array<{ descricao: string }> }) => {
      if (r?.ok === false) {
        toast.error(r.error || "Não foi possível encerrar o borderô");
        return;
      }
      toast.success(r?.mensagem || "Borderô encerrado");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelarBorderoMutation = useMutation({
    mutationFn: (id: string) => invokeAction("cancelar_bordero", { bordero_id: id }),
    onSuccess: (data: { devolvidos?: number }) => {
      const n = data?.devolvidos ?? 0;
      toast.success(
        n > 0
          ? `Borderô cancelado — ${n} título${n > 1 ? "s" : ""} voltou para "Em Preparo" (classificação e dados de pagamento mantidos)`
          : "Borderô cancelado"
      );
      invalidateAll();
      setActiveTab("pagar");
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao cancelar"),
  });

  const removerDoBorderoMutation = useMutation({
    mutationFn: ({ bordero_id, lancamento_ids }: { bordero_id: string; lancamento_ids: string[] }) =>
      invokeAction("remover_do_bordero", { bordero_id, lancamento_ids }),
    onSuccess: (data: { reaprovar?: boolean }) => {
      toast.success(
        data?.reaprovar
          ? 'Título desautorizado e devolvido a "Em Preparo" — o borderô voltou para montagem e precisa ser aprovado de novo'
          : 'Título desautorizado e devolvido a "Em Preparo"'
      );
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao desautorizar título"),
  });

  // Saída para títulos travados em PROCESSANDO por envio que morreu antes de
  // fechar o lote. O backend recusa se houver lote de verdade no BTG.
  const liberarProcessandoMutation = useMutation({
    mutationFn: (lancamento_ids: string[]) =>
      invokeAction("liberar_processando_orfao", { lancamento_ids }),
    onSuccess: (data: { liberados?: number; bloqueados?: { descricao: string; motivo: string }[] }) => {
      if (data?.liberados) {
        toast.success(`${data.liberados} título(s) destravado(s) e de volta em "Em Preparo"`);
      }
      for (const b of (data?.bloqueados || [])) {
        toast.error(`${b.descricao}: ${b.motivo}`, { duration: 8000 });
      }
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao destravar título"),
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
    mutationFn: async (
      { id, ...campos }: {
        id: string; natureza: string; categoria: string; subcategoria: string;
        valor?: number; data_vencimento?: string;
      },
    ) => {
      return invokeAction("editar", { id, ...campos });
    },
    onSuccess: () => { toast.success("Lançamento atualizado"); invalidateAll(); setEditLanc(null); },
    onError: (e: Error) => toast.error(e.message || "Erro ao salvar"),
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

  /**
   * Comprovante: buscado no BTG na hora e aberto numa aba. Nada é gravado —
   * nem no banco de dados, nem em storage. O PDF é do banco; o que guardamos é
   * só o identificador do pagamento, que já vive em dados_extras.
   */
  const comprovanteMutation = useMutation({
    mutationFn: async (l: Lancamento) => {
      const { data, error } = await supabase.functions.invoke("btg-pagamentos", {
        body: {
          action: "comprovante",
          cod_empresa: l.cod_empresa,
          // Sem o id guardado, o backend localiza pelo lote + valor.
          payment_id: (l.dados_extras || {}).btg_payment_id ?? null,
          batch_id: (l.dados_extras || {}).btg_batch_id ?? null,
          valor: l.valor_pago ?? l.valor,
        },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      return data as { pdf_base64: string };
    },
    // Abre num diálogo, não em aba nova: `window.open` de URL blob: é bloqueado
    // por bloqueadores de anúncio (ERR_BLOCKED_BY_CLIENT), e o usuário via uma
    // tela de erro achando que o comprovante não existia.
    onSuccess: (data, l) => {
      const bin = atob(data.pdf_base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const nome = `comprovante-${(l.pessoa_nome || "pagamento")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${l.data_pagamento || ""}.pdf`;
      setComprovante({ url, nome });
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao obter comprovante"),
  });

  /**
   * Força a consulta de retorno do banco, sem esperar o cron de 30 minutos.
   *
   * Serve para quando o pagamento acabou de ser aprovado no app e você quer ver
   * a baixa entrar agora. É idempotente: só transiciona o que o BTG confirmar,
   * então rodar duas vezes não repete efeito.
   */
  const atualizarRetornoMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("btg-poll-status", {
        body: { action: "executar" },
      });
      if (error) throw error;
      return data as { borderos?: { baixados?: number; processados?: number; rejeitados?: number } };
    },
    onSuccess: (data) => {
      const b = data?.borderos || {};
      const baixados = Number(b.baixados ?? 0);
      toast.success(
        baixados > 0
          ? `${baixados} lançamento(s) baixado(s) pelo retorno do banco`
          : "Consulta feita — o banco ainda não confirmou nada novo",
      );
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao consultar o banco"),
  });

  /**
   * Transforma um pagamento já preparado em rubrica recorrente.
   *
   * Nasce em rascunho e NÃO vincula o lançamento atual: ele já tem lastro do
   * ERP, e apontar para uma rubrica não aprovada o rebaixaria para "sem lastro",
   * travando um borderô que estava bom.
   */
  const virarRubricaMutation = useMutation({
    mutationFn: (l: Lancamento) => invokeAction("criar_rubrica_de_lancamento", { lancamento_id: l.id }),
    onSuccess: (r: { herdou_forma_pagamento?: boolean }) => {
      toast.success(
        r?.herdou_forma_pagamento
          ? "Rubrica criada em rascunho, já com a forma de pagamento — outro admin precisa aprovar"
          : "Rubrica criada em rascunho — outro admin precisa aprovar",
      );
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reverterCancelamentoMutation = useMutation({
    mutationFn: async (ids: string[]) => invokeAction("reverter_cancelamento", { ids }),
    onSuccess: (data: { revertidos?: number }) => {
      toast.success(`${data?.revertidos || 0} lançamento(s) restaurado(s)`);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao reverter"),
  });

  const cancelarLoteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const r = await invokeAction("cancelar_lote", { ids });
      return { ...(r as Record<string, unknown>), ids };
    },
    // Desfazer no próprio toast: cancelamento é reversível e o erro de clique
    // já aconteceu uma vez (21 títulos com boleto anexado).
    onSuccess: (data: { cancelados?: number; ids?: string[] }) => {
      toast.success(`${data?.cancelados || 0} lançamentos cancelados`, {
        duration: 15000,
        action: {
          label: "Desfazer",
          onClick: () => reverterCancelamentoMutation.mutate(data.ids || []),
        },
      });
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
    setEditValor(String(l.valor));
    setEditVencimento(l.data_vencimento || "");
    setEditMotivoReprog("");
    setEditMotivoReprog("");
  };

  const openBaixaManual = (l: Lancamento) => {
    setBaixaManualLanc(l);
    setBaixaValorPago(String(l.valor));
    setBaixaDataPgto(format(new Date(), "yyyy-MM-dd"));
  };

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  // Valor e vencimento só mudam enquanto o lançamento não foi ao banco.
  const podeEditarValor = (l: Lancamento) =>
    ["PREVISTO", "CLASSIFICADO", "AGRUPADO"].includes(l.status);

  /**
   * Avisa antes de salvar o que a governança vai fazer com a alteração — em vez
   * de o usuário descobrir só quando o borderô for parar na Mesa.
   */
  const avisoEdicaoValor = (l: Lancamento, novoValorStr: string): string | null => {
    const novo = Number(String(novoValorStr).replace(",", "."));
    if (!Number.isFinite(novo) || Math.abs(novo - l.valor) < 0.01) return null;

    const tipo = String((l.dados_extras || {}).btg_payment_type ?? "").toUpperCase();
    if (l.btg_dda_id || tipo === "BANKSLIP" || tipo === "UTILITIES") {
      return "Em boleto quem manda é o valor do título registrado. Alterar aqui não muda o que o banco cobra, e o lançamento passará pela Mesa antes do envio.";
    }
    const delta = Math.abs(novo - l.valor);
    const pct = l.valor > 0 ? (delta / l.valor) * 100 : Infinity;
    if (pct > 5 && delta > 50) {
      return `Alteração de ${fmtCurrency(delta)} (${pct.toFixed(1)}%) — acima da tolerância, este lançamento passará pela Mesa antes do envio.`;
    }
    return null;
  };

  // Selection — can select PREVISTO and CLASSIFICADO
  const selectablePagar = lancamentos.filter(l => l.tipo === "PAGAR" && ["PREVISTO", "CLASSIFICADO"].includes(l.status));
  const previstosPagar = selectablePagar; // alias for backward compat

  const totalPago = pagosFiltrados.reduce((s, l) => s + Number(l.valor_pago ?? l.valor), 0);
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
              <Button size="sm" variant="outline"
                onClick={() => atualizarRetornoMutation.mutate()}
                disabled={atualizarRetornoMutation.isPending}
                title="Consulta o BTG agora, sem esperar a rotina de 30 minutos. Use logo depois de aprovar um pagamento no app.">
                <RefreshCw className={`h-4 w-4 mr-1 ${atualizarRetornoMutation.isPending ? "animate-spin" : ""}`} />
                {atualizarRetornoMutation.isPending ? "Consultando..." : "Atualizar retorno"}
              </Button>
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Novo Lançamento
              </Button>
            </div>
          }
        />

        {/* Uma linha, com link. O painel inteiro morava aqui e comia meia tela;
            o assunto tem página própria agora, mas quem entra no Contas a Pagar
            precisa saber que há dinheiro parado em outra loja. */}
        {qtdPendencias > 0 && (
          <Link
            to="/financeiro/pendencias"
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted/50",
              pendenciasGraves > 0 ? "border-destructive/40 bg-destructive/5" : "border-amber-300 bg-amber-50",
            )}
          >
            <AlertTriangle className={cn(
              "h-4 w-4 shrink-0",
              pendenciasGraves > 0 ? "text-destructive" : "text-amber-600",
            )} />
            <span className="flex-1">
              <strong>{qtdPendencias}</strong> pagamento(s) parado(s)
              {pendenciasGraves > 0 && <> · <strong>{pendenciasGraves}</strong> exige(m) atenção imediata</>}
            </span>
            <span className="text-xs text-muted-foreground">Ver pagamentos parados →</span>
          </Link>
        )}

        {/* Workflow Stepper */}
        <WorkflowStepper
          steps={[
            { number: 1, title: "Cadastrar", description: "Importe do ERP ou crie manualmente", status: stepStatus(1), count: countPrevistos },
            { number: 2, title: "Validar", description: "Confirme e classifique a conta DRE", status: stepStatus(2), count: naoClassificados },
            { number: 3, title: "Preparar Pgto", description: "PIX, boleto ou TED", status: stepStatus(3), count: classificadosSemPgto },
            { number: 4, title: "Montar Borderô", description: "Agrupe em lote para aprovação", status: stepStatus(4), count: countComPagamento + countBorderoMontagem },
            { number: 5, title: "Aprovar e Enviar", description: "Admin aprova na Mesa e transmite ao BTG", status: stepStatus(5), count: countBorderoAprovado },
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
              <Label>Quando pagar</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={formBorderoModoData === "DATA_UNICA" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFormBorderoModoData("DATA_UNICA")}
                >
                  Data única
                </Button>
                <Button
                  type="button"
                  variant={formBorderoModoData === "VENCIMENTO" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFormBorderoModoData("VENCIMENTO")}
                >
                  No vencimento
                </Button>
              </div>
            </div>

            {formBorderoModoData === "DATA_UNICA" ? (
              <div className="space-y-1">
                <Label>Data de pagamento</Label>
                <Input type="date" value={formBorderoDataPg} onChange={e => setFormBorderoDataPg(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  Todos os itens serão agendados para esta data; vencimento anterior a ela é pago no vencimento (sem juros).
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Cada título é agendado no próprio vencimento — o do boleto no DDA, quando houver.
                Títulos já vencidos são pagos hoje.
              </p>
            )}
            <div className="space-y-1">
              <Label>Descrição do lote (opcional)</Label>
              <Input
                value={formBorderoDesc}
                onChange={e => setFormBorderoDesc(e.target.value)}
                placeholder={formBorderoDataPg
                  ? `Borderô Semana ${format(new Date(formBorderoDataPg + "T12:00:00"), "dd/MM/yyyy")} (automático)`
                  : "Ex: Fornecedores Janeiro"}
              />
            </div>
          </div>
        </BaseDialog>

        {/* Liberação do borderô — diagnóstico e ação no mesmo lugar.
            Antes o envio falhava com uma lista de motivos crus e um botão que
            jogava o admin na Mesa, onde ele via todos os lançamentos da empresa
            e tinha que descobrir sozinho quais eram os deste borderô. */}
        <BaseDialog
          open={!!liberarBorderoId}
          onOpenChange={(o) => { if (!o) setLiberarBorderoId(null); }}
          title="Liberar borderô"
          footer={
            <>
              <Button variant="outline" onClick={() => setLiberarBorderoId(null)}>Fechar</Button>
              {/* Saída para o caso que não se resolve num clique: a Mesa já
                  filtrada por este borderô. Deixa de ser o caminho obrigatório
                  e passa a ser o aprofundamento. */}
              {diagnostico && diagnostico.travados > 0 && (
                <Button variant="ghost" size="sm"
                  onClick={() => { window.location.href = `/financeiro/mesa?bordero=${liberarBorderoId}&empresa=${codEmpresa}`; }}>
                  Ver na Mesa
                </Button>
              )}
              {diagnostico?.pode_liberar && (
                <Button
                  onClick={() => aprovarEEnviarMutation.mutate(liberarBorderoId!)}
                  disabled={aprovarEEnviarMutation.isPending}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  {aprovarEEnviarMutation.isPending ? "Liberando..." : "Liberar e enviar ao BTG"}
                </Button>
              )}
            </>
          }
        >
          {!diagnostico ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Analisando...</p>
          ) : (
            <div className="space-y-3 py-2">
              {diagnostico.travados === 0 ? (
                <p className="text-sm bg-green-50 border border-green-200 text-green-800 rounded-md p-3">
                  Nada trava este borderô — todos os {diagnostico.total_itens} itens têm origem comprovada.
                  Ele pode ser enviado direto.
                </p>
              ) : (
                <div className="text-sm bg-amber-50 border border-amber-200 rounded-md p-3">
                  <p className="font-medium text-amber-900">
                    {diagnostico.travados} de {diagnostico.total_itens} itens precisam da sua liberação
                    {" "}({fmtCurrency(diagnostico.valor_travado)})
                  </p>
                  <p className="text-xs text-amber-800 mt-1">
                    Os demais seguem normalmente. Liberar significa: você confere e assume que a despesa procede.
                  </p>
                </div>
              )}

              {diagnostico.impedimento && (
                <p className="text-sm bg-destructive/5 border border-destructive/20 text-destructive rounded-md p-3">
                  {diagnostico.impedimento}
                </p>
              )}

              {diagnostico.itens.filter(i => i.trava).map(i => (
                <div key={i.id} className="border rounded-md p-3 space-y-1">
                  <div className="flex justify-between items-start gap-3">
                    <p className="text-sm font-medium">{i.pessoa_nome || i.descricao}</p>
                    <p className="text-sm font-medium whitespace-nowrap">{fmtCurrency(i.valor)}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{i.motivo}</p>
                  {i.como_resolver && (
                    <p className="text-xs text-primary bg-primary/5 rounded p-2">{i.como_resolver}</p>
                  )}
                  {/* Escopo: liberar sempre só desta vez fazia o admin repetir a
                      conferência todo mês, e repetição vira carimbo. */}
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[11px] text-muted-foreground">Vale para:</span>
                    <select
                      className="h-7 rounded-md border bg-background px-2 text-xs"
                      value={escoposLiberacao[i.id]?.escopo ?? "UNICA"}
                      onChange={e => setEscoposLiberacao(prev => ({
                        ...prev,
                        [i.id]: { escopo: e.target.value, quantidade: prev[i.id]?.quantidade ?? 3 },
                      }))}
                    >
                      <option value="UNICA">só esta vez</option>
                      <option value="QUANTIDADE">os próximos</option>
                      <option value="PERMANENTE">sempre (vira o novo padrão)</option>
                    </select>
                    {escoposLiberacao[i.id]?.escopo === "QUANTIDADE" && (
                      <Input
                        type="number" min={1} max={24}
                        className="h-7 w-16 text-xs"
                        value={escoposLiberacao[i.id]?.quantidade ?? 3}
                        onChange={e => setEscoposLiberacao(prev => ({
                          ...prev,
                          [i.id]: { escopo: "QUANTIDADE", quantidade: Number(e.target.value) || 1 },
                        }))}
                      />
                    )}
                  </div>
                  {escoposLiberacao[i.id]?.escopo === "PERMANENTE" && (
                    <p className="text-[11px] text-muted-foreground">
                      O valor atual passa a ser o esperado da rubrica, e a faixa gira em torno dele.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </BaseDialog>

        {/* Comprovante — visualização no próprio app */}
        <BaseDialog
          open={!!comprovante}
          onOpenChange={(open) => {
            if (!open && comprovante) {
              URL.revokeObjectURL(comprovante.url); // não segura memória depois de fechar
              setComprovante(null);
            }
          }}
          title="Comprovante de pagamento"
          footer={
            <>
              <Button variant="outline" onClick={() => {
                if (comprovante) URL.revokeObjectURL(comprovante.url);
                setComprovante(null);
              }}>
                Fechar
              </Button>
              {comprovante && (
                // Âncora com `download` em vez de popup: não é barrada por
                // bloqueador de anúncio, e entrega o arquivo com nome legível.
                <a href={comprovante.url} download={comprovante.nome}>
                  <Button>
                    <Download className="h-4 w-4 mr-1" /> Baixar PDF
                  </Button>
                </a>
              )}
            </>
          }
        >
          {comprovante && (
            <div className="py-2">
              {/* <object> em vez de <iframe>: bloqueadores de anúncio tratam
                  iframe de blob: como conteúdo de terceiro e barram. Quando nem
                  assim renderizar, o conteúdo interno aparece — por isso ele
                  repete a ação de baixar, em vez de ser um aviso morto. */}
              <object
                data={comprovante.url}
                type="application/pdf"
                className="w-full rounded-md border bg-muted/30"
                style={{ height: "60vh" }}
              >
                <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Seu navegador ou uma extensão está bloqueando a visualização do PDF aqui dentro.
                    O comprovante foi baixado do BTG normalmente — é só abrir o arquivo.
                  </p>
                  <a href={comprovante.url} download={comprovante.nome}>
                    <Button size="sm">
                      <Download className="h-4 w-4 mr-1" /> Baixar comprovante
                    </Button>
                  </a>
                </div>
              </object>
              <p className="text-[11px] text-muted-foreground mt-2">
                Documento emitido pelo BTG, consultado agora. Nada é armazenado aqui — guardamos
                apenas o identificador do pagamento, para poder pedir o comprovante de novo quando precisar.
              </p>
            </div>
          )}
        </BaseDialog>

        {/* Unificar pagamento (rateio) */}
        <BaseDialog
          open={unificarDialogOpen}
          onOpenChange={setUnificarDialogOpen}
          title="Unificar pagamento"
          footer={
            <>
              <Button variant="outline" onClick={() => setUnificarDialogOpen(false)}>Cancelar</Button>
              <Button onClick={() => unificarMutation.mutate()} disabled={unificarMutation.isPending}>
                <Layers className="h-4 w-4 mr-1" /> Unificar
              </Button>
            </>
          }
        >
          <div className="space-y-3 py-2">
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-start gap-2">
              <Layers className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="text-sm font-medium text-primary">
                  {selectedIds.size} lançamentos — {fmtCurrency(selectedTotal)}
                </p>
                <p>
                  Um pagamento só vai ao banco. Cada lançamento continua registrado
                  com sua conta do DRE, e a baixa é distribuída entre eles.
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Qual deles é o boleto a pagar?</Label>
              <select
                className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                value={formUnificarPagador}
                onChange={e => setFormUnificarPagador(e.target.value)}
              >
                <option value="">Nenhum — criar um título novo com a soma</option>
                {previstosPagar.filter(l => selectedIds.has(l.id)).map(l => (
                  <option key={l.id} value={l.id}>
                    {l.descricao} — {fmtCurrency(l.valor)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Se o boleto já está na lista (veio do DDA), escolha-o aqui: os outros viram
                a composição dele e a soma precisa fechar com o valor cobrado.
              </p>
            </div>

            <div className="space-y-1">
              <Label>Descrição (opcional)</Label>
              <Input
                value={formUnificarDesc}
                onChange={e => setFormUnificarDesc(e.target.value)}
                placeholder="Ex: Ocupação — aluguel, IPTU e condomínio"
              />
            </div>
          </div>
        </BaseDialog>

        <BorderoBloqueioDialog
          payload={borderoBloqueio}
          onOpenChange={(open) => { if (!open) setBorderoBloqueio(null); }}
        />

        {/* Detalhe borderô */}

        <BaseDialog
          open={!!borderoDetalheId}
          onOpenChange={(open) => { if (!open) setBorderoDetalheId(null); }}
          title={`Borderô ${borderoDetalhe?.bordero?.descricao || borderoDetalheId?.slice(0, 8) || ""}`}
        >
          <div className="space-y-3 py-2">
            {borderoDetalhe?.bordero && (() => {
              // Mesma regra da lista, calculada aqui a partir dos próprios itens
              // do detalhe: o badge não pode discordar de uma tela para a outra.
              const comp = resumirComposicao(
                (borderoDetalhe.lancamentos || []).map((l: Lancamento) => ({
                  status: l.status,
                  requer_validacao: (l as unknown as { requer_validacao?: boolean }).requer_validacao,
                  data_prevista:
                    ((l.dados_extras || {}) as Record<string, unknown>).btg_payment_date as string
                    ?? l.data_vencimento,
                  motivo_recusa:
                    ((l.dados_extras || {}) as Record<string, unknown>).btg_motivo_recusa as string ?? null,
                  btg_status:
                    ((l.dados_extras || {}) as Record<string, unknown>).btg_payment_status as string ?? null,
                  // O valor entra para o resumo dizer quanto o banco devolveu —
                  // contagem sozinha não serve para cobrar ninguém.
                  valor: Number(l.valor ?? 0),
                })),

              );
              const est = estadoBordero(borderoDetalhe.bordero.status, comp, format(agoraSP(), "yyyy-MM-dd"));
              return (
                <div className="flex gap-2 items-center justify-between flex-wrap">
                  <div className="flex items-center gap-2">
                    <Badge variant={est.variant}>{est.label}</Badge>
                    <span className="text-sm font-medium">{fmtCurrency(borderoDetalhe.bordero.total_valor)}</span>
                    <span className="text-xs text-muted-foreground">({borderoDetalhe.bordero.qtd_lancamentos} lançamentos)</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{est.titulo}</p>

                  {["MONTAGEM", "APROVADO"].includes(borderoDetalhe.bordero.status) && (
                    <div className="w-full flex items-end gap-2 pt-2 border-t">
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Data de pagamento</label>
                        <Input
                          type="date"
                          className="h-8 w-[160px]"
                          value={novaDataBordero || borderoDetalhe.bordero.data_pagamento || ""}
                          onChange={(e) => setNovaDataBordero(e.target.value)}
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        disabled={
                          !novaDataBordero ||
                          novaDataBordero === borderoDetalhe.bordero.data_pagamento ||
                          editarBorderoMutation.isPending
                        }
                        onClick={() => editarBorderoMutation.mutate({
                          id: borderoDetalhe.bordero.id,
                          data: novaDataBordero,
                        })}
                      >
                        Alterar data
                      </Button>
                      <p className="text-xs text-muted-foreground flex-1">
                        Só antes do envio. Depois de enviado a data está com o banco.
                      </p>
                    </div>
                  )}

                  {/* Lote no banco que não foi autorizado. Sem isto o borderô
                      ficava sem saída: a data não é editável depois do envio e
                      os títulos não voltam sozinhos. */}
                  {borderoDetalhe.bordero.status === "ENVIADO" && comp.pendentes > 0 && (
                    <div className="w-full pt-2 border-t space-y-2">
                      <p className="text-xs font-medium">
                        O lote não foi autorizado no BTG e você quer refazer com outra data?
                      </p>
                      <p className="text-xs text-muted-foreground">
                        A data já está no lote do banco e não pode ser alterada por aqui. Para refazer,
                        os {comp.pendentes} título(s) em trânsito voltam ao preparo e este borderô é
                        cancelado — aí você monta outro com a data correta.
                      </p>

                      {/* O que o BTG devolveu, quando devolveu algo. Poupa o
                          operador de redigitar o que o banco já disse — e o
                          motivo verdadeiro é o do banco, não o que supomos. */}
                      {(() => {
                        const comMotivo = (borderoDetalhe.lancamentos || []).find((l: Lancamento) => {
                          const d = (l.dados_extras || {}) as Record<string, unknown>;
                          return d.btg_motivo_recusa || d.btg_payment_status;
                        });
                        const d = (comMotivo?.dados_extras || {}) as Record<string, unknown>;
                        const motivoBanco = d.btg_motivo_recusa as string | undefined;
                        const statusBanco = d.btg_payment_status as string | undefined;
                        if (!motivoBanco && !statusBanco) return null;
                        return (
                          <p className="text-xs bg-muted/50 border rounded p-2">
                            <span className="text-muted-foreground">Retorno do banco: </span>
                            <span className="font-mono">{motivoBanco || statusBanco}</span>
                          </p>
                        );
                      })()}
                      <label className="flex items-start gap-2 text-xs">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-3.5 w-3.5"
                          checked={confirmouBanco}
                          onChange={(e) => setConfirmouBanco(e.target.checked)}
                        />
                        <span className="text-destructive">
                          Confirmo no app do BTG que este lote não será mais liquidado. Se ele ainda
                          estiver ativo e o master autorizar depois, estes títulos serão pagos duas
                          vezes — e Pix não volta.
                        </span>
                      </label>
                      <Input
                        className="h-8 text-xs"
                        placeholder="O que o banco informou? (mín. 10 caracteres)"
                        value={motivoRefazer}
                        onChange={(e) => setMotivoRefazer(e.target.value)}
                      />
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-8"
                        disabled={
                          !confirmouBanco ||
                          motivoRefazer.trim().length < 10 ||
                          refazerBorderoMutation.isPending
                        }
                        onClick={() => refazerBorderoMutation.mutate(borderoDetalhe.bordero.id)}
                      >
                        Devolver ao preparo e cancelar este borderô
                      </Button>
                    </div>
                  )}

                  {comp.rejeitados > 0 && (
                    <div className="w-full pt-2 border-t space-y-2">
                      <p className="text-sm text-destructive font-medium">
                        {comp.rejeitados} pagamento(s) devolvido(s)/recusado(s) pelo banco
                        {(comp.valor_rejeitado ?? 0) > 0 && <> — {fmtCurrency(comp.valor_rejeitado ?? 0)} não saiu da conta</>}
                      </p>
                      {(comp.motivos_recusa ?? []).length > 0 && (
                        <p className="text-xs text-destructive">
                          Motivo do banco: {(comp.motivos_recusa ?? []).join(" · ")}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Os títulos com problema estão destacados em vermelho na lista abaixo.
                      </p>

                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          disabled={devolverPreparoMutation.isPending}
                          onClick={() => devolverPreparoMutation.mutate(borderoDetalhe.bordero.id)}
                        >
                          Devolver ao preparo para reenvio
                        </Button>
                        <p className="text-xs text-muted-foreground flex-1">
                          Os recusados voltam para Contas a Pagar com a classificação e os dados de
                          pagamento preservados. Quem já foi pago fica onde está — reenviar o mesmo
                          borderô pagaria duas vezes.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
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
                  // Título com problema no banco: devolvido, recusado ou não
                  // processado. Sem o destaque, o operador abria o borderô e
                  // tinha de adivinhar qual dos itens era o do alerta.
                  const extras = (l.dados_extras || {}) as Record<string, unknown>;
                  const motivoBanco = (extras.btg_motivo_recusa as string) || null;
                  const statusBanco = (extras.btg_payment_status as string) || null;
                  const comProblema =
                    Boolean((l as unknown as { requer_validacao?: boolean }).requer_validacao) ||
                    falhouNoBanco(statusBanco);
                  return (
                    <TableRow
                      key={l.id}
                      className={comProblema ? "bg-destructive/10 hover:bg-destructive/15" : undefined}
                    >
                      <TableCell className="text-sm font-medium">
                        {comProblema && <span className="mr-1 text-destructive">⚠</span>}
                        {l.descricao.toUpperCase()}
                        {comProblema && (
                          <span className="block text-xs font-normal text-destructive">
                            {motivoBanco
                              || `O banco não processou o pagamento (${String(statusBanco || "").toUpperCase()})`}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{l.pessoa_nome?.toUpperCase() || "—"}</TableCell>
                      <TableCell className="text-sm">{format(new Date(l.data_vencimento + "T12:00:00"), "dd/MM/yy")}</TableCell>
                      <TableCell className="text-sm text-right">{fmtCurrency(l.valor)}</TableCell>
                      <TableCell>
                        {payType ? (
                          <Badge variant="outline" className="text-[10px]">{String(payType).replace("_", " ")}</Badge>
                        ) : (
                          <span className="text-xs text-destructive">⚠ Sem dados</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={comProblema ? "destructive" : (STATUS_CONFIG[l.status]?.variant || "outline")}>
                          {comProblema
                            ? "Não pago pelo banco"
                            : (STATUS_CONFIG[l.status]?.label || l.status)}
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
          title="Editar Lançamento"
          footer={
            <>
              <Button variant="outline" onClick={() => setEditLanc(null)}>Cancelar</Button>
              <Button
                onClick={() => editLanc && editNaturezaMutation.mutate({
                  id: editLanc.id,
                  natureza: editNatureza,
                  categoria: editCategoria,
                  subcategoria: editSubcategoria,
                  ...(podeEditarValor(editLanc) ? {
                    valor: Number(editValor.replace(",", ".")),
                    data_vencimento: editVencimento || editLanc.data_vencimento,
                    motivo_reprogramacao: editMotivoReprog || undefined,
                  } : {}),
                })}
                disabled={editNaturezaMutation.isPending || !editSubcategoria}
              >
                Salvar
              </Button>
            </>
          }
        >
          {editLanc && (
            <div className="space-y-4 py-2">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-sm font-medium">{editLanc.descricao.toUpperCase()}</p>
                <p className="text-xs text-muted-foreground">{editLanc.pessoa_nome?.toUpperCase() || "—"}</p>
              </div>

              {podeEditarValor(editLanc) ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Valor</Label>
                    <Input value={editValor} onChange={e => setEditValor(e.target.value)} inputMode="decimal" />
                  </div>
                  <div className="space-y-1">
                    <Label>Vencimento</Label>
                    <Input type="date" value={editVencimento} onChange={e => setEditVencimento(e.target.value)} />
                  </div>
                  {avisoEdicaoValor(editLanc, editValor) && (
                    <p className="col-span-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                      {avisoEdicaoValor(editLanc, editValor)}
                    </p>
                  )}

                  {/* Reprogramação: o motivo só aparece quando a data muda, para
                      não virar campo obrigatório em toda edição. */}
                  {editVencimento && editVencimento !== editLanc.data_vencimento && (
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Por que está mudando a data?</Label>
                      <Input
                        value={editMotivoReprog}
                        onChange={e => setEditMotivoReprog(e.target.value)}
                        placeholder="Ex: fechamento ainda não chegou — reprogramado para a próxima semana"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        De {format(new Date(editLanc.data_vencimento + "T12:00:00"), "dd/MM/yyyy")} para{" "}
                        {format(new Date(editVencimento + "T12:00:00"), "dd/MM/yyyy")}.
                        {editLanc.rubrica_id && " A competência da rubrica não muda — o DRE continua no mês de origem."}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Valor: <strong>{fmtCurrency(editLanc.valor)}</strong> — em {editLanc.status}, só a
                  classificação pode mudar.
                </p>
              )}
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
          <SearchField
            className="w-[280px]"
            label="Pesquisar"
            placeholder="Descrição, fornecedor ou valor"
            value={busca}
            onChange={setBusca}
            resultados={
              activeTab === "pagos" ? pagosFiltrados.length
                : activeTab === "borderos" ? borderosFiltrados.length
                : lancamentosFiltrados.length
            }
          />
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
            const today = agoraSP(); const next = new Date(today); next.setDate(next.getDate() + 7);
            setFiltroCampoData("VENCIMENTO"); setFiltroDataInicio(format(today, "yyyy-MM-dd")); setFiltroDataFim(format(next, "yyyy-MM-dd"));
          }}>Próximos 7 dias</Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => {
            const now = agoraSP();
            setFiltroCampoData("VENCIMENTO"); setFiltroDataInicio(format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd")); setFiltroDataFim(format(new Date(now.getFullYear(), now.getMonth() + 1, 0), "yyyy-MM-dd"));
          }}>Mês atual</Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => {
            const ontem = agoraSP(); ontem.setDate(ontem.getDate() - 1);
            setFiltroCampoData("VENCIMENTO"); setFiltroDataInicio(""); setFiltroDataFim(format(ontem, "yyyy-MM-dd")); setFiltroStatus("PREVISTO");
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
                <CheckCircle2 className="h-4 w-4 text-primary" /> Total Validado
              </CardTitle>
            </CardHeader>
            <CardContent><p className="text-2xl font-bold text-primary">{fmtCurrency(totalAgenda)}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Pendentes
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
            <TabsTrigger value="borderos">
              Borderôs
              {borderosAbertos > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5">{borderosAbertos}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="pagos">
              Pagos {pagos.length > 0 && <Badge variant="secondary" className="ml-1.5">{pagos.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="contas-receber" disabled>
              Contas a Receber <span className="ml-1 text-[10px] text-muted-foreground">(em breve)</span>
            </TabsTrigger>
          </TabsList>

          {/* Contas a Pagar */}
          <TabsContent value="contas-pagar">
            <ContasPagarTable
              lancamentos={lancamentosFiltrados}
              isLoading={isLoading}
              selectedIds={selectedIds}
              isAdmin={!!authIsAdmin}
              onToggleSelect={toggleSelect}
              onToggleSelectAll={toggleSelectAll}
              onClassificar={openEditNatureza}
              onPrepararPagamento={(l) => setPrepPaymentLanc(l)}
              onBaixaManual={openBaixaManual}
              onComprovante={(l) => comprovanteMutation.mutate(l)}
              onVirarRubrica={(l) => virarRubricaMutation.mutate(l)}
              onCancelar={(id) => cancelarMutation.mutate(id)}
              onReabrir={(id) => reabrirMutation.mutate(id)}
              onRemoverDoBordero={(l) => {
                if (l.bordero_id) removerDoBorderoMutation.mutate({ bordero_id: l.bordero_id, lancamento_ids: [l.id] });
              }}
              onDevolverParaPreparo={(l) => devolverPreparoMutation.mutate({ lancamento_ids: [l.id] })}
              onLiberarProcessando={(l) => {
                const ok = window.confirm(
                  `Destravar "${l.descricao}"?\n\n` +
                  `Use apenas quando o lote NÃO chegou ao app do BTG. O título volta para "Em Preparo" ` +
                  `e pode ser enviado num borderô novo.\n\n` +
                  `Se houver remessa de verdade aguardando aprovação no banco, a operação será recusada.`
                );
                if (ok) liberarProcessandoMutation.mutate([l.id]);
              }}
              isCancelando={cancelarMutation.isPending}
              isReabrindo={reabrirMutation.isPending}
              isRemovendoDoBordero={removerDoBorderoMutation.isPending}
              stepFilter={selectedStep}
            />
          </TabsContent>

          {/* Borderôs */}
          <TabsContent value="borderos">
            {borderosFiltrados.some(b => b.status === "MONTAGEM") && (
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
                      ) : borderosFiltrados.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          {busca
                            ? `Nenhum borderô encontrado para "${busca}".`
                            : 'Nenhum borderô. Selecione lançamentos na aba "Contas a Pagar" e clique em "Criar Borderô".'}
                        </TableCell></TableRow>
                      ) : borderosFiltrados.map(b => {
                        const bs = estadoBordero(b.status, b.composicao, format(agoraSP(), "yyyy-MM-dd"));
                        return (
                          <TableRow key={b.id}>
                            <TableCell className="text-sm">
                              <button className="text-primary hover:underline" onClick={() => setBorderoDetalheId(b.id)}>
                                {b.descricao || `BORDERÔ ${b.id.slice(0, 8).toUpperCase()}`}
                              </button>
                            </TableCell>
                            <TableCell className="text-center text-sm">{b.qtd_lancamentos}</TableCell>
                            <TableCell className="text-right text-sm font-medium">{fmtCurrency(b.total_valor)}</TableCell>
                            <TableCell>
                              <Badge variant={bs.variant} title={bs.titulo} className="cursor-help">
                                {bs.label}
                              </Badge>
                              {erroEnvio[b.id] && (
                                <p className="mt-1 text-xs text-destructive whitespace-pre-wrap max-w-[260px]">
                                  Último envio recusado: {erroEnvio[b.id]}
                                </p>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{format(new Date(b.created_at), "dd/MM/yy")}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {b.aprovado_em ? format(new Date(b.aprovado_em), "dd/MM/yy HH:mm") : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              <BorderoGuidedActions
                                status={b.status}
                                isAdmin={!!authIsAdmin}
                                enviadoEm={b.updated_at}
                                dataPagamento={b.data_pagamento}
                                onAprovar={() => setLiberarBorderoId(b.id)}
                                onEnviar={() => enviarBorderoMutation.mutate(b.id)}
                                onConfirmar={() => confirmarProcessamentoMutation.mutate(b.id)}
                                onCancelar={() => {
                                  const ok = window.confirm(
                                    `Cancelar o borderô "${b.descricao}"?\n\n` +
                                    `Os ${b.qtd_lancamentos} título(s) voltam para "Em Preparo" com a classificação e os dados de pagamento mantidos, ` +
                                    `e podem ser selecionados de novo para um borderô novo.\n\nNada é excluído e nada vai ao banco.`
                                  );
                                  if (ok) cancelarBorderoMutation.mutate(b.id);
                                }}
                                isPendingAprovar={false}
                                isPendingEnviar={enviarBorderoMutation.isPending && enviarBorderoMutation.variables === b.id}
                                isPendingConfirmar={confirmarProcessamentoMutation.isPending && confirmarProcessamentoMutation.variables === b.id}
                                isPendingCancelar={cancelarBorderoMutation.isPending && cancelarBorderoMutation.variables === b.id}
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


          {/* Pagos — o que já saiu da conta, com o comprovante à mão.
              Separado das contas a pagar de propósito: aqui não há ação de
              cobrança, é consulta e prova de pagamento. */}
          <TabsContent value="pagos">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">Pagamentos realizados</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Filtrado por <strong>data de pagamento</strong>{filtroDataInicio || filtroDataFim ? " (o período escolhido acima)" : " — todos os períodos"},
                    não por vencimento. O comprovante é buscado no BTG na hora; nada fica armazenado aqui.
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold">{fmtCurrency(totalPago)}</p>
                  <p className="text-xs text-muted-foreground">{pagosFiltrados.length} pagamento(s)</p>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pago em</TableHead>
                      <TableHead>Fornecedor</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Conta</TableHead>
                      <TableHead className="text-right">Previsto</TableHead>
                      <TableHead className="text-right">Pago</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagosFiltrados.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                          Nenhum pagamento com baixa {filtroDataInicio || filtroDataFim ? "no período selecionado" : "registrado"}.
                          {(filtroDataInicio || filtroDataFim) && (
                            <button className="ml-1 text-primary hover:underline"
                              onClick={() => { setFiltroDataInicio(""); setFiltroDataFim(""); }}>
                              Ver todos os períodos
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    ) : pagosFiltrados.map(l => {
                      const pago = Number(l.valor_pago ?? l.valor);
                      const dif = Number((pago - l.valor).toFixed(2));
                      const temComprovante = !!((l.dados_extras || {}).btg_payment_id || (l.dados_extras || {}).btg_batch_id);
                      return (
                        <TableRow key={l.id}>
                          <TableCell className="text-sm whitespace-nowrap">
                            {l.data_pagamento
                              ? format(new Date(l.data_pagamento + "T12:00:00"), "dd/MM/yy")
                              : "—"}
                          </TableCell>
                          <TableCell className="text-sm">{l.pessoa_nome || "—"}</TableCell>
                          <TableCell className="text-sm max-w-[280px] truncate" title={l.descricao}>
                            {l.descricao}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {l.subcategoria || "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {fmtCurrency(l.valor)}
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium">
                            {fmtCurrency(pago)}
                            {Math.abs(dif) >= 0.01 && (
                              <span
                                className={`block text-[10px] ${dif > 0 ? "text-destructive" : "text-green-600"}`}
                                title={dif > 0 ? "Pago acima do previsto (juros/multa)" : "Pago abaixo do previsto (desconto)"}
                              >
                                {dif > 0 ? "+" : "−"}{fmtCurrency(Math.abs(dif))}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {temComprovante ? (
                              <Button size="sm" variant="outline" className="h-7 text-xs"
                                onClick={() => comprovanteMutation.mutate(l)}
                                disabled={comprovanteMutation.isPending}>
                                <Receipt className="h-3.5 w-3.5 mr-1" /> Comprovante
                              </Button>
                            ) : (
                              <span className="text-[11px] text-muted-foreground"
                                title="Baixa manual ou pagamento fora do BTG — não há recibo emitido pelo banco">
                                sem recibo no banco
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
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
            {/* Limpar seleção fica colado na contagem, que é onde a mão procura.
                Antes só existia "Cancelar" (destrutivo) e a leitura natural era
                "cancelar a seleção" — 21 títulos foram cancelados assim. */}
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}
              title="Desmarca todos, sem alterar nada">
              <XCircle className="h-4 w-4 mr-1" /> Limpar seleção
            </Button>
            <span className="h-5 w-px bg-border" aria-hidden />
            <div className="flex items-center gap-2">
              <Button size="sm" variant="default" onClick={() => setClassificarLoteOpen(true)}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Validar
              </Button>
              <Button size="sm" variant="outline" onClick={() => setBorderoDialogOpen(true)}>
                <Package className="h-4 w-4 mr-1" /> Criar Borderô
              </Button>
              {selectedIds.size >= 2 && (
                <Button size="sm" variant="outline" onClick={() => setUnificarDialogOpen(true)}
                  title="Um pagamento só, mantendo o registro de cada despesa que o compõe">
                  <Layers className="h-4 w-4 mr-1" /> Unificar pagamento
                </Button>
              )}
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  const n = selectedIds.size;
                  const ok = confirm(
                    `Isto CANCELA ${n} lançamento(s) — eles saem das contas a pagar.\n\n` +
                    `Se a intenção era apenas desmarcar, use "Limpar seleção".\n\nCancelar mesmo assim?`,
                  );
                  if (ok) cancelarLoteMutation.mutate(Array.from(selectedIds));
                }}
                disabled={cancelarLoteMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-1" /> Cancelar lançamentos
              </Button>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
