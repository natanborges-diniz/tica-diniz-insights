// Crediário Loja (SPEC_CREDIARIO_LOJA.md)
// Financeiro (admin): registra a liberação do CPF consultado — valores,
// parcelas e 1º vencimento TRAVADOS. Loja: vê os CPFs liberados da sua loja e
// só DISPARA a emissão; os boletos saem no BTG exatamente como aprovados e
// voltam aqui (linha digitável + PDF). Impressão é decisão do financeiro.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { FileText, Plus, Send, Copy, Printer, Ban, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresas } from "@/hooks/useEmpresas";
import { useDefaultEmpresa } from "@/hooks/useDefaultEmpresa";
import { ModuleHeader } from "@/components/system/ModuleHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BaseDialog } from "@/components/system/BaseDialog";
import { toast } from "sonner";

interface Liberacao {
  id: string;
  cod_empresa: number;
  cpf: string;
  cliente_nome: string;
  valor_total: number;
  parcelas: number;
  valor_parcela: number;
  primeiro_vencimento: string;
  validade: string | null;
  status: string;
  observacao: string | null;
  imprimir: boolean;
  impresso_em: string | null;
  disparado_em: string | null;
}

interface Boleto {
  id: string;
  liberacao_id: string;
  parcela_numero: number | null;
  valor: number;
  data_vencimento: string;
  linha_digitavel: string | null;
  url_boleto: string | null;
  status: string;
}

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  LIBERADO: { label: "Liberado — aguardando disparo", cls: "bg-primary/10 text-primary border-primary/30" },
  BOLETOS_EMITIDOS: { label: "Boletos emitidos", cls: "bg-success/10 text-success border-success/30" },
  BOLETOS_PARCIAL: { label: "Emissão parcial — reenviar", cls: "bg-warning/10 text-warning border-warning/30" },
  CANCELADO: { label: "Cancelado", cls: "bg-destructive/10 text-destructive border-destructive/30" },
};

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const fmtCpf = (c: string) => c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
const fmtData = (d: string) => format(new Date(d + "T12:00:00"), "dd/MM/yyyy");

export default function CrediarioLojaPage() {
  const { empresas } = useEmpresas();
  const { isAdmin } = useDefaultEmpresa();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [fEmpresa, setFEmpresa] = useState("");
  const [fCpf, setFCpf] = useState("");
  const [fNome, setFNome] = useState("");
  const [fTotal, setFTotal] = useState("");
  const [fParcelas, setFParcelas] = useState("1");
  const [fPrimeiroVenc, setFPrimeiroVenc] = useState("");
  const [fValidade, setFValidade] = useState("");
  const [fImprimir, setFImprimir] = useState(false);
  const [fObs, setFObs] = useState("");

  const invoke = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("Sessão expirada — faça login novamente");
    const { data, error } = await supabase.functions.invoke("btg-cobrancas", {
      body: { action, ...extra },
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error) throw error;
    if (data?.error) throw new Error(String(data.error));
    return data;
  };

  const { data, isLoading } = useQuery<{ liberacoes: Liberacao[]; boletos: Record<string, Boleto[]> }>({
    queryKey: ["crediario-liberacoes"],
    queryFn: () => invoke("listar_liberacoes"),
    refetchInterval: 60000,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["crediario-liberacoes"] });

  // Parcela derivada — o financeiro digita total + nº de parcelas
  const valorParcela = (() => {
    const t = Number(fTotal.replace(",", "."));
    const n = Number(fParcelas);
    return t > 0 && n >= 1 ? Math.round((t / n) * 100) / 100 : 0;
  })();

  const liberarMutation = useMutation({
    mutationFn: () => invoke("liberar_cpf", {
      cod_empresa: Number(fEmpresa),
      cpf: fCpf,
      cliente_nome: fNome,
      valor_total: Number(fTotal.replace(",", ".")),
      parcelas: Number(fParcelas),
      valor_parcela: valorParcela,
      primeiro_vencimento: fPrimeiroVenc,
      validade: fValidade || null,
      imprimir: fImprimir,
      observacao: fObs || null,
    }),
    onSuccess: () => {
      toast.success("CPF liberado — a loja já pode disparar os boletos");
      setDialogOpen(false);
      setFCpf(""); setFNome(""); setFTotal(""); setFParcelas("1"); setFPrimeiroVenc(""); setFValidade(""); setFObs(""); setFImprimir(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dispararMutation = useMutation({
    mutationFn: (id: string) => invoke("disparar_boletos", { liberacao_id: id }),
    onSuccess: (r: { ok: boolean; emitidos_agora: number; falhas: unknown[] }) => {
      if (r.ok) toast.success(`${r.emitidos_agora} boleto(s) emitido(s) no BTG`);
      else toast.warning(`Emissão parcial: ${r.emitidos_agora} ok, ${r.falhas.length} falha(s) — dispare novamente para completar`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelarMutation = useMutation({
    mutationFn: (id: string) => invoke("cancelar_liberacao", { liberacao_id: id }),
    onSuccess: (r: { aviso?: string }) => { toast.success("Liberação cancelada"); if (r.aviso) toast.warning(r.aviso); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const impressaoMutation = useMutation({
    mutationFn: (args: { id: string; impresso?: boolean; imprimir?: boolean }) =>
      invoke("marcar_impressao", { liberacao_id: args.id, impresso: args.impresso, imprimir: args.imprimir }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const nomeLoja = (cod: number) =>
    (empresas || []).find((e) => e.codEmpresa === cod)?.nome || `Empresa ${cod}`;

  const copiar = (texto: string) => {
    navigator.clipboard.writeText(texto);
    toast.success("Linha digitável copiada");
  };

  const liberacoes = data?.liberacoes ?? [];

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Crediário Loja"
        subtitle="Financeiro libera o CPF consultado (valores e parcelas travados); a loja só dispara — os boletos saem no BTG exatamente como aprovados."
        icon={<FileText className="h-5 w-5" />}
      />

      {isAdmin && (
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Liberar CPF consultado
        </Button>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
      ) : liberacoes.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nenhuma liberação ainda. {isAdmin ? "Registre a primeira consulta aprovada." : "Quando o financeiro liberar um CPF para sua loja, ele aparece aqui."}
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {liberacoes.map((l) => {
            const cfg = STATUS_CFG[l.status] ?? STATUS_CFG.LIBERADO;
            const boletos = data?.boletos?.[l.id] ?? [];
            return (
              <Card key={l.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex flex-wrap items-center gap-2">
                    {l.cliente_nome}
                    <span className="text-muted-foreground font-normal">{fmtCpf(l.cpf)} · {nomeLoja(l.cod_empresa)}</span>
                    <Badge variant="outline" className={`ml-auto ${cfg.cls}`}>{cfg.label}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm">
                    <span className="font-bold">{fmt(Number(l.valor_total))}</span>
                    {" em "}<span className="font-medium">{l.parcelas}× {fmt(Number(l.valor_parcela))}</span>
                    {" · 1º venc. "}{fmtData(l.primeiro_vencimento)}
                    {l.validade && <span className="text-muted-foreground"> · liberação válida até {fmtData(l.validade)}</span>}
                    {l.imprimir && (
                      <Badge variant="outline" className="ml-2 text-warning border-warning/40">
                        <Printer className="h-3 w-3 mr-1" />
                        {l.impresso_em ? "Impresso" : "Imprimir no financeiro"}
                      </Badge>
                    )}
                  </p>
                  {l.observacao && <p className="text-xs text-muted-foreground italic">{l.observacao}</p>}

                  {(l.status === "LIBERADO" || l.status === "BOLETOS_PARCIAL") && (
                    <Button
                      disabled={dispararMutation.isPending}
                      onClick={() => dispararMutation.mutate(l.id)}
                    >
                      <Send className="h-4 w-4 mr-1" />
                      {l.status === "BOLETOS_PARCIAL" ? "Completar emissão" : `Gerar ${l.parcelas} boleto(s) no BTG`}
                    </Button>
                  )}

                  {boletos.length > 0 && (
                    <div className="space-y-1.5">
                      {boletos.map((b) => (
                        <div key={b.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
                          <Badge variant="secondary" className="shrink-0">{b.parcela_numero ?? "—"}/{l.parcelas}</Badge>
                          <span className="font-medium">{fmt(Number(b.valor))}</span>
                          <span className="text-muted-foreground">venc. {fmtData(b.data_vencimento)}</span>
                          <Badge variant="outline" className="text-[10px]">{b.status}</Badge>
                          <span className="ml-auto flex items-center gap-1">
                            {b.linha_digitavel && (
                              <Button size="sm" variant="outline" className="h-7" onClick={() => copiar(b.linha_digitavel!)}>
                                <Copy className="h-3.5 w-3.5 mr-1" /> Linha digitável
                              </Button>
                            )}
                            {b.url_boleto && (
                              <a href={b.url_boleto} target="_blank" rel="noreferrer">
                                <Button size="sm" variant="outline" className="h-7">
                                  <FileText className="h-3.5 w-3.5 mr-1" /> PDF
                                </Button>
                              </a>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {isAdmin && (
                    <div className="flex gap-2 pt-1">
                      {l.imprimir && !l.impresso_em && boletos.length > 0 && (
                        <Button size="sm" variant="outline" onClick={() => impressaoMutation.mutate({ id: l.id, impresso: true })}>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Marcar como impresso
                        </Button>
                      )}
                      {l.status !== "CANCELADO" && (
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => cancelarMutation.mutate(l.id)}>
                          <Ban className="h-3.5 w-3.5 mr-1" /> Cancelar liberação
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <BaseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Liberar CPF consultado"
        description="Registre exatamente o que foi aprovado na consulta: a loja não poderá alterar nada — só disparar a emissão."
        footer={
          <>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => liberarMutation.mutate()}
              disabled={liberarMutation.isPending || !fEmpresa || !fCpf || !fNome || !fTotal || !fPrimeiroVenc}
            >
              Liberar
            </Button>
          </>
        }
      >
        <div className="grid gap-3 py-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Loja</Label>
            <Select value={fEmpresa} onValueChange={setFEmpresa}>
              <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent>
                {(empresas || []).map((e) => (
                  <SelectItem key={e.codEmpresa} value={String(e.codEmpresa)}>{e.nome || `Empresa ${e.codEmpresa}`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>CPF do cliente</Label>
            <Input value={fCpf} onChange={(e) => setFCpf(e.target.value)} placeholder="000.000.000-00" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Nome do cliente</Label>
            <Input value={fNome} onChange={(e) => setFNome(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Valor total aprovado (R$)</Label>
            <Input type="number" value={fTotal} onChange={(e) => setFTotal(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Parcelas</Label>
            <Input type="number" min={1} max={36} value={fParcelas} onChange={(e) => setFParcelas(e.target.value)} />
            {valorParcela > 0 && (
              <p className="text-xs text-muted-foreground">{fParcelas}× de {fmt(valorParcela)}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label>1º vencimento</Label>
            <Input type="date" value={fPrimeiroVenc} onChange={(e) => setFPrimeiroVenc(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Liberação válida até (opcional)</Label>
            <Input type="date" value={fValidade} onChange={(e) => setFValidade(e.target.value)} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Observação (opcional)</Label>
            <Input value={fObs} onChange={(e) => setFObs(e.target.value)} placeholder="Ex.: consulta SPC ok, entrada de R$ 100 no ato" />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={fImprimir} onChange={(e) => setFImprimir(e.target.checked)} />
            Precisa de impressão no setor financeiro
          </label>
        </div>
      </BaseDialog>
    </div>
  );
}
