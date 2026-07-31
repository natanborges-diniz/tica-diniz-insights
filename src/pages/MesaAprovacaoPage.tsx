// G3 — Mesa de Aprovação (SPEC_P2_5_GOVERNANCA_PAGAMENTOS.md §4/§5)
// Tela única do master: todo pagamento pendente com selo de lastro.
// 🟢 nota/título · 🔵 rubrica na faixa · 🟡 fora da faixa (decidir) ·
// 🔴 exceção (aprovação individual, fora do borderô) · SEM LASTRO (resolver).
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ShieldCheck, CheckCircle2, AlertTriangle, FileCheck2, Landmark, Package,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresas } from "@/hooks/useEmpresas";
import { useDefaultEmpresa } from "@/hooks/useDefaultEmpresa";
import { ModuleHeader } from "@/components/system/ModuleHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

interface LancMesa {
  id: string;
  cod_empresa: number;
  descricao: string | null;
  pessoa_nome: string | null;
  valor: number;
  data_vencimento: string | null;
  status: string;
  natureza: string | null;
  lastro: string | null;
  justificativa: string | null;
  bordero_id: string | null;
  selo: string;
  selo_motivo: string;
  desvio_pct: number | null;
  rubrica_descricao: string | null;
}

interface BorderoMesa {
  id: string;
  descricao: string | null;
  status: string;
  qtd_lancamentos: number;
  total_valor: number;
  selos: Record<string, number>;
}

interface DdaSemEntrada {
  id: string;
  emissor: string | null;
  documento_emissor: string | null;
  valor: number;
  data_vencimento: string | null;
  banco_emissor: string | null;
}

interface MesaData {
  lancamentos: LancMesa[];
  borderos: BorderoMesa[];
  resumo_selos: Record<string, number>;
  dda_sem_entrada?: DdaSemEntrada[];
}

const SELO_CFG: Record<string, { label: string; cls: string }> = {
  VERDE: { label: "Nota / título", cls: "bg-success/10 text-success border-success/30" },
  AZUL: { label: "Rubrica na faixa", cls: "bg-primary/10 text-primary border-primary/30" },
  AMARELO: { label: "Fora da faixa", cls: "bg-warning/10 text-warning border-warning/30" },
  VERMELHO: { label: "Exceção", cls: "bg-danger/10 text-danger border-danger/30" },
  SEM_LASTRO: { label: "Sem lastro", cls: "bg-muted text-muted-foreground" },
};

const ORDEM_SELOS = ["SEM_LASTRO", "VERMELHO", "AMARELO", "AZUL", "VERDE"];

export default function MesaAprovacaoPage() {
  const { empresas } = useEmpresas();
  const { codEmpresa: codEmpresaDefault, isAdmin } = useDefaultEmpresa();
  const queryClient = useQueryClient();

  const [codEmpresa, setCodEmpresa] = useState<number>(codEmpresaDefault || 1);
  const [filtroSelo, setFiltroSelo] = useState<string>("todos");

  const invokeAction = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("Sessão expirada — faça login novamente");
    const { data, error } = await supabase.functions.invoke("financeiro-lancamentos", {
      body: { action, ...extra },
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error) throw error;
    if (data?.error) throw new Error(String(data.error));
    return data;
  };

  const { data: mesa, isLoading } = useQuery<MesaData>({
    queryKey: ["mesa-aprovacao", codEmpresa],
    queryFn: () => invokeAction("mesa_aprovacao", { cod_empresa: codEmpresa }),
    refetchInterval: 60000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["mesa-aprovacao"] });

  const aprovarBorderoMutation = useMutation({
    mutationFn: (borderoId: string) => invokeAction("aprovar_bordero", { bordero_id: borderoId }),
    onSuccess: () => { toast.success("Borderô aprovado — confirme o envio no fluxo de Contas a Pagar e a autorização final no app BTG"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const aprovarExcecaoMutation = useMutation({
    mutationFn: (id: string) => invokeAction("aprovar_excecao", { id }),
    onSuccess: () => { toast.success("Exceção aprovada — executar como pagamento avulso BTG"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const lancamentos = (mesa?.lancamentos ?? []).filter((l) => filtroSelo === "todos" || l.selo === filtroSelo);
  const excecoesPendentes = (mesa?.lancamentos ?? []).filter((l) => l.selo === "VERMELHO" && l.status !== "AUTORIZADO");

  const seloBadge = (l: LancMesa) => {
    const cfg = SELO_CFG[l.selo] ?? SELO_CFG.SEM_LASTRO;
    return (
      <Badge variant="outline" className={cfg.cls}>
        {cfg.label}{l.desvio_pct != null ? ` ${l.desvio_pct > 0 ? "+" : ""}${l.desvio_pct}%` : ""}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Mesa de Aprovação"
        subtitle="Só o que precisa de você: fora da faixa (amarelo), exceções (vermelho) e sem lastro. O que está no lastro (verde/azul) segue sozinho."
        icon={<ShieldCheck className="h-5 w-5" />}
      />

      {/* Filtros */}
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
        <div className="flex items-end gap-1.5 flex-wrap">
          <Button variant={filtroSelo === "todos" ? "default" : "outline"} size="sm" onClick={() => setFiltroSelo("todos")}>
            Todos {mesa ? `(${mesa.lancamentos.length})` : ""}
          </Button>
          {ORDEM_SELOS.map((s) => (
            <Button key={s} variant={filtroSelo === s ? "default" : "outline"} size="sm" onClick={() => setFiltroSelo(s)}>
              {SELO_CFG[s].label} ({mesa?.resumo_selos?.[s] ?? 0})
            </Button>
          ))}
        </div>
      </div>

      {/* Cobranças chegando sem entrada no ERP (DDA órfão) */}
      {(mesa?.dda_sem_entrada ?? []).length > 0 && (
        <Card className="border-warning/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-warning">
              <AlertTriangle className="h-4 w-4" />
              Cobranças no banco sem entrada no ERP ({mesa!.dda_sem_entrada!.length}) — provável nota sem lançamento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {mesa!.dda_sem_entrada!.map((d) => {
              const vencido = d.data_vencimento && d.data_vencimento < new Date().toISOString().slice(0, 10);
              return (
                <div key={d.id} className="flex items-center justify-between gap-3 p-2 rounded-lg border text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{d.emissor || "Emissor não identificado"}
                      {d.documento_emissor && <span className="text-muted-foreground font-normal"> · {d.documento_emissor}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {fmtCurrency(Number(d.valor))}
                      {d.data_vencimento && (
                        <> · vence {format(new Date(d.data_vencimento + "T12:00:00"), "dd/MM/yy")}
                          {vencido && <span className="text-danger font-medium"> (VENCIDO)</span>}
                        </>
                      )}
                      {d.banco_emissor && <> · {d.banco_emissor}</>}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-warning border-warning/40">Dar entrada no Dataweb</Badge>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground pt-1">
              Boleto sem título não é pagável (sem lastro). Após a entrada no ERP, o título chega no sync das 8h e casa com o boleto sozinho. Cobrança desconhecida? Investigar — pode ser boleto indevido.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Borderôs prontos para aprovar */}
      {(mesa?.borderos ?? []).length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {mesa!.borderos.map((b) => {
            const problema = (b.selos.SEM_LASTRO ?? 0) + (b.selos.VERMELHO ?? 0);
            const amarelos = b.selos.AMARELO ?? 0;
            return (
              <Card key={b.id} className={problema > 0 ? "border-danger/40" : amarelos > 0 ? "border-warning/40" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    {b.descricao || `Borderô ${b.id.slice(0, 8)}`}
                    <Badge variant="outline" className="ml-auto">{b.status}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-lg font-bold">{fmtCurrency(Number(b.total_valor))}</p>
                  <div className="flex flex-wrap gap-1">
                    {ORDEM_SELOS.filter((s) => b.selos[s]).map((s) => (
                      <Badge key={s} variant="outline" className={SELO_CFG[s].cls}>{b.selos[s]}× {SELO_CFG[s].label}</Badge>
                    ))}
                    {b.qtd_lancamentos === 0 && <span className="text-xs text-muted-foreground">vazio</span>}
                  </div>
                  {b.status === "MONTAGEM" && (
                    problema === 0 && amarelos === 0 && b.qtd_lancamentos > 0 ? (
                      <p className="text-xs text-success flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        100% no lastro — envio direto pelo Contas a Pagar, sem aprovação aqui
                      </p>
                    ) : isAdmin ? (
                      <Button
                        size="sm"
                        className="w-full"
                        disabled={aprovarBorderoMutation.isPending || b.qtd_lancamentos === 0}
                        onClick={() => aprovarBorderoMutation.mutate(b.id)}
                        title={amarelos > 0 ? "Contém itens fora da faixa — sua decisão libera o envio" : "Contém itens sem lastro/exceção — resolver ou aprovar conscientemente"}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Aprovar borderô ({amarelos > 0 ? `${amarelos} fora da faixa` : "com pendências"})
                      </Button>
                    ) : (
                      <p className="text-xs text-muted-foreground">Aguardando decisão do admin (itens fora da faixa/pendências)</p>
                    )
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Exceções aguardando o admin */}
      {excecoesPendentes.length > 0 && (
        <Card className="border-danger/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-danger">
              <AlertTriangle className="h-4 w-4" /> Exceções emergenciais aguardando aprovação individual
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {excecoesPendentes.map((l) => (
              <div key={l.id} className="flex items-start justify-between gap-3 p-2.5 rounded-lg border">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{l.pessoa_nome || l.descricao} — {fmtCurrency(Number(l.valor))}</p>
                  <p className="text-xs text-muted-foreground italic">“{l.justificativa}”</p>
                </div>
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="shrink-0"
                    disabled={aprovarExcecaoMutation.isPending}
                    onClick={() => aprovarExcecaoMutation.mutate(l.id)}
                  >
                    Aprovar exceção
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Lançamentos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileCheck2 className="h-4 w-4" /> Pagamentos no pipeline
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Venc.</TableHead>
                  <TableHead>Favorecido / descrição</TableHead>
                  <TableHead className="w-[110px] text-right">Valor</TableHead>
                  <TableHead className="w-[150px]">Lastro</TableHead>
                  <TableHead>Detalhe</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : lancamentos.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nada pendente neste filtro. 🎉</TableCell></TableRow>
                ) : (
                  lancamentos.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-sm">
                        {l.data_vencimento ? format(new Date(l.data_vencimento + "T12:00:00"), "dd/MM/yy") : "—"}
                      </TableCell>
                      <TableCell className="text-sm max-w-[280px]">
                        <p className="truncate font-medium">{l.pessoa_nome || l.descricao}</p>
                        {l.pessoa_nome && l.descricao && <p className="text-xs text-muted-foreground truncate">{l.descricao}</p>}
                      </TableCell>
                      <TableCell className="text-sm text-right font-medium">{fmtCurrency(Number(l.valor))}</TableCell>
                      <TableCell>{seloBadge(l)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[260px]">
                        <span className="truncate block">{l.rubrica_descricao ? `${l.rubrica_descricao} · ` : ""}{l.selo_motivo}</span>
                      </TableCell>
                      <TableCell><Badge variant="secondary">{l.status}</Badge></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Landmark className="h-3.5 w-3.5" />
        Após aprovar aqui, o envio segue pelo Contas a Pagar e a autorização final acontece no app BTG — duas barreiras, por desenho.
      </p>
    </div>
  );
}
