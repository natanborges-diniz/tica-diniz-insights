import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Users, Upload, CheckCircle2, XCircle, FileSpreadsheet, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresas } from "@/hooks/useEmpresas";
import { useDefaultEmpresa } from "@/hooks/useDefaultEmpresa";
import { ModuleHeader } from "@/components/system/ModuleHeader";
import { BaseDialog } from "@/components/system/BaseDialog";
import { PlanoContaSelect } from "@/components/banking/PlanoContaSelect";
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
import {
  ehRelatorioTotaisLiquidos,
  parseRelatorioFolha,
} from "../../supabase/functions/_shared/folhaRelatorio";

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
  // Antes de tentar planilha: é a Relação de Totais Líquidos colada do PDF?
  // É o que a contabilidade manda de verdade, um relatório por loja.
  if (ehRelatorioTotaisLiquidos(texto)) {
    const r = parseRelatorioFolha(texto);
    return {
      itens: r.colaboradores.map(c => ({
        nome: c.nome,
        cpf: c.cpf,
        matricula: c.codigo,
        // O relatório não traz banco: vem da rubrica do colaborador, no backend.
        banco: null as string | null,
        agencia: null as string | null,
        conta: null as string | null,
        chave_pix: null as string | null,
        valor_bruto: 0,
        descontos: 0,
        valor_liquido: c.valor_liquido,
      })),
      erro: null as string | null,
      relatorio: r,
    };
  }

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
  // Enquanto o escopo de folha do BTG não sai, o caminho que funciona é Pix
  // individual num borderô comum.
  const [modoPagamento, setModoPagamento] = useState("PIX_INDIVIDUAL");
  const [contaFolha, setContaFolha] = useState("");

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
  const relatorio = (prévia as { relatorio?: ReturnType<typeof parseRelatorioFolha> }).relatorio ?? null;

  // Competência e data vêm impressas no relatório — redigitar é chance de errar.
  useEffect(() => {
    if (!relatorio) return;
    if (relatorio.competencia) setCompetencia(relatorio.competencia);
    if (relatorio.data_pagamento) setDataPagamento(relatorio.data_pagamento);
  }, [relatorio?.competencia, relatorio?.data_pagamento]);

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

  const rubricasMutation = useMutation({
    mutationFn: (id: string) => invoke("criar_rubricas", { competencia_id: id, conta_numero: contaFolha }),
    onSuccess: (r: { criadas?: number; atualizadas?: number; erros?: string[] }) => {
      toast.success(
        `${r?.criadas ?? 0} rubrica(s) criada(s) e ${r?.atualizadas ?? 0} atualizada(s). ` +
        `As novas nascem em rascunho — aprove em Rubricas para valerem no selo.`,
      );
      if (r?.erros?.length) toast.error(`${r.erros.length} com problema: ${r.erros[0]}`);
      queryClient.invalidateQueries({ queryKey: ["folha"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fecharMutation = useMutation({
    mutationFn: (id: string) => invoke("fechar", { competencia_id: id, modo_pagamento: modoPagamento }),
    onSuccess: (r: {
      ok?: boolean; code?: string; error?: string;
      colaboradores?: Array<{ nome: string; cpf: string }>;
      lancamentos?: number; encargos?: number; modo_pagamento?: string;
    }) => {
      if (r?.ok === false && r.code === "SEM_DADOS_BANCARIOS") {
        // O relatório do contador não traz conta. Sem ela ninguém é pago, e o
        // lugar de descobrir isso é aqui, não no envio ao banco.
        toast.error(
          `${r.colaboradores?.length ?? 0} sem dados bancários: ` +
          `${(r.colaboradores || []).slice(0, 3).map(c => c.nome).join(", ")}` +
          `${(r.colaboradores?.length ?? 0) > 3 ? "…" : ""}. Complete na rubrica de cada um.`,
        );
        return;
      }
      toast.success(
        `Folha fechada: ${r?.lancamentos ?? 0} lançamento(s) e ${r?.encargos ?? 0} encargo(s) no contas a pagar` +
        (r?.modo_pagamento === "PIX_INDIVIDUAL" ? " — já preparados como Pix" : ""),
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
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Como esta folha é paga</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Forma de pagamento</Label>
            <Select value={modoPagamento} onValueChange={setModoPagamento}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PIX_INDIVIDUAL">Pix por dados bancários (borderô comum)</SelectItem>
                <SelectItem value="FOLHA_BTG">Lote de folha do BTG (exige escopo payroll)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {modoPagamento === "PIX_INDIVIDUAL"
                ? "Cada colaborador vira um Pix com banco, agência e conta, num borderô comum — o caminho que funciona hoje."
                : "Remessa única pelo endpoint de folha do BTG. Depende do escopo payroll liberado pelo banco e de conta salário."}
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Conta do DRE para as rubricas</Label>
            <PlanoContaSelect
              value={contaFolha || null}
              onChange={(c) => setContaFolha(c.conta_numero)}
              grupos={["DESPESAS_OPERACIONAIS", "OUTRAS_DESPESAS"]}
              placeholder="Selecionar conta de pessoal"
            />
            <p className="text-xs text-muted-foreground">
              Usada ao criar as rubricas dos colaboradores em massa.
            </p>
          </div>
        </CardContent>
      </Card>

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
                          <Button size="sm" variant="outline"
                            onClick={() => rubricasMutation.mutate(c.id)}
                            disabled={rubricasMutation.isPending || !contaFolha}
                            title={contaFolha
                              ? "Cria uma rubrica por colaborador, guardando os dados bancários para os próximos meses"
                              : "Selecione a conta do DRE acima antes de criar as rubricas"}>
                            <Users className="h-3.5 w-3.5 mr-1" /> Rubricas
                          </Button>
                        )}
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
            <Label>Planilha ou relatório do contador</Label>
            <Textarea
              value={planilha}
              onChange={e => setPlanilha(e.target.value)}
              rows={8}
              className="font-mono text-xs"
              placeholder={"Cole a Relação de Totais Líquidos (selecione tudo no PDF e cole aqui),\nou uma planilha do Excel com cabeçalho.\n\nnome\tcpf\tbanco\tagencia\tconta\tvalor_bruto\tdescontos\tvalor_liquido\nMARIA DA SILVA\t529.982.247-25\t208\t50\t008792899\t4000,00\t800,00\t3200,00"}
            />
            <p className="text-xs text-muted-foreground">
              Aceita a <strong>Relação de Totais Líquidos</strong> colada do PDF ou planilha.
              Na planilha, o mínimo é <strong>nome</strong>, <strong>cpf</strong> e
              <strong> valor líquido</strong>; a ordem das colunas não importa.
            </p>
          </div>

          {relatorio && (
            <div className="text-xs bg-primary/5 border border-primary/20 rounded-md p-3 space-y-1">
              <p className="font-medium text-primary">Relação de Totais Líquidos reconhecida</p>
              <p className="text-muted-foreground">
                {relatorio.razao_social}
                {relatorio.cnpj && ` · CNPJ ${relatorio.cnpj}`}
                {relatorio.competencia && ` · competência ${relatorio.competencia}`}
              </p>
              <p className="text-muted-foreground">
                Competência e data de pagamento foram preenchidas a partir do relatório.
                Confirme se a loja selecionada acima é esta.
              </p>
              {relatorio.divergencia !== null && relatorio.divergencia !== 0 && (
                <p className="text-destructive font-medium">
                  ⚠ O total impresso ({fmt(relatorio.total_informado ?? 0)}) não bate com a soma das
                  linhas lidas — diferença de {fmt(Math.abs(relatorio.divergencia))}. Faltou copiar
                  parte do relatório.
                </p>
              )}
              {relatorio.divergencia === 0 && (
                <p className="text-green-700">
                  ✓ Soma confere com o total impresso: {fmt(relatorio.total_informado ?? 0)}
                </p>
              )}
              <p className="text-muted-foreground">
                O relatório não traz banco, agência e conta — eles vêm da rubrica de cada
                colaborador. Quem ainda não tiver rubrica precisa ser completado antes de fechar.
              </p>
            </div>
          )}

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
