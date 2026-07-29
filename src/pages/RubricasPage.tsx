// G3 — Rubricas autorizadas (lastro B — SPEC_P2_5 §3/§6)
// Cadastro prévio dos pagamentos recorrentes: favorecido exato, faixa e teto.
// Aprovação é de outro usuário (constraint no banco impede auto-aprovação).
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BookmarkCheck, Plus, Pause, Play, CheckCircle2 } from "lucide-react";
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
};

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

  const { data: rubricas = [], isLoading } = useQuery<Rubrica[]>({
    queryKey: ["rubricas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rubricas_autorizadas")
        .select("*")
        .order("status", { ascending: true })
        .order("descricao", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Rubrica[];
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
        status: "RASCUNHO",
        criado_por: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rubrica criada em rascunho — outro usuário master precisa aprová-la");
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
          throw new Error("Quem criou a rubrica não pode aprová-la — peça a outro master");
        }
        throw error;
      }
    },
    onSuccess: () => { toast.success("Rubrica ativa"); invalidate(); },
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

      <div className="flex justify-end">
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
                  <TableHead className="w-[90px] text-center">Escopo</TableHead>
                  <TableHead className="w-[100px] text-center">Status</TableHead>
                  <TableHead className="w-[180px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : rubricas.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Nenhuma rubrica. Os recorrentes (aluguel, energia, folha, impostos) entram aqui.
                  </TableCell></TableRow>
                ) : (
                  rubricas.map((r) => (
                    <TableRow key={r.id} className={r.status === "SUSPENSA" ? "opacity-50" : ""}>
                      <TableCell className="text-sm font-medium">{r.descricao}
                        <p className="text-xs text-muted-foreground">{r.conta_numero} · {r.periodicidade}</p>
                      </TableCell>
                      <TableCell className="text-sm">{r.favorecido_nome}
                        {r.favorecido_documento && <p className="text-xs text-muted-foreground">{r.favorecido_documento}</p>}
                      </TableCell>
                      <TableCell className="text-sm text-right">{fmt(r.valor_esperado)}</TableCell>
                      <TableCell className="text-sm text-center">±{r.tolerancia_pct}%</TableCell>
                      <TableCell className="text-sm text-right font-medium">{fmt(r.valor_teto)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-[10px]">
                          {r.cod_empresa == null ? "Global" : `Emp. ${r.cod_empresa}`}
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
                          <Button
                            variant="ghost" size="sm" className="h-7"
                            title={r.status === "SUSPENSA" ? "Reativar (volta a rascunho)" : "Suspender"}
                            onClick={() => toggleSuspensaMutation.mutate(r)}
                          >
                            {r.status === "SUSPENSA" ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                          </Button>
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
        onOpenChange={setDialogOpen}
        title="Nova rubrica autorizada"
        description="Nasce em rascunho; outro usuário master aprova. Pagamentos com esta rubrica só passam se o favorecido bater exatamente e o valor respeitar faixa e teto."
        footer={
          <>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => criarMutation.mutate()} disabled={criarMutation.isPending}>Criar rascunho</Button>
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
        </div>
      </BaseDialog>
    </div>
  );
}
