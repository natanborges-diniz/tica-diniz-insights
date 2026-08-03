import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Users, Upload, CheckCircle2, XCircle, FileSpreadsheet, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresas } from "@/hooks/useEmpresas";
import { useDefaultEmpresa } from "@/hooks/useDefaultEmpresa";
import { ModuleHeader } from "@/components/system/ModuleHeader";
import { BaseDialog } from "@/components/system/BaseDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { agoraSP } from "@/lib/datetime";

// Espelha _shared/folha.ts. Os códigos numéricos do BTG ficam no backend —
// aqui só o vocabulário da casa.
const EVENTOS = [
  { value: "SALARIO", label: "Salário" },
  { value: "ADIANTAMENTO", label: "Adiantamento" },
  { value: "FERIAS", label: "Férias" },
  { value: "DECIMO_TERCEIRO", label: "13º salário" },
  { value: "RESCISAO", label: "Rescisão" },
  { value: "PLR", label: "PLR" },
  { value: "PREMIO", label: "Prêmio / bonificação" },
  { value: "COMISSAO", label: "Comissão" },
  { value: "PROLABORE", label: "Pró-labore" },
  { value: "BOLSA_ESTAGIO", label: "Bolsa estágio" },
  { value: "BENEFICIO", label: "Benefício" },
  { value: "REEMBOLSO", label: "Reembolso" },
];

const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  RASCUNHO: { label: "Rascunho", variant: "secondary" },
  FECHADA: { label: "Fechada — no contas a pagar", variant: "outline" },
  ENVIADA: { label: "Enviada ao BTG", variant: "default" },
  PROCESSADA: { label: "Processada", variant: "default" },
  CANCELADA: { label: "Cancelada", variant: "destructive" },
};

interface Competencia {
  id: string;
  cod_empresa: number;
  competencia: string;
  evento: string;
  descricao: string | null;
  data_pagamento: string;
  status: string;
  qtd_colaboradores: number;
  total_bruto: number;
  total_descontos: number;
  total_liquido: number;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

/**
 * Lê a planilha colada como texto (TSV do Excel ou CSV).
 *
 * Colar é de propósito o caminho principal: o contador manda a planilha por
 * e-mail ou WhatsApp, e copiar/colar evita a etapa de salvar arquivo, escolher
 * encoding e descobrir separador. O cabeçalho é reconhecido por nome, então a
 * ordem das colunas não importa.
 */
function parsePlanilha(texto: string) {
  const linhas = texto.trim().split(/\r?\n/).filter(l => l.trim());
  if (linhas.length < 2) return { itens: [], erro: "Cole o cabeçalho e ao menos uma linha" };

  const sep = linhas[0].includes("\t") ? "\t" : linhas[0].includes(";") ? ";" : ",";
  const norm = (s: string) =>
    s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");

  const cab = linhas[0].split(sep).map(norm);
  const acha = (...nomes: string[]) => {
    for (const n of nomes) {
      const i = cab.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };

  const idx = {
    nome: acha("nome", "colaborador", "funcionario"),
    cpf: acha("cpf", "documento"),
    matricula: acha("matricula"),
    banco: acha("banco", "codigobanco"),
    agencia: acha("agencia"),
    conta: acha("conta", "numeroconta"),
    pix: acha("chavepix", "pix"),
    bruto: acha("valorbruto", "bruto", "salariobruto"),
    descontos: acha("descontos", "desconto"),
    liquido: acha("valorliquido", "liquido", "valor", "liquidoareceber"),
  };

  if (idx.nome < 0 || idx.cpf < 0 || idx.liquido < 0) {
    return { itens: [], erro: "A planilha precisa ter, no mínimo, as colunas: nome, cpf e valor líquido" };
  }

  // "1.234,56" (BR) e "1234.56" (US) convivem em planilha de contador.
  const num = (s?: string) => {
    if (!s) return 0;
    const limpo = s.replace(/[^\d,.-]/g, "");
    const br = limpo.includes(",") && (limpo.lastIndexOf(",") > limpo.lastIndexOf("."));
    return Number(br ? limpo.replace(/\./g, "").replace(",", ".") : limpo.replace(/,/g, "")) || 0;
  };
  const col = (c: string[], i: number) => (i >= 0 ? (c[i] ?? "").trim() : "");

  const itens = linhas.slice(1).map(l => {
    const c = l.split(sep);
    return {
      nome: col(c, idx.nome),
      cpf: col(c, idx.cpf),
      matricula: col(c, idx.matricula) || null,
      banco: col(c, idx.banco) || null,
      agencia: col(c, idx.agencia) || null,
      conta: col(c, idx.conta) || null,
      chave_pix: col(c, idx.pix) || null,
      valor_bruto: num(col(c, idx.bruto)),
      descontos: num(col(c, idx.descontos)),
      valor_liquido: num(col(c, idx.liquido)),
    };
  }).filter(i => i.nome || i.cpf);

  return { itens, erro: null as string | null };
}

export default function FolhaPagamentoPage() {
  const { empresas } = useEmpresas();
  const { codEmpresa: codEmpresaDefault } = useDefaultEmpresa();
  const queryClient = useQueryClient();

  const [codEmpresa, setCodEmpresa] = useState<number>(codEmpresaDefault || 1);
  const [importOpen, setImportOpen] = useState(false);
  const [detalheId, setDetalheId] = useState<string | null>(null);

  const hoje = agoraSP();
  const [evento, setEvento] = useState("SALARIO");
  const [competencia, setCompetencia] = useState(format(hoje, "yyyy-MM"));
  const [dataPagamento, setDataPagamento] = useState(format(hoje, "yyyy-MM-dd"));
  const [planilha, setPlanilha] = useState("");
  const [inss, setInss] = useState("");
  const [fgts, setFgts] = useState("");
  const [irrf, setIrrf] = useState("");
  const [linhasInvalidas, setLinhasInvalidas] = useState<Array<{ nome: string; cpf: string; erros: string[] }>>([]);

  const invoke = async (action: string, params: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke("folha-pagamento", {
      body: { action, ...params },
    });
    if (error) throw error;
    if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
    return data;
  };

  const { data: competencias = [], isLoading } = useQuery<Competencia[]>({
    queryKey: ["folha", codEmpresa],
    queryFn: () => invoke("listar", { cod_empresa: codEmpresa }) as Promise<Competencia[]>,
  });

  const { data: detalhe } = useQuery({
    queryKey: ["folha-detalhe", detalheId],
    queryFn: () => invoke("detalhe", { competencia_id: detalheId }),
    enabled: !!detalheId,
  });

  const prévia = parsePlanilha(planilha);

  const importarMutation = useMutation({
    mutationFn: () => invoke("importar", {
      cod_empresa: codEmpresa,
      competencia,
      evento,
      data_pagamento: dataPagamento,
      itens: prévia.itens,
      encargos: {
        INSS: Number(inss.replace(",", ".")) || 0,
        FGTS: Number(fgts.replace(",", ".")) || 0,
        IRRF: Number(irrf.replace(",", ".")) || 0,
      },
    }),
    onSuccess: (r: { ok?: boolean; linhas_invalidas?: typeof linhasInvalidas; qtd_colaboradores?: number; substituiu?: boolean }) => {
      if (r?.ok === false && r.linhas_invalidas) {
        setLinhasInvalidas(r.linhas_invalidas);
        toast.error(`${r.linhas_invalidas.length} linha(s) precisam de correção`);
        return;
      }
      setLinhasInvalidas([]);
      toast.success(
        `${r?.qtd_colaboradores ?? 0} colaborador(es) importado(s)${r?.substituiu ? " — versão anterior substituída" : ""}`,
      );
      setImportOpen(false);
      setPlanilha("");
      queryClient.invalidateQueries({ queryKey: ["folha"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fecharMutation = useMutation({
    mutationFn: (id: string) => invoke("fechar", { competencia_id: id }),
    onSuccess: (r: { lancamentos?: number; encargos?: number }) => {
      toast.success(
        `Folha fechada: ${r?.lancamentos ?? 0} lançamento(s) e ${r?.encargos ?? 0} encargo(s) no contas a pagar`,
      );
      queryClient.invalidateQueries({ queryKey: ["folha"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelarMutation = useMutation({
    mutationFn: (id: string) => invoke("cancelar", { competencia_id: id }),
    onSuccess: () => {
      toast.success("Folha cancelada");
      queryClient.invalidateQueries({ queryKey: ["folha"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <ModuleHeader
        title="Folha de Pagamento"
        subtitle="Importe o fechamento, confira e envie ao contas a pagar"
        icon={<Users className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            <Select value={String(codEmpresa)} onValueChange={v => setCodEmpresa(Number(v))}>
              <SelectTrigger className="w-[220px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {empresas.map(e => (
                  <SelectItem key={e.codEmpresa} value={String(e.codEmpresa)}>{e.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4 mr-1" /> Importar folha
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader><CardTitle className="text-base">Competências</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Competência</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead className="text-center">Pessoas</TableHead>
                <TableHead className="text-right">Líquido</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : competencias.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                    Nenhuma folha importada. Comece colando a planilha do contador em "Importar folha".
                  </TableCell>
                </TableRow>
              ) : competencias.map(c => {
                const st = STATUS[c.status] || { label: c.status, variant: "outline" as const };
                return (
                  <TableRow key={c.id}>
                    <TableCell className="text-sm font-medium">
                      <button className="text-primary hover:underline" onClick={() => setDetalheId(c.id)}>
                        {c.competencia}
                      </button>
                    </TableCell>
                    <TableCell className="text-sm">
                      {EVENTOS.find(e => e.value === c.evento)?.label || c.evento}
                    </TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(c.data_pagamento + "T12:00:00"), "dd/MM/yy")}
                    </TableCell>
                    <TableCell className="text-center text-sm">{c.qtd_colaboradores}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{fmt(c.total_liquido)}</TableCell>
                    <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {c.status === "RASCUNHO" && (
                          <Button size="sm" onClick={() => fecharMutation.mutate(c.id)}
                            disabled={fecharMutation.isPending}
                            title="Gera os lançamentos no contas a pagar e monta o borderô de folha">
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Fechar
                          </Button>
                        )}
                        {["RASCUNHO", "FECHADA"].includes(c.status) && (
                          <Button size="sm" variant="ghost" className="text-destructive"
                            onClick={() => {
                              if (confirm(`Cancelar a folha de ${c.competencia}? Os lançamentos gerados também serão cancelados.`)) {
                                cancelarMutation.mutate(c.id);
                              }
                            }}>
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
        </CardContent>
      </Card>

      {/* Importar */}
      <BaseDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Importar folha do contador"
        footer={
          <>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => importarMutation.mutate()}
              disabled={importarMutation.isPending || prévia.itens.length === 0}
            >
              <FileSpreadsheet className="h-4 w-4 mr-1" />
              Importar {prévia.itens.length > 0 && `(${prévia.itens.length})`}
            </Button>
          </>
        }
      >
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Evento</Label>
              <Select value={evento} onValueChange={setEvento}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENTOS.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Competência</Label>
              <Input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Data de pagamento</Label>
              <Input type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Cada evento é uma remessa separada no banco — salário e férias do mesmo mês não vão juntos.
          </p>

          <div className="space-y-1">
            <Label>Planilha</Label>
            <Textarea
              value={planilha}
              onChange={e => setPlanilha(e.target.value)}
              rows={8}
              className="font-mono text-xs"
              placeholder={"Cole aqui direto do Excel (com o cabeçalho).\n\nnome\tcpf\tbanco\tagencia\tconta\tvalor_bruto\tdescontos\tvalor_liquido\nMARIA DA SILVA\t529.982.247-25\t208\t50\t008792899\t4000,00\t800,00\t3200,00"}
            />
            <p className="text-xs text-muted-foreground">
              Mínimo: <strong>nome</strong>, <strong>cpf</strong> e <strong>valor líquido</strong>.
              A ordem das colunas não importa. Sem dados bancários, informe a chave pix.
            </p>
          </div>

          {prévia.erro && (
            <p className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-md p-2">
              {prévia.erro}
            </p>
          )}
          {prévia.itens.length > 0 && (
            <p className="text-xs text-primary bg-primary/5 border border-primary/20 rounded-md p-2">
              {prévia.itens.length} colaborador(es) reconhecido(s) — líquido{" "}
              <strong>{fmt(prévia.itens.reduce((s, i) => s + i.valor_liquido, 0))}</strong>
            </p>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">INSS</Label>
              <Input value={inss} onChange={e => setInss(e.target.value)} placeholder="0,00" inputMode="decimal" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">FGTS</Label>
              <Input value={fgts} onChange={e => setFgts(e.target.value)} placeholder="0,00" inputMode="decimal" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">IRRF</Label>
              <Input value={irrf} onChange={e => setIrrf(e.target.value)} placeholder="0,00" inputMode="decimal" />
            </div>
            <p className="col-span-3 text-xs text-muted-foreground">
              Valores apurados pelo contador. O sistema não calcula alíquota — só cria o título com o
              vencimento legal de cada um (FGTS dia 7, INSS e IRRF dia 20, antecipando fim de semana).
            </p>
          </div>

          {linhasInvalidas.length > 0 && (
            <div className="text-xs bg-destructive/5 border border-destructive/20 rounded-md p-3 space-y-1 max-h-48 overflow-auto">
              <p className="font-medium text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" /> Corrija antes de importar:
              </p>
              {linhasInvalidas.map((l, i) => (
                <p key={i} className="text-muted-foreground">
                  <strong>{l.nome || "(sem nome)"}</strong> — {l.erros.join("; ")}
                </p>
              ))}
            </div>
          )}
        </div>
      </BaseDialog>

      {/* Detalhe */}
      <BaseDialog
        open={!!detalheId}
        onOpenChange={(o) => { if (!o) setDetalheId(null); }}
        title={`Folha ${(detalhe as { competencia?: Competencia })?.competencia?.competencia ?? ""}`}
      >
        {(detalhe as { itens?: Array<Record<string, unknown>>; encargos?: Array<Record<string, unknown>> }) && (
          <div className="space-y-4 py-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead>Conta</TableHead>
                  <TableHead className="text-right">Líquido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {((detalhe as { itens?: Array<Record<string, unknown>> })?.itens || []).map((i) => (
                  <TableRow key={String(i.id)}>
                    <TableCell className="text-sm">{String(i.nome)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{String(i.cpf)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {i.banco ? `${i.banco} / ${i.agencia} / ${i.conta}` : (i.chave_pix ? "PIX" : "—")}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">{fmt(Number(i.valor_liquido))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {((detalhe as { encargos?: Array<Record<string, unknown>> })?.encargos || []).length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Encargos</p>
                <Table>
                  <TableBody>
                    {((detalhe as { encargos?: Array<Record<string, unknown>> })?.encargos || []).map((e) => (
                      <TableRow key={String(e.id)}>
                        <TableCell className="text-sm">{String(e.tipo)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          vence {format(new Date(String(e.data_vencimento) + "T12:00:00"), "dd/MM/yy")}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">{fmt(Number(e.valor))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </BaseDialog>
    </div>
  );
}
