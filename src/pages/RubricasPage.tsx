// G3 — Rubricas autorizadas (lastro B — SPEC_P2_5 §3/§6)
// Cadastro prévio dos pagamentos recorrentes: favorecido exato, faixa e teto.
// Aprovação é de outro usuário (constraint no banco impede auto-aprovação).
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BookmarkCheck, Plus, Pause, Play, CheckCircle2, Pencil, Ban, Landmark } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresas } from "@/hooks/useEmpresas";
import { ModuleHeader } from "@/components/system/ModuleHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BaseDialog } from "@/components/system/BaseDialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { PlanoContaSelect, type PlanoConta } from "@/components/banking/PlanoContaSelect";

interface Rubrica {
  id: string;
  cod_empresa: number | null;
  descricao: string;
  favorecido_nome: string;
  favorecido_documento: string | null;
  favorecido_chave: string | null;
  favorecido_banco?: string | null;
  favorecido_agencia?: string | null;
  favorecido_conta?: string | null;
  favorecido_tipo_conta?: string | null;
  forma_pagamento?: string | null;
  folha_evento?: string | null;
  dia_vencimento?: number | null;
  // Opcional porque os tipos gerados do Supabase só ganham a coluna depois que
  // a migration 20260805190000 for aplicada.
  cancelamento_motivo?: string | null;
  conta_numero: string;
  periodicidade: string;
  valor_esperado: number | null;
  tolerancia_pct: number;
  valor_teto: number;
  status: string;
  criado_por: string;
  aprovado_por: string | null;
}

const STATUS_CLS: Record<string, string> = {
  ATIVA: "bg-success/10 text-success border-success/30",
  RASCUNHO: "bg-warning/10 text-warning border-warning/30",
  SUSPENSA: "bg-muted text-muted-foreground",
  CANCELADA: "bg-destructive/10 text-destructive border-destructive/30",
};

/** Resumo de como a rubrica paga, para caber numa célula. */
function comoPaga(r: Rubrica): string {
  const conta = [r.favorecido_banco, r.favorecido_agencia, r.favorecido_conta].filter(Boolean);
  if (conta.length === 3) {
    const forma = r.forma_pagamento === "TED" ? "TED" : "PIX";
    return `${forma} · ${r.favorecido_banco}/${r.favorecido_agencia}/${r.favorecido_conta}`;
  }
  if (r.favorecido_chave) return `PIX · ${r.favorecido_chave}`;
  return "—";
}

export default function RubricasPage() {
  const { empresas } = useEmpresas();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [fDescricao, setFDescricao] = useState("");
  const [fFavorecido, setFFavorecido] = useState("");
  const [fDocumento, setFDocumento] = useState("");
  const [fChave, setFChave] = useState("");
  const [fConta, setFConta] = useState<PlanoConta | null>(null);
  const [fPeriodicidade, setFPeriodicidade] = useState("MENSAL");
  const [fEsperado, setFEsperado] = useState("");
  const [fTolerancia, setFTolerancia] = useState("10");
  const [fTeto, setFTeto] = useState("");
  const [fEmpresa, setFEmpresa] = useState<string>("global");
  const [fDiaVenc, setFDiaVenc] = useState("10");
  // Dados bancários: estavam salvos no banco desde a folha, mas a tela não
  // mostrava nem deixava corrigir — conta trocada era motivo para recriar tudo.
  const [fBanco, setFBanco] = useState("");
  const [fAgencia, setFAgencia] = useState("");
  const [fConta2, setFConta2] = useState("");
  const [fTipoConta, setFTipoConta] = useState("CC");
  const [fForma, setFForma] = useState("PIX_MANUAL");
  /** Rubrica sendo editada; null = criando uma nova. */
  const [editando, setEditando] = useState<Rubrica | null>(null);
  const [cancelando, setCancelando] = useState<Rubrica | null>(null);
  const [motivoCancel, setMotivoCancel] = useState("");

  const { data: rubricas = [], isLoading } = useQuery<Rubrica[]>({
    queryKey: ["rubricas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rubricas_autorizadas")
        .select("*")
        .order("status", { ascending: true })
        .order("descricao", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Rubrica[];
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["rubricas"] });

  const criarMutation = useMutation({
    mutationFn: async () => {
      if (!fDescricao.trim() || !fFavorecido.trim()) throw new Error("Descrição e favorecido são obrigatórios");
      if (!fConta) throw new Error("Selecione a conta do plano");
      if (!fTeto || Number(fTeto) <= 0) throw new Error("Informe o valor teto");
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("rubricas_autorizadas").insert({
        cod_empresa: fEmpresa === "global" ? null : Number(fEmpresa),
        descricao: fDescricao.trim(),
        favorecido_nome: fFavorecido.trim(),
        favorecido_documento: fDocumento.trim() || null,
        favorecido_chave: fChave.trim() || null,
        conta_numero: fConta.conta_numero,
        periodicidade: fPeriodicidade,
        valor_esperado: fEsperado ? Number(fEsperado) : null,
        tolerancia_pct: Number(fTolerancia) || 10,
        valor_teto: Number(fTeto),
        dia_vencimento: Math.min(28, Math.max(1, Number(fDiaVenc) || 10)),
        status: "RASCUNHO",
        criado_por: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rubrica criada em rascunho — outro admin precisa aprová-la");
      setDialogOpen(false);
      setFDescricao(""); setFFavorecido(""); setFDocumento(""); setFChave(""); setFConta(null);
      setFEsperado(""); setFTeto("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const aprovarMutation = useMutation({
    mutationFn: async (r: Rubrica) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("rubricas_autorizadas")
        .update({ status: "ATIVA", aprovado_por: user?.id, aprovado_em: new Date().toISOString() })
        .eq("id", r.id);
      if (error) {
        if (error.message.includes("chk_rubrica_criador_aprovador")) {
          throw new Error("Quem criou a rubrica não pode aprová-la — peça a outro admin");
        }
        throw error;
      }
    },
    onSuccess: () => { toast.success("Rubrica ativa"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const sugerirMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Sessão expirada");
      const { data, error } = await supabase.functions.invoke("financeiro-lancamentos", {
        body: { action: "sugerir_rubricas" },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      return data as { sugeridas?: number; grupos_analisados?: number };
    },
    onSuccess: (data) => {
      toast.success(
        (data?.sugeridas ?? 0) > 0
          ? `${data.sugeridas} rubrica(s) sugeridas do histórico (rascunho) — revise valores/tetos e aprove com outro usuário`
          : "Nenhuma recorrência nova encontrada no histórico (12 meses)"
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const provisionarMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("sync-ledger", {
        body: { mode: "provisionar" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      return data as { rubricas?: number; provisionados?: number };
    },
    onSuccess: (data) => {
      toast.success(`${data?.rubricas ?? 0} rubrica(s) ativas — provisões dos próximos 12 meses garantidas no Contas a Pagar e no Fluxo de Caixa`);
      queryClient.invalidateQueries({ queryKey: ["mesa-aprovacao"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Chamada às actions da edge function, com o JWT do usuário. */
  const invocar = async (action: string, params: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Sessão expirada");
    const { data, error } = await supabase.functions.invoke("financeiro-lancamentos", {
      body: { action, ...params },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (error) throw error;
    if (data?.ok === false) throw new Error(String(data.error));
    if (data?.error) throw new Error(String(data.error));
    return data;
  };

  const limparForm = () => {
    setFDescricao(""); setFFavorecido(""); setFDocumento(""); setFChave(""); setFConta(null);
    setFEsperado(""); setFTeto(""); setFTolerancia("10"); setFDiaVenc("10"); setFEmpresa("global");
    setFBanco(""); setFAgencia(""); setFConta2(""); setFTipoConta("CC"); setFForma("PIX_MANUAL");
  };

  const abrirEdicao = (r: Rubrica) => {
    setEditando(r);
    setFDescricao(r.descricao);
    setFFavorecido(r.favorecido_nome);
    setFDocumento(r.favorecido_documento ?? "");
    setFChave(r.favorecido_chave ?? "");
    setFConta({ conta_numero: r.conta_numero, conta_descricao: "", grupo_dre: "", categoria: "" });
    setFPeriodicidade(r.periodicidade);
    setFEsperado(r.valor_esperado != null ? String(r.valor_esperado) : "");
    setFTolerancia(String(r.tolerancia_pct));
    setFTeto(String(r.valor_teto));
    setFEmpresa(r.cod_empresa == null ? "global" : String(r.cod_empresa));
    setFDiaVenc(String(r.dia_vencimento ?? 10));
    setFBanco(r.favorecido_banco ?? "");
    setFAgencia(r.favorecido_agencia ?? "");
    setFConta2(r.favorecido_conta ?? "");
    setFTipoConta(r.favorecido_tipo_conta ?? "CC");
    setFForma(r.forma_pagamento ?? "PIX_MANUAL");
    setDialogOpen(true);
  };

  const editarMutation = useMutation({
    mutationFn: () => {
      if (!editando) throw new Error("Nenhuma rubrica em edição");
      return invocar("editar_rubrica", {
        rubrica_id: editando.id,
        descricao: fDescricao.trim(),
        conta_numero: fConta?.conta_numero,
        periodicidade: fPeriodicidade,
        dia_vencimento: Number(fDiaVenc) || null,
        favorecido_nome: fFavorecido.trim(),
        favorecido_documento: fDocumento.trim() || null,
        favorecido_chave: fChave.trim() || null,
        favorecido_banco: fBanco.trim() || null,
        favorecido_agencia: fAgencia.trim() || null,
        favorecido_conta: fConta2.trim() || null,
        favorecido_tipo_conta: fTipoConta,
        forma_pagamento: fForma,
        valor_esperado: fEsperado === "" ? null : Number(fEsperado),
        tolerancia_pct: Number(fTolerancia),
        valor_teto: Number(fTeto),
      });
    },
    onSuccess: (d: { alterados?: string[]; exige_reaprovacao?: boolean }) => {
      toast.success(
        d?.exige_reaprovacao
          ? `Alterado (${(d.alterados || []).join(", ")}). Como mexeu em valor ou destino, a rubrica voltou para rascunho e precisa ser aprovada de novo.`
          : `Alterado: ${(d?.alterados || []).join(", ")}`,
      );
      setDialogOpen(false); setEditando(null); limparForm(); invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelarMutation = useMutation({
    mutationFn: () => invocar("cancelar_rubrica", {
      rubrica_id: cancelando?.id,
      motivo: motivoCancel.trim(),
    }),
    onSuccess: () => {
      toast.success("Rubrica cancelada — o histórico dos pagamentos continua apontando para ela");
      setCancelando(null); setMotivoCancel(""); invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleSuspensaMutation = useMutation({
    mutationFn: async (r: Rubrica) => {
      const { error } = await supabase
        .from("rubricas_autorizadas")
        .update({ status: r.status === "SUSPENSA" ? "RASCUNHO" : "SUSPENSA" })
        .eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const fmt = (v: number | null) =>
    v != null ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v) : "—";

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Rubricas Autorizadas"
        subtitle="Pagamentos recorrentes pré-aprovados: favorecido exato, faixa de tolerância e teto — mudar chave/teto exige re-aprovação"
        icon={<BookmarkCheck className="h-5 w-5" />}
      />

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => sugerirMutation.mutate()}
          disabled={sugerirMutation.isPending}
          title="Minera 12 meses do ledger (ERP + manuais): favorecido+conta com recorrência mensal viram rascunhos com valor mediano, dia de vencimento e a MESMA conta contábil do ERP"
        >
          {sugerirMutation.isPending ? "Minerando..." : "Sugerir do histórico"}
        </Button>
        <Button
          variant="outline"
          onClick={() => provisionarMutation.mutate()}
          disabled={provisionarMutation.isPending}
          title="Gera os lançamentos PREVISTO dos próximos 12 meses para todas as rubricas ativas (idempotente — rodar de novo não duplica)"
        >
          {provisionarMutation.isPending ? "Provisionando..." : "Provisionar 12 meses"}
        </Button>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Nova rubrica
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Favorecido</TableHead>
                  <TableHead className="w-[110px] text-right">Esperado</TableHead>
                  <TableHead className="w-[80px] text-center">Tol.</TableHead>
                  <TableHead className="w-[110px] text-right">Teto</TableHead>
                  <TableHead className="w-[190px]">Como paga</TableHead>
                  <TableHead className="w-[90px] text-center">Escopo</TableHead>
                  <TableHead className="w-[100px] text-center">Status</TableHead>
                  <TableHead className="w-[180px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : rubricas.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    Nenhuma rubrica. Os recorrentes (aluguel, energia, folha, impostos) entram aqui.
                  </TableCell></TableRow>
                ) : (
                  rubricas.map((r) => (
                    <TableRow key={r.id} className={["SUSPENSA", "CANCELADA"].includes(r.status) ? "opacity-50" : ""}>
                      <TableCell className="text-sm font-medium">{r.descricao}
                        <p className="text-xs text-muted-foreground">{r.conta_numero} · {r.periodicidade}</p>
                      </TableCell>
                      <TableCell className="text-sm">{r.favorecido_nome}
                        {r.favorecido_documento && <p className="text-xs text-muted-foreground">{r.favorecido_documento}</p>}
                      </TableCell>
                      <TableCell className="text-sm text-right">{fmt(r.valor_esperado)}</TableCell>
                      <TableCell className="text-sm text-center">±{r.tolerancia_pct}%</TableCell>
                      <TableCell className="text-sm text-right font-medium">{fmt(r.valor_teto)}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{comoPaga(r)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-[10px]">
                          {r.cod_empresa == null
                            ? "Global"
                            : ((empresas || []).find((e) => e.codEmpresa === r.cod_empresa)?.nome || `Emp. ${r.cod_empresa}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={STATUS_CLS[r.status] ?? ""}>{r.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {r.status === "RASCUNHO" && (
                            <Button size="sm" className="h-7" onClick={() => aprovarMutation.mutate(r)} disabled={aprovarMutation.isPending}>
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Aprovar
                            </Button>
                          )}
                          {r.status !== "CANCELADA" && (
                            <>
                              <Button
                                variant="ghost" size="sm" className="h-7"
                                title="Editar — mexer em valor, faixa, teto ou destino devolve a rubrica a rascunho"
                                onClick={() => abrirEdicao(r)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost" size="sm" className="h-7"
                                title={r.status === "SUSPENSA" ? "Reativar (volta a rascunho)" : "Suspender"}
                                onClick={() => toggleSuspensaMutation.mutate(r)}
                              >
                                {r.status === "SUSPENSA" ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                              </Button>
                              <Button
                                variant="ghost" size="sm" className="h-7 text-destructive"
                                title="Cancelar — definitivo, mas o histórico dos pagamentos continua apontando para ela"
                                onClick={() => { setCancelando(r); setMotivoCancel(""); }}
                              >
                                <Ban className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <BaseDialog
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditando(null); limparForm(); } }}
        title={editando ? `Editar rubrica — ${editando.descricao}` : "Nova rubrica autorizada"}
        description={editando
          ? "Mexer em favorecido, valor esperado, tolerância, teto ou destino do dinheiro devolve a rubrica para rascunho: ela precisa ser aprovada de novo, por outra pessoa. Descrição e dia de vencimento não alteram o risco e mantêm a rubrica ativa. Toda alteração fica registrada."
          : "Rubrica é para gasto RECORRENTE (aluguel, energia, vale transporte...): cadastra uma vez, fica salva e cobre todos os meses. Gasto único e urgente não vira rubrica — lance no Contas a Pagar como Exceção emergencial, que vale só para aquele lançamento. Nasce em rascunho; outro admin aprova. Pagamentos só passam se o favorecido bater exatamente e o valor respeitar faixa e teto."}
        footer={
          <>
            <Button variant="outline" onClick={() => { setDialogOpen(false); setEditando(null); limparForm(); }}>
              Fechar
            </Button>
            {editando ? (
              <Button onClick={() => editarMutation.mutate()} disabled={editarMutation.isPending}>
                Salvar alterações
              </Button>
            ) : (
              <Button onClick={() => criarMutation.mutate()} disabled={criarMutation.isPending}>Criar rascunho</Button>
            )}
          </>
        }
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs text-muted-foreground">Descrição</label>
            <Input value={fDescricao} onChange={(e) => setFDescricao(e.target.value)} placeholder="ex.: Aluguel loja Centro" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Favorecido</label>
            <Input value={fFavorecido} onChange={(e) => setFFavorecido(e.target.value)} placeholder="Nome/razão social" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">CNPJ/CPF do favorecido</label>
            <Input value={fDocumento} onChange={(e) => setFDocumento(e.target.value)} placeholder="obrigatório p/ PIX/TED" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs text-muted-foreground">Chave PIX / conta (exata)</label>
            <Input value={fChave} onChange={(e) => setFChave(e.target.value)} placeholder="mudou a chave = re-aprovação" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs text-muted-foreground">Conta do plano (grupo DRE)</label>
            <PlanoContaSelect value={fConta?.conta_numero ?? null} onChange={setFConta} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Periodicidade</label>
            <Select value={fPeriodicidade} onValueChange={setFPeriodicidade}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MENSAL">Mensal</SelectItem>
                <SelectItem value="SEMANAL">Semanal</SelectItem>
                <SelectItem value="ANUAL">Anual</SelectItem>
                <SelectItem value="AVULSA_RECORRENTE">Avulsa recorrente</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Escopo</label>
            <Select value={fEmpresa} onValueChange={setFEmpresa}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Todas as lojas</SelectItem>
                {(empresas || []).map((e) => (
                  <SelectItem key={e.codEmpresa} value={String(e.codEmpresa)}>{e.nome || `Empresa ${e.codEmpresa}`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Valor esperado (R$)</label>
            <Input type="number" value={fEsperado} onChange={(e) => setFEsperado(e.target.value)} placeholder="vazio = só teto" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Tolerância (±%)</label>
            <Input type="number" value={fTolerancia} onChange={(e) => setFTolerancia(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Teto (R$) — nunca passa acima</label>
            <Input type="number" value={fTeto} onChange={(e) => setFTeto(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Dia do vencimento (1–28)</label>
            <Input type="number" min={1} max={28} value={fDiaVenc} onChange={(e) => setFDiaVenc(e.target.value)} />
          </div>

          {/* Dados bancários: já eram gravados pela folha, mas ficavam invisíveis
              e intocáveis. Conta trocada obrigava a recriar a rubrica inteira. */}
          <div className="md:col-span-2 pt-2 border-t">
            <p className="text-xs font-medium flex items-center gap-1.5 mb-2">
              <Landmark className="h-3.5 w-3.5" /> Para onde o dinheiro vai
            </p>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Forma</label>
                <Select value={fForma} onValueChange={setFForma}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PIX_MANUAL">PIX (dados bancários)</SelectItem>
                    <SelectItem value="PIX_KEY">PIX (chave)</SelectItem>
                    <SelectItem value="TED">TED</SelectItem>
                    <SelectItem value="BANKSLIP">Boleto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Banco</label>
                <Input value={fBanco} onChange={(e) => setFBanco(e.target.value)} placeholder="208" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Agência</label>
                <Input value={fAgencia} onChange={(e) => setFAgencia(e.target.value)} placeholder="0050" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Conta</label>
                <Input value={fConta2} onChange={(e) => setFConta2(e.target.value)} placeholder="008792899" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Tipo de conta</label>
                <Select value={fTipoConta} onValueChange={setFTipoConta}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CC">Corrente</SelectItem>
                    <SelectItem value="PP">Poupança</SelectItem>
                    <SelectItem value="PG">Pagamento / salário</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="md:col-span-3 text-xs text-muted-foreground self-end">
                Banco, agência e conta juntos permitem pagar por Pix sem o favorecido ter chave
                cadastrada. É assim que a folha é paga hoje.
              </p>
            </div>
          </div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={!!cancelando}
        onOpenChange={(open) => { if (!open) { setCancelando(null); setMotivoCancel(""); } }}
        title={`Cancelar rubrica — ${cancelando?.descricao ?? ""}`}
        description="Cancelar é definitivo: a rubrica sai de circulação e não volta. Nada é apagado — o histórico de pagamentos continua apontando para ela, senão o DRE perderia a referência do que autorizou cada despesa. Se a intenção é só parar por um tempo, use Suspender."
        footer={
          <>
            <Button variant="outline" onClick={() => { setCancelando(null); setMotivoCancel(""); }}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelarMutation.mutate()}
              disabled={cancelarMutation.isPending || motivoCancel.trim().length < 10}
            >
              Cancelar rubrica
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">
            Motivo (mínimo 10 caracteres) — fica registrado com seu usuário e a data
          </label>
          <Input
            value={motivoCancel}
            onChange={(e) => setMotivoCancel(e.target.value)}
            placeholder="ex.: Colaboradora desligada em 05/08/2026"
          />
          <p className="text-xs text-muted-foreground">
            Se houver título em aberto usando esta rubrica, o cancelamento é recusado — o lançamento
            ficaria sem lastro no meio do caminho. Pague ou cancele esses títulos antes.
          </p>
        </div>
      </BaseDialog>
    </div>
  );
}
