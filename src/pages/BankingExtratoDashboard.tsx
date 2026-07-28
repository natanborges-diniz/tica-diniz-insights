// E4 — Fila de exceções da conciliação 3 vias (SPEC_P1_CONCILIACAO_3VIAS.md §6)
// Filtro padrão: PENDENTE. Sugestões do motor com confirmação de 1 clique.
// O checkbox manual de conciliado foi removido — toda conciliação passa pelo
// motor (conciliar-extrato) ou pelas ações desta fila.
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, subDays, differenceInCalendarDays } from "date-fns";
import {
  ArrowDownCircle, ArrowUpCircle, Download, Landmark, TrendingUp, TrendingDown,
  PieChart, CheckCircle2, Sparkles, Search, EyeOff, FilePlus2, Undo2, Clock, Settings2,
  AlertTriangle,
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
import { Textarea } from "@/components/ui/textarea";
import { BaseDialog } from "@/components/system/BaseDialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ExtratoRegrasDialog } from "@/components/banking/ExtratoRegrasDialog";
import { PlanoContaSelect, usePlanoContas, type PlanoConta } from "@/components/banking/PlanoContaSelect";

// ─── Types ───────────────────────────────────────────────────
interface Sugestao {
  alvo_tipo: string;
  alvo_id: string;
  score: number;
  motivo: string;
}

interface ExtratoItem {
  id: string;
  cod_empresa: number;
  data_lancamento: string;
  descricao: string;
  valor: number;
  tipo: string;
  natureza: string | null;
  conciliado: boolean;
  status_conciliacao: string;
  metodo_conciliacao: string | null;
  dados_extras: { sugestoes?: Sugestao[]; ignorar_observacao?: string | null } | null;
  saldo_apos: number | null;
  created_at: string;
}

interface ResumoExtrato {
  total_lancamentos: number;
  total_credito: number;
  total_debito: number;
  saldo_periodo: number;
  total_conciliado: number;
  percentual_conciliado: number;
  por_natureza: Record<string, { count: number; total: number }>;
  por_metodo: Record<string, number>;
  total_pendente: number;
  pendentes_antigos: number;
}

interface SaldoResponse {
  available?: { amount: number; currency: string };
  blocked?: { amount: number; currency: string };
  sandbox?: boolean;
}

const getFunctionErrorMessage = async (error: unknown): Promise<string> => {
  const context = (error as { context?: Response })?.context;
  if (context) {
    try {
      const payload = await context.clone().json() as { error?: unknown; details?: unknown };
      if (typeof payload.error === "string") return payload.error;
      if (typeof payload.details === "string") return payload.details;
    } catch {
      // Fallback abaixo quando o body já foi consumido ou não é JSON.
    }
  }

  if (error instanceof Error) return error.message;
  return "Erro ao comunicar com o BTG";
};

const isBtgAuthMissing = (message: string) =>
  /Empresa \d+ não autenticada no BTG/i.test(message) || /Token BTG expirado/i.test(message);

const STATUS_LABEL: Record<string, string> = {
  PENDENTE: "Pendente",
  CLASSIFICADO: "Classificado",
  CONCILIADO_AUTO: "Auto",
  CONCILIADO_MANUAL: "Manual",
  IGNORADO: "Ignorado",
};

const METODO_LABEL: Record<string, string> = {
  EXATO: "Auto (exato)",
  TOLERANCIA: "Auto (tolerância)",
  AGRUPADO: "Auto (agrupado)",
  REGRA: "Regra de tarifa",
  MANUAL: "Manual",
  IGNORADO: "Ignorado",
};

const ALVO_LABEL: Record<string, string> = {
  LANCAMENTO: "Lançamento",
  PAGAMENTO_BTG: "Pagamento BTG",
  COBRANCA_BTG: "Boleto",
  RECEBIVEL_CARTAO: "Recebível cartão",
  TARIFA: "Tarifa",
};

// Grupos DRE compatíveis com cada lado do extrato (padrão do plano de contas)
const GRUPOS_DEBITO = ["DEDUCOES", "CUSTO_MERCADORIA", "DESPESAS_OPERACIONAIS", "OUTRAS_DESPESAS", "INVESTIMENTOS"];
const GRUPOS_CREDITO = ["RECEITA_BRUTA", "OUTRAS_RECEITAS"];

export default function BankingExtratoDashboard() {
  const { empresas } = useEmpresas();
  const { codEmpresa: codEmpresaDefault, isAdmin } = useDefaultEmpresa();
  const queryClient = useQueryClient();

  const [codEmpresa, setCodEmpresa] = useState<number>(codEmpresaDefault || 1);
  const [dataInicio, setDataInicio] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [dataFim, setDataFim] = useState(format(new Date(), "yyyy-MM-dd"));
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [filtroStatus, setFiltroStatus] = useState<string>("PENDENTE");
  const [btgAccessIssue, setBtgAccessIssue] = useState<string | null>(null);

  const [autoImported, setAutoImported] = useState(false);
  useEffect(() => {
    setAutoImported(false);
    setBtgAccessIssue(null);
  }, [codEmpresa]);

  // Dialogs
  const [candidatosFor, setCandidatosFor] = useState<ExtratoItem | null>(null);
  const [candidatosLive, setCandidatosLive] = useState<Sugestao[] | null>(null);
  const [ignorarFor, setIgnorarFor] = useState<ExtratoItem | null>(null);
  const [ignorarObs, setIgnorarObs] = useState("");
  const [criarFor, setCriarFor] = useState<ExtratoItem | null>(null);
  const [criarConta, setCriarConta] = useState<PlanoConta | null>(null);
  const [criarDescricao, setCriarDescricao] = useState("");
  const { data: planoContas = [] } = usePlanoContas();
  const [regrasOpen, setRegrasOpen] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["btg-extrato"] });
    queryClient.invalidateQueries({ queryKey: ["btg-extrato-resumo"] });
  };

  // conciliar-extrato exige o JWT do usuário nas ações mutadoras
  const invokeConciliar = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("Sessão expirada — faça login novamente");
    const { data, error } = await supabase.functions.invoke("conciliar-extrato", {
      body: { action, ...extra },
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error) throw error;
    if (data?.error) throw new Error(String(data.error));
    return data;
  };

  // ─── Queries ─────────────────────────────────────────────
  const { data: lancamentos = [], isLoading } = useQuery<ExtratoItem[]>({
    queryKey: ["btg-extrato", codEmpresa, dataInicio, dataFim, filtroTipo, filtroStatus],
    queryFn: async () => {
      const params: Record<string, unknown> = {
        action: "listar", cod_empresa: codEmpresa, data_inicio: dataInicio, data_fim: dataFim,
      };
      if (filtroStatus === "PENDENTE") params.status_conciliacao = "PENDENTE,CLASSIFICADO";
      else if (filtroStatus !== "todos") params.status_conciliacao = filtroStatus;
      const { data, error } = await supabase.functions.invoke("btg-extrato", { body: params });
      if (error) {
        const message = await getFunctionErrorMessage(error);
        if (isBtgAuthMissing(message)) {
          setBtgAccessIssue(message);
          return [];
        }
        throw new Error(message);
      }
      setBtgAccessIssue(null);
      let items: ExtratoItem[] = Array.isArray(data) ? data : [];

      // Auto-import na primeira visita sem dados (persiste e relê — nada de linha "live")
      if (items.length === 0 && !autoImported && filtroStatus === "PENDENTE") {
        setAutoImported(true);
        try {
          const { data: importResult } = await supabase.functions.invoke("btg-extrato", {
            body: { action: "importar", cod_empresa: codEmpresa, data_inicio: dataInicio, data_fim: dataFim },
          });
          if (importResult?.importados > 0) {
            const { data: refetched } = await supabase.functions.invoke("btg-extrato", { body: params });
            items = Array.isArray(refetched) ? refetched : [];
            toast.success(`${importResult.importados} lançamentos importados do BTG`);
          }
        } catch (e) {
          console.warn("Auto-import failed:", e);
        }
      }

      if (filtroTipo !== "todos") items = items.filter((i) => i.tipo === filtroTipo);
      return items;
    },
  });

  const { data: resumo } = useQuery<ResumoExtrato | null>({
    queryKey: ["btg-extrato-resumo", codEmpresa, dataInicio, dataFim],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("btg-extrato", {
        body: { action: "resumo", cod_empresa: codEmpresa, data_inicio: dataInicio, data_fim: dataFim },
      });
      if (error) {
        const message = await getFunctionErrorMessage(error);
        if (isBtgAuthMissing(message)) {
          setBtgAccessIssue(message);
          return null;
        }
        throw new Error(message);
      }
      return data as ResumoExtrato;
    },
  });

  const { data: saldo } = useQuery<SaldoResponse | null>({
    queryKey: ["btg-saldo", codEmpresa],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("btg-extrato", {
        body: { action: "saldo", cod_empresa: codEmpresa },
      });
      if (error) {
        const message = await getFunctionErrorMessage(error);
        if (isBtgAuthMissing(message)) {
          setBtgAccessIssue(message);
          return null;
        }
        throw new Error(message);
      }
      return data as SaldoResponse;
    },
  });

  // ─── Mutations ───────────────────────────────────────────
  const importarMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("btg-extrato", {
        body: { action: "importar", cod_empresa: codEmpresa, data_inicio: dataInicio, data_fim: dataFim },
      });
      if (error) {
        const message = await getFunctionErrorMessage(error);
        if (isBtgAuthMissing(message)) setBtgAccessIssue(message);
        throw new Error(message);
      }
      return data;
    },
    onSuccess: (data) => {
      toast.success(`${data.importados} importados, ${data.duplicados ?? 0} duplicados ignorados`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao importar extrato"),
  });

  const executarMotorMutation = useMutation({
    mutationFn: () => invokeConciliar("executar", { cod_empresa: codEmpresa }),
    onSuccess: (data) => {
      toast.success(`Motor: ${data.conciliados} conciliadas, ${data.com_sugestao} com sugestão, ${data.sem_match} sem match`);
      invalidate();
    },
    onError: (e: Error) => toast.error(`Erro ao executar motor: ${e.message}`),
  });

  const confirmarMutation = useMutation({
    mutationFn: async ({ item, sugestao }: { item: ExtratoItem; sugestao: Sugestao }) => {
      if (sugestao.alvo_tipo === "TARIFA") {
        // alvo_id é a regra — busca natureza/categoria e cria o lançamento de tarifa
        const { data: regra, error } = await supabase
          .from("extrato_regras_classificacao")
          .select("natureza, categoria")
          .eq("id", sugestao.alvo_id)
          .single();
        if (error || !regra) throw new Error("Regra de tarifa não encontrada");
        return invokeConciliar("criar_lancamento", {
          extrato_id: item.id,
          natureza: regra.natureza,
          categoria: regra.categoria ?? undefined,
          descricao: item.descricao,
        });
      }
      return invokeConciliar("confirmar", {
        extrato_id: item.id,
        alocacoes: [{ alvo_tipo: sugestao.alvo_tipo, alvo_id: sugestao.alvo_id, valor_alocado: item.valor }],
      });
    },
    onSuccess: () => {
      toast.success("Linha conciliada");
      setCandidatosFor(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(`Erro ao conciliar: ${e.message}`),
  });

  const ignorarMutation = useMutation({
    mutationFn: ({ item, observacao }: { item: ExtratoItem; observacao: string }) =>
      invokeConciliar("ignorar", { extrato_id: item.id, observacao: observacao || undefined }),
    onSuccess: () => {
      toast.success("Linha ignorada");
      setIgnorarFor(null);
      setIgnorarObs("");
      invalidate();
    },
    onError: (e: Error) => toast.error(`Erro ao ignorar: ${e.message}`),
  });

  const criarLancamentoMutation = useMutation({
    mutationFn: ({ item, conta, descricao }: { item: ExtratoItem; conta: PlanoConta; descricao?: string }) =>
      // Padrão do DRE: natureza = grupo_dre, categoria = categoria do plano de contas
      invokeConciliar("criar_lancamento", {
        extrato_id: item.id,
        natureza: conta.grupo_dre,
        categoria: conta.categoria,
        descricao: descricao || `${conta.conta_numero} ${conta.conta_descricao} — ${item.descricao ?? ""}`.trim(),
      }),
    onSuccess: (data) => {
      const replicadas = data?.replicadas ?? 0;
      toast.success(
        replicadas > 0
          ? `Lançamento criado, linha conciliada e classificação replicada em ${replicadas} linha${replicadas === 1 ? "" : "s"} igual${replicadas === 1 ? "" : "is"}`
          : "Lançamento criado e linha conciliada"
      );
      setCriarFor(null);
      setCriarConta(null);
      setCriarDescricao("");
      invalidate();
    },
    onError: (e: Error) => toast.error(`Erro ao criar lançamento: ${e.message}`),
  });

  const desfazerMutation = useMutation({
    mutationFn: (item: ExtratoItem) => invokeConciliar("desfazer", { extrato_id: item.id }),
    onSuccess: () => {
      toast.success("Conciliação desfeita — linha voltou a PENDENTE");
      invalidate();
    },
    onError: (e: Error) => toast.error(`Erro ao desfazer: ${e.message}`),
  });

  const classificarMutation = useMutation({
    mutationFn: async ({ id, natureza }: { id: string; natureza: string }) => {
      const { data, error } = await supabase.functions.invoke("btg-extrato", {
        body: { action: "classificar", id, natureza },
      });
      if (error) throw new Error(await getFunctionErrorMessage(error));
      return data as { replicadas?: number; empresas?: number } | null;
    },
    onSuccess: (data) => {
      const replicadas = data?.replicadas ?? 0;
      if (replicadas > 0) {
        toast.success(`Classificação aplicada e replicada em ${replicadas} linha${replicadas === 1 ? "" : "s"} igual${replicadas === 1 ? "" : "is"}`);
      } else {
        toast.success("Classificação aplicada");
      }
      invalidate();
    },
  });

  const abrirCandidatos = async (item: ExtratoItem) => {
    setCandidatosFor(item);
    setCandidatosLive(null);
    try {
      const data = await invokeConciliar("sugestoes", { extrato_id: item.id });
      setCandidatosLive(data?.resultado?.sugestoes ?? []);
    } catch {
      // fallback: sugestões persistidas pelo motor
      setCandidatosLive(item.dados_extras?.sugestoes ?? []);
    }
  };

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const idadeDias = (item: ExtratoItem) =>
    differenceInCalendarDays(new Date(), new Date(item.data_lancamento + "T12:00:00"));

  const topSugestao = (item: ExtratoItem): Sugestao | null =>
    item.dados_extras?.sugestoes?.length ? item.dados_extras.sugestoes[0] : null;

  const saldoDisponivel = saldo?.available?.amount;

  const statusBadge = (item: ExtratoItem) => {
    const s = item.status_conciliacao || "PENDENTE";
    if (s === "PENDENTE") {
      const antiga = idadeDias(item) > 7;
      return (
        <Badge variant="outline" className={antiga ? "border-danger text-danger" : ""}>
          {antiga && <Clock className="h-3 w-3 mr-1" />}
          Pendente{antiga ? ` há ${idadeDias(item)}d` : ""}
        </Badge>
      );
    }
    if (s === "IGNORADO") return <Badge variant="secondary">Ignorado</Badge>;
    return (
      <Badge variant="secondary" className="bg-success/10 text-success border-success/30">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        {METODO_LABEL[item.metodo_conciliacao ?? "MANUAL"] ?? STATUS_LABEL[s]}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Conciliação Bancária"
        subtitle="Fila de exceções do extrato BTG — todo lançamento do extrato explicado por um registro do sistema"
        icon={<Landmark className="h-5 w-5" />}
      />

      {/* ── Filters + actions ───────────────────────────────── */}
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
          <label className="text-xs text-muted-foreground">De</label>
          <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="w-[150px]" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Até</label>
          <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="w-[150px]" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Tipo</label>
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="CREDITO">Crédito</SelectItem>
              <SelectItem value="DEBITO">Débito</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Status</label>
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="PENDENTE">Pendentes</SelectItem>
              <SelectItem value="CONCILIADO_AUTO">Conciliadas (auto)</SelectItem>
              <SelectItem value="CONCILIADO_MANUAL">Conciliadas (manual)</SelectItem>
              <SelectItem value="IGNORADO">Ignoradas</SelectItem>
              <SelectItem value="todos">Todas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => importarMutation.mutate()} disabled={importarMutation.isPending}>
          <Download className="h-4 w-4 mr-1" />
          Importar BTG
        </Button>
        {isAdmin && (
          <>
            <Button size="sm" onClick={() => executarMotorMutation.mutate()} disabled={executarMotorMutation.isPending}>
              <Sparkles className="h-4 w-4 mr-1" />
              {executarMotorMutation.isPending ? "Conciliando..." : "Rodar motor"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setRegrasOpen(true)}>
              <Settings2 className="h-4 w-4 mr-1" />
              Regras de tarifas
            </Button>
          </>
        )}
      </div>

      {btgAccessIssue && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>BTG não conectado para esta empresa</AlertTitle>
          <AlertDescription>
            {btgAccessIssue} Conecte a empresa no BTG em Configurações → Validação BTG e tente novamente.
          </AlertDescription>
        </Alert>
      )}

      {/* ── KPI Cards ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Landmark className="h-4 w-4" /> Saldo Disponível
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {saldoDisponivel != null ? fmtCurrency(saldoDisponivel) : "—"}
            </p>
            {saldo?.sandbox && <p className="text-xs text-muted-foreground mt-1 italic">Sandbox</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-success" /> Créditos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-success">{resumo ? fmtCurrency(resumo.total_credito) : "—"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-danger" /> Débitos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-danger">{resumo ? fmtCurrency(resumo.total_debito) : "—"}</p>
          </CardContent>
        </Card>

        <Card className={resumo && resumo.pendentes_antigos > 0 ? "border-danger/40" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" /> Pendentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{resumo ? resumo.total_pendente : "—"}</p>
            {resumo && resumo.pendentes_antigos > 0 && (
              <p className="text-xs text-danger mt-1 font-medium">
                {resumo.pendentes_antigos} com mais de 7 dias
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <PieChart className="h-4 w-4" /> Conciliação
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{resumo ? `${resumo.percentual_conciliado}%` : "—"}</p>
            {resumo && Object.keys(resumo.por_metodo ?? {}).length > 0 && (
              <div className="mt-1 space-y-0.5">
                {Object.entries(resumo.por_metodo).map(([metodo, count]) => (
                  <p key={metodo} className="text-xs text-muted-foreground">
                    {METODO_LABEL[metodo] ?? metodo}: {count}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Fila ────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {filtroStatus === "PENDENTE" ? "Fila de exceções" : "Lançamentos do extrato"}
            {filtroStatus === "PENDENTE" && lancamentos.length > 0 && (
              <Badge variant="secondary" className="ml-2">{lancamentos.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[90px]">Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-[110px] text-right">Valor</TableHead>
                  <TableHead className="w-[130px]">Natureza</TableHead>
                  <TableHead className="w-[130px]">Status</TableHead>
                  <TableHead>Sugestão do motor</TableHead>
                  <TableHead className="w-[280px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : lancamentos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {btgAccessIssue
                        ? "Empresa sem autenticação BTG — conecte antes de importar o extrato."
                        : filtroStatus === "PENDENTE"
                        ? "Nenhuma pendência — extrato 100% explicado. 🎉"
                        : "Nenhum lançamento encontrado."}
                    </TableCell>
                  </TableRow>
                ) : (
                  lancamentos.map((item) => {
                    const pendente = (item.status_conciliacao || "PENDENTE") === "PENDENTE";
                    const sug = topSugestao(item);
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="text-sm">
                          {format(new Date(item.data_lancamento + "T12:00:00"), "dd/MM/yy")}
                        </TableCell>
                        <TableCell className="text-sm max-w-[280px]">
                          <div className="flex items-center gap-2">
                            {item.tipo === "CREDITO" ? (
                              <ArrowDownCircle className="h-4 w-4 text-success shrink-0" />
                            ) : (
                              <ArrowUpCircle className="h-4 w-4 text-danger shrink-0" />
                            )}
                            <span className="truncate">{item.descricao}</span>
                          </div>
                        </TableCell>
                        <TableCell className={`text-sm text-right font-medium ${item.tipo === "CREDITO" ? "text-success" : "text-danger"}`}>
                          {item.tipo === "DEBITO" ? "-" : "+"}{fmtCurrency(item.valor)}
                        </TableCell>
                        <TableCell>
                          <PlanoContaSelect
                            className="h-7 text-xs w-[150px]"
                            placeholder={item.natureza || "Classificar"}
                            value={planoContas.find((c) => c.conta_descricao === item.natureza)?.conta_numero ?? null}
                            grupos={item.tipo === "DEBITO" ? GRUPOS_DEBITO : GRUPOS_CREDITO}
                            onChange={(conta) => classificarMutation.mutate({ id: item.id, natureza: conta.conta_descricao })}
                          />
                        </TableCell>
                        <TableCell>{statusBadge(item)}</TableCell>
                        <TableCell className="text-xs">
                          {pendente && sug ? (
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className="shrink-0">
                                {ALVO_LABEL[sug.alvo_tipo] ?? sug.alvo_tipo} · {sug.score}
                              </Badge>
                              <span className="text-muted-foreground truncate max-w-[220px]">{sug.motivo}</span>
                            </div>
                          ) : pendente ? (
                            <span className="text-muted-foreground">Sem candidato</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right">
                          {pendente ? (
                            <div className="flex items-center justify-end gap-1">
                              {sug && isAdmin && (
                                <Button
                                  size="sm"
                                  className="h-7"
                                  onClick={() => confirmarMutation.mutate({ item, sugestao: sug })}
                                  disabled={confirmarMutation.isPending}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                  Confirmar
                                </Button>
                              )}
                              <Button variant="outline" size="sm" className="h-7" onClick={() => abrirCandidatos(item)}>
                                <Search className="h-3.5 w-3.5 mr-1" />
                                Candidatos
                              </Button>
                              {isAdmin && (
                                <>
                                  <Button variant="ghost" size="sm" className="h-7" title="Ignorar (ex.: transferência interna)" onClick={() => setIgnorarFor(item)}>
                                    <EyeOff className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7"
                                    title="Criar lançamento a partir do extrato"
                                    onClick={() => {
                                      setCriarFor(item);
                                      setCriarDescricao(item.descricao || "");
                                    }}
                                  >
                                    <FilePlus2 className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                            </div>
                          ) : item.status_conciliacao !== "PENDENTE" && isAdmin ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7"
                              title="Desfazer conciliação"
                              onClick={() => desfazerMutation.mutate(item)}
                              disabled={desfazerMutation.isPending}
                            >
                              <Undo2 className="h-3.5 w-3.5 mr-1" />
                              Desfazer
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Breakdown por Natureza ──────────────────────────── */}
      {resumo?.por_natureza && Object.keys(resumo.por_natureza).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Breakdown por Natureza</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(resumo.por_natureza).map(([nat, info]) => (
                <div key={nat} className="p-3 rounded-lg border bg-muted/30">
                  <p className="text-xs font-medium text-muted-foreground">{nat}</p>
                  <p className={`text-lg font-bold ${info.total >= 0 ? "text-success" : "text-danger"}`}>
                    {fmtCurrency(Math.abs(info.total))}
                  </p>
                  <p className="text-xs text-muted-foreground">{info.count} lançamentos</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Dialog: candidatos ──────────────────────────────── */}
      <BaseDialog
        open={!!candidatosFor}
        onOpenChange={(o) => !o && setCandidatosFor(null)}
        title="Candidatos de conciliação"
        size="sm"
        description={
          candidatosFor
            ? `${format(new Date(candidatosFor.data_lancamento + "T12:00:00"), "dd/MM/yyyy")} · ${candidatosFor.tipo === "DEBITO" ? "-" : "+"}${fmtCurrency(candidatosFor.valor)} · ${candidatosFor.descricao}`
            : undefined
        }
      >
        {candidatosLive === null ? (
          <p className="text-sm text-muted-foreground py-4">Recalculando candidatos...</p>
        ) : candidatosLive.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            Nenhum candidato encontrado. Use "Criar lançamento" ou "Ignorar".
          </p>
        ) : (
          <div className="space-y-2">
            {candidatosLive.map((s, i) => (
              <div key={`${s.alvo_id}-${i}`} className="flex items-center justify-between gap-2 p-2 rounded-lg border">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {ALVO_LABEL[s.alvo_tipo] ?? s.alvo_tipo}
                    <Badge variant="outline" className="ml-2">score {s.score}</Badge>
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{s.motivo}</p>
                </div>
                {isAdmin && candidatosFor && (
                  <Button
                    size="sm"
                    className="shrink-0"
                    onClick={() => confirmarMutation.mutate({ item: candidatosFor, sugestao: s })}
                    disabled={confirmarMutation.isPending}
                  >
                    Confirmar
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </BaseDialog>

      {/* ── Dialog: ignorar ─────────────────────────────────── */}
      <BaseDialog
        open={!!ignorarFor}
        onOpenChange={(o) => !o && setIgnorarFor(null)}
        title="Ignorar linha do extrato"
        size="sm"
        description="Use para movimentos que não devem ser explicados pelo ledger (ex.: transferência entre contas próprias)."
        footer={
          <>
            <Button variant="outline" onClick={() => setIgnorarFor(null)}>Cancelar</Button>
            <Button
              onClick={() => ignorarFor && ignorarMutation.mutate({ item: ignorarFor, observacao: ignorarObs })}
              disabled={ignorarMutation.isPending}
            >
              Ignorar linha
            </Button>
          </>
        }
      >
        <Textarea
          placeholder="Observação (opcional)"
          value={ignorarObs}
          onChange={(e) => setIgnorarObs(e.target.value)}
        />
      </BaseDialog>

      {/* ── Dialog: criar lançamento ────────────────────────── */}
      <BaseDialog
        open={!!criarFor}
        onOpenChange={(o) => !o && setCriarFor(null)}
        title="Criar lançamento a partir do extrato"
        size="sm"
        description={
          criarFor
            ? `Lançamento BAIXADO com data e valor reais da linha: ${criarFor.tipo === "DEBITO" ? "-" : "+"}${fmtCurrency(criarFor.valor)} em ${format(new Date(criarFor.data_lancamento + "T12:00:00"), "dd/MM/yyyy")}.`
            : undefined
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setCriarFor(null)}>Cancelar</Button>
            <Button
              onClick={() =>
                criarFor && criarConta &&
                criarLancamentoMutation.mutate({ item: criarFor, conta: criarConta, descricao: criarDescricao })
              }
              disabled={criarLancamentoMutation.isPending || !criarConta}
            >
              Criar e conciliar
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Conta do plano (define o grupo DRE)</label>
            <PlanoContaSelect
              value={criarConta?.conta_numero ?? null}
              onChange={setCriarConta}
              grupos={criarFor?.tipo === "CREDITO" ? GRUPOS_CREDITO : GRUPOS_DEBITO}
            />
            {criarConta && (
              <p className="text-xs text-muted-foreground">
                Vai para o DRE como <strong>{criarConta.grupo_dre.replace(/_/g, " ")}</strong> · {criarConta.categoria.replace(/_/g, " ")}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Descrição</label>
            <Input value={criarDescricao} onChange={(e) => setCriarDescricao(e.target.value)} />
          </div>
        </div>
      </BaseDialog>

      {/* ── Dialog: regras de tarifas ───────────────────────── */}
      <ExtratoRegrasDialog open={regrasOpen} onOpenChange={setRegrasOpen} codEmpresa={codEmpresa} />
    </div>
  );
}
