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
import { extrairTextoPdf } from "@/lib/pdf/textoPdf";
import { mapearLinhaBancaria } from "../../supabase/functions/_shared/dadosBancarios";
import { Landmark } from "lucide-react";
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
  /** Data de pagamento usada no fechamento — separada da importação. */
  const [dataFechamento, setDataFechamento] = useState(format(agoraSP(), "yyyy-MM-dd"));
  const [lendoPdf, setLendoPdf] = useState(false);
  /** O operador mexeu na data? A partir daí o relatório não manda mais nela. */
  const [dataTocada, setDataTocada] = useState(false);
  /**
   * CPFs desmarcados na conferência.
   *
   * Conferir olhando o texto cru do relatório não é conferir: ninguém lê 30
   * linhas de PDF colado procurando quem saiu no meio do mês. A lista limpa,
   * com o valor de cada um, é o que permite dizer "esse não".
   */
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());
  const [verTexto, setVerTexto] = useState(false);
  // Competência que está recebendo a planilha de contas; o input de arquivo é
  // um só, disparado pelo botão da linha.
  const [contasParaId, setContasParaId] = useState<string | null>(null);

  // Correção pontual do Pix/conta de um colaborador, sem recolar a planilha.
  const [editItem, setEditItem] = useState<{ id: string; nome: string; cpf: string } | null>(null);
  const [editPix, setEditPix] = useState("");
  const [editBanco, setEditBanco] = useState("");
  const [editAgencia, setEditAgencia] = useState("");
  const [editConta, setEditConta] = useState("");
  const [editTipoConta, setEditTipoConta] = useState("");

  const invoke = async (action: string, params: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke("folha-pagamento", {
      body: { action, ...params },
    });
    if (error) {
      const context = (error as { context?: Response }).context;
      if (context) {
        try {
          const body = await context.clone().json() as { error?: string };
          throw new Error(body.error || error.message);
        } catch (contextError) {
          if (contextError instanceof Error && contextError.message !== "Unexpected end of JSON input") {
            throw contextError;
          }
        }
      }
      throw new Error(error.message);
    }
    // Planilha inválida não é falha de chamada: a função devolve `error` junto
    // com a lista de linhas problemáticas, e lançar aqui apagava justamente a
    // explicação que o operador precisa ler.
    const d = data as { error?: string; linhas_invalidas?: unknown };
    if (d?.error && !d.linhas_invalidas) throw new Error(d.error);
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

  /**
   * Lê o PDF escolhido e joga o texto no mesmo campo de sempre.
   *
   * Mandar o operador selecionar tudo no leitor de PDF e colar funcionava, mas
   * é onde se perde meia página sem perceber — o relatório continua parecendo
   * válido, só que com gente a menos. O arquivo inteiro não tem esse risco.
   */
  const carregarPdf = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    setLendoPdf(true);
    try {
      const texto = await extrairTextoPdf(arquivo);
      setPlanilha(texto);
      setLinhasInvalidas([]);
      // Arquivo novo, conferência nova: manter exclusões de outro relatório
      // faria sumir gente sem ninguém perceber.
      setExcluidos(new Set());
    } catch (e) {
      toast.error(`Não consegui ler o PDF: ${e instanceof Error ? e.message : "arquivo inválido"}`);
    } finally {
      setLendoPdf(false);
    }
  };

  const prévia = parsePlanilha(planilha);
  const itensSelecionados = prévia.itens.filter(i => !excluidos.has(i.cpf));
  const totalSelecionado = itensSelecionados.reduce((s, i) => s + i.valor_liquido, 0);
  const relatorio = (prévia as { relatorio?: ReturnType<typeof parseRelatorioFolha> }).relatorio ?? null;

  // Competência e data vêm impressas no relatório — redigitar é chance de errar.
  useEffect(() => {
    if (!relatorio) return;
    if (relatorio.competencia) setCompetencia(relatorio.competencia);

    // A data impressa é a do mês da competência — julho fechado em agosto traz
    // 30/07, que já passou. Preencher com ela fazia o borderô antecipar tudo
    // para "hoje" e ignorar qualquer data escolhida depois. Data vencida vira
    // sugestão de hoje; a escolha do operador nunca é sobrescrita.
    if (relatorio.data_pagamento && !dataTocada) {
      const hoje = format(agoraSP(), "yyyy-MM-dd");
      setDataPagamento(relatorio.data_pagamento < hoje ? hoje : relatorio.data_pagamento);
    }
  }, [relatorio?.competencia, relatorio?.data_pagamento, dataTocada]);

  const importarMutation = useMutation({
    mutationFn: () => invoke("importar", {
      cod_empresa: codEmpresa,
      competencia,
      evento,
      data_pagamento: dataPagamento,
      itens: itensSelecionados,
      encargos: {
        INSS: Number(inss.replace(",", ".")) || 0,
        FGTS: Number(fgts.replace(",", ".")) || 0,
        IRRF: Number(irrf.replace(",", ".")) || 0,
      },
    }),
    onSuccess: (r: {
      ok?: boolean;
      linhas_invalidas?: typeof linhasInvalidas;
      qtd_colaboradores?: number;
      substituiu?: boolean;
      sem_dados_bancarios?: Array<{ nome: string; cpf: string }>;
    }) => {
      if (r?.ok === false && r.linhas_invalidas) {
        setLinhasInvalidas(r.linhas_invalidas);
        toast.error(`${r.linhas_invalidas.length} linha(s) precisam de correção`);
        return;
      }
      setLinhasInvalidas([]);
      toast.success(
        `${r?.qtd_colaboradores ?? 0} colaborador(es) importado(s)${r?.substituiu ? " — versão anterior substituída" : ""}`,
      );
      if (r?.sem_dados_bancarios?.length) {
        toast.warning(
          `${r.sem_dados_bancarios.length} colaborador(es) ainda sem banco/conta — ` +
          `importe a planilha de contas antes de fechar a folha.`,
        );
      }
      setImportOpen(false);
      setPlanilha("");
      setExcluidos(new Set());
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

  const contasMutation = useMutation({
    mutationFn: async ({ id, arquivo }: { id: string; arquivo: File }) => {
      // SheetJS já é dependência do projeto (usada nas exportações).
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await arquivo.arrayBuffer(), { type: "array" });
      const linhasBrutas = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        wb.Sheets[wb.SheetNames[0]], { defval: "" },
      );

      // O reconhecimento das colunas mora em _shared/dadosBancarios.ts, testado:
      // cada RH escreve o cabeçalho do seu jeito ("Chave PIX", "PIX", "Nº da
      // Conta"), e exigir grafia exata devolvia "0 conta(s) preenchida(s)" sem
      // dizer por quê.
      const linhas = linhasBrutas.map(mapearLinhaBancaria);

      if (linhas.length === 0) throw new Error("A primeira aba da planilha está vazia");

      // Diagnóstico explícito: sem esta checagem, coluna não reconhecida virava
      // "0 conta(s) preenchida(s)" sem dizer o porquê.
      const utilizavel = linhas.some(l => (l.banco && l.agencia && l.conta) || l.chave_pix);
      if (!utilizavel) {
        const cabecalhos = Object.keys(linhasBrutas[0] ?? {}).join(", ");
        throw new Error(
          "Não encontrei banco, agência e conta (nem chave Pix) na planilha. " +
          `Colunas lidas: ${cabecalhos || "nenhuma"}`,
        );
      }
      return invoke("importar_dados_bancarios", { competencia_id: id, linhas });

    },
    onMutate: () => toast.loading("Importando contas da planilha…", { id: "importar-contas" }),
    onSuccess: (r: {
      casados?: number; por_cpf?: number; por_nome?: number; rubricas_atualizadas?: number;
      ambiguos?: Array<{ nome: string; quantidade: number }>;
      linhas_planilha?: number; colaboradores_folha?: number;
      sem_correspondente?: number;
      sem_correspondente_detalhe?: Array<{ nome: string; cpf: string; motivo: string }>;
      nao_cobertos?: Array<{ nome: string }>; erros?: string[];
    }) => {
      toast.dismiss("importar-contas");
      const detalhe = r?.sem_correspondente_detalhe ?? [];
      const foraDaFolha = detalhe.filter(d => d.motivo === "NAO_ESTA_NA_FOLHA");
      const semDados = detalhe.filter(d => d.motivo === "SEM_DADOS_DE_PAGAMENTO");

      if ((r?.casados ?? 0) === 0) {
        // Zero casamentos é sempre um dos dois casos abaixo — dizer qual evita
        // o operador reenviar a mesma planilha achando que foi falha de upload.
        const causa = foraDaFolha.length >= semDados.length && foraDaFolha.length > 0
          ? `nenhum CPF/nome da planilha existe nesta competência (ex.: ${foraDaFolha.slice(0, 3).map(d => `${d.nome}${d.cpf ? ` — ${d.cpf}` : ""}`).join("; ")})`
          : `as linhas não trazem banco+agência+conta nem chave Pix (${semDados.length} linha(s))`;
        toast.error(
          `0 conta(s) preenchida(s): ${causa}. ` +
          `Planilha com ${r?.linhas_planilha ?? 0} linha(s), folha com ${r?.colaboradores_folha ?? 0} colaborador(es).`,
          { duration: 15000 },
        );
      } else {
        toast.success(
          `${r?.casados ?? 0} conta(s) preenchida(s) — ${r?.por_cpf ?? 0} por CPF, ${r?.por_nome ?? 0} por nome. ` +
          `${r?.rubricas_atualizadas ?? 0} rubrica(s) guardadas para os próximos meses.`,
        );
      }
      if (r?.ambiguos?.length) {
        toast.error(
          `${r.ambiguos.length} nome(s) repetido(s) na folha ficaram de fora: ` +
          `${r.ambiguos.map(a => a.nome).join(", ")}. Informe o CPF na planilha.`,
        );
      }
      if (r?.nao_cobertos?.length) {
        toast.warning(
          `${r.nao_cobertos.length} sem conta: ${r.nao_cobertos.slice(0, 3).map(c => c.nome).join(", ")}` +
          `${r.nao_cobertos.length > 3 ? "…" : ""}`,
        );
      }

      queryClient.invalidateQueries({ queryKey: ["folha"] });
      queryClient.invalidateQueries({ queryKey: ["folha-detalhe"] });
    },
    onError: (e: Error) => {
      toast.dismiss("importar-contas");
      toast.error(e.message);
    },
  });

  const fecharMutation = useMutation({
    // A data vai junto: é ela que vira o vencimento dos títulos e a data do
    // borderô. Sem isso valia a do relatório, quase sempre no passado.
    mutationFn: (id: string) => invoke("fechar", {
      competencia_id: id,
      modo_pagamento: modoPagamento,
      data_pagamento: dataFechamento || undefined,
    }),
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

  const dadosBancariosMutation = useMutation({
    mutationFn: () => invoke("atualizar_dados_bancarios", {
      item_id: editItem?.id,
      chave_pix: editPix,
      banco: editBanco,
      agencia: editAgencia,
      conta: editConta,
      tipo_conta: editTipoConta,
    }),
    onSuccess: (r: { rubrica_atualizada?: boolean }) => {
      toast.success(
        "Dados de pagamento atualizados" +
        (r?.rubrica_atualizada ? " — a rubrica do colaborador voltou para rascunho e precisa ser aprovada" : ""),
      );
      setEditItem(null);
      queryClient.invalidateQueries({ queryKey: ["folha-detalhe", detalheId] });
      queryClient.invalidateQueries({ queryKey: ["folha"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const abrirEdicao = (i: Record<string, unknown>) => {
    setEditItem({ id: String(i.id), nome: String(i.nome), cpf: String(i.cpf ?? "") });
    setEditPix(String(i.chave_pix ?? ""));
    setEditBanco(String(i.banco ?? ""));
    setEditAgencia(String(i.agencia ?? ""));
    setEditConta(String(i.conta ?? ""));
    setEditTipoConta(String(i.tipo_conta ?? ""));
  };


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
            <Label className="text-xs">Data de pagamento no fechamento</Label>
            <Input
              type="date"
              value={dataFechamento}
              onChange={e => setDataFechamento(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              É esta data que vira o vencimento dos títulos e a data do borderô — não a impressa
              no relatório, que costuma ser do mês da competência e já ter passado.
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
                            onClick={() => {
                              setContasParaId(c.id);
                              document.getElementById("input-contas-folha")?.click();
                            }}
                            disabled={contasMutation.isPending}
                            title="Planilha com banco, agência e conta — cruzada por CPF e nome">
                            <Landmark className="h-3.5 w-3.5 mr-1" /> Contas
                          </Button>
                        )}
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

      {/* Planilha de contas — um input só, acionado pelo botão da linha */}
      <input
        id="input-contas-folha"
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={e => {
          const arquivo = e.target.files?.[0];
          e.target.value = "";
          if (arquivo && contasParaId) contasMutation.mutate({ id: contasParaId, arquivo });
        }}
      />

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
              disabled={importarMutation.isPending || itensSelecionados.length === 0}
            >
              <FileSpreadsheet className="h-4 w-4 mr-1" />
              Importar {itensSelecionados.length > 0 && `(${itensSelecionados.length})`}
            </Button>
          </>
        }
      >
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
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
          </div>
          <p className="text-xs text-muted-foreground">
            Cada evento é uma remessa separada no banco — salário e férias do mesmo mês não vão juntos.
            A data de pagamento é escolhida uma única vez, no fechamento da competência.
          </p>


          <div className="space-y-1">
            <Label>Relatório em PDF</Label>
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept="application/pdf,.pdf"
                disabled={lendoPdf}
                onChange={e => { carregarPdf(e.target.files?.[0]); e.target.value = ""; }}
                className="h-9 text-xs file:mr-3 file:text-xs"
              />
              {lendoPdf && <span className="text-xs text-muted-foreground shrink-0">Lendo…</span>}
            </div>
            <p className="text-xs text-muted-foreground">
              Escolha a Relação de Totais Líquidos da loja. O texto aparece abaixo já reconhecido —
              se preferir, ainda dá para colar à mão.
            </p>
          </div>

          {/* Texto cru só antes de reconhecer alguém, ou sob demanda.
              Depois de reconhecido, o que importa é a lista limpa. */}
          {(prévia.itens.length === 0 || verTexto) && (
            <div className="space-y-1">
              <Label>Planilha ou texto do relatório</Label>
              <Textarea
                value={planilha}
                onChange={e => { setPlanilha(e.target.value); setExcluidos(new Set()); }}
                rows={prévia.itens.length === 0 ? 8 : 5}
                className="font-mono text-xs"
                placeholder={"Cole a Relação de Totais Líquidos (selecione tudo no PDF e cole aqui),\nou uma planilha do Excel com cabeçalho.\n\nnome\tcpf\tbanco\tagencia\tconta\tvalor_bruto\tdescontos\tvalor_liquido\nMARIA DA SILVA\t529.982.247-25\t208\t50\t008792899\t4000,00\t800,00\t3200,00"}
              />
              <p className="text-xs text-muted-foreground">
                Aceita a <strong>Relação de Totais Líquidos</strong> colada do PDF ou planilha.
                Na planilha, o mínimo é <strong>nome</strong>, <strong>cpf</strong> e
                <strong> valor líquido</strong>; a ordem das colunas não importa.
              </p>
            </div>
          )}

          {/* Conferência: quem entra na folha */}
          {prévia.itens.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Confira quem será importado</Label>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                  onClick={() => setVerTexto(v => !v)}
                >
                  {verTexto ? "Esconder texto original" : "Ver texto original"}
                </button>
              </div>

              <div className="border rounded-md max-h-72 overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead className="w-[40px]"></TableHead>
                      <TableHead className="w-[60px]">Cód.</TableHead>
                      <TableHead>Colaborador</TableHead>
                      <TableHead className="w-[130px]">CPF</TableHead>
                      <TableHead className="w-[110px] text-right">Líquido</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {prévia.itens.map((i, idx) => {
                      const fora = excluidos.has(i.cpf);
                      return (
                        <TableRow key={`${i.cpf}-${idx}`} className={fora ? "opacity-40" : ""}>
                          <TableCell>
                            <input
                              type="checkbox"
                              className="h-4 w-4 cursor-pointer"
                              checked={!fora}
                              onChange={() => setExcluidos(prev => {
                                const novo = new Set(prev);
                                if (novo.has(i.cpf)) novo.delete(i.cpf); else novo.add(i.cpf);
                                return novo;
                              })}
                              title={fora ? "Incluir de volta" : "Deixar de fora desta folha"}
                            />
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{i.matricula ?? "—"}</TableCell>
                          <TableCell className={`text-sm ${fora ? "line-through" : ""}`}>{i.nome}</TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">{i.cpf}</TableCell>
                          <TableCell className={`text-sm text-right font-medium ${fora ? "line-through" : ""}`}>
                            {fmt(i.valor_liquido)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {excluidos.size > 0
                    ? `${itensSelecionados.length} de ${prévia.itens.length} — ${excluidos.size} fora`
                    : `${prévia.itens.length} colaborador(es)`}
                </span>
                <span className="font-medium">Total a importar: {fmt(totalSelecionado)}</span>
              </div>

              {itensSelecionados.length === 0 && (
                <p className="text-xs text-destructive">
                  Todos foram desmarcados — não há nada para importar.
                </p>
              )}
            </div>
          )}

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
              {/* Esta conferência é sobre a LEITURA, não sobre a seleção: compara
                  o total impresso com tudo que foi reconhecido. Quem você
                  desmarcar de propósito aparece na linha seguinte. */}
              {relatorio.divergencia !== null && relatorio.divergencia !== 0 && (
                <p className="text-destructive font-medium">
                  ⚠ O total impresso ({fmt(relatorio.total_informado ?? 0)}) não bate com a soma das
                  linhas lidas — diferença de {fmt(Math.abs(relatorio.divergencia))}. Faltou parte
                  do relatório.
                </p>
              )}
              {relatorio.divergencia === 0 && (
                <p className="text-green-700">
                  ✓ Leitura completa: as {prévia.itens.length} linhas somam o total impresso
                  ({fmt(relatorio.total_informado ?? 0)})
                </p>
              )}
              {excluidos.size > 0 && (
                <p className="text-amber-700">
                  {excluidos.size} colaborador(es) desmarcado(s) por você — serão importados{" "}
                  {fmt(totalSelecionado)} em vez de {fmt(relatorio.total_informado ?? 0)}.
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
          {planilha.trim() && !relatorio && prévia.itens.length === 0 && (
            <div className="text-xs bg-destructive/5 border border-destructive/20 rounded-md p-3 space-y-1">
              <p className="font-medium text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" /> Não reconheci nenhum colaborador neste texto
              </p>
              <p className="text-muted-foreground">
                O leitor precisa de <strong>nome, CPF e valor líquido na mesma linha</strong>. Se o PDF
                for digitalizado (imagem), não há texto para extrair — peça o arquivo original ao
                contador. Abaixo, o começo do que foi lido:
              </p>
              <pre className="font-mono text-[10px] whitespace-pre-wrap text-muted-foreground max-h-32 overflow-auto">
                {planilha.split("\n").slice(0, 12).join("\n")}
              </pre>
            </div>
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
                  <TableHead>Como recebe</TableHead>
                  <TableHead className="text-right">Líquido</TableHead>
                  <TableHead className="w-[90px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {((detalhe as { itens?: Array<Record<string, unknown>> })?.itens || []).map((i) => {
                  const semDados = !i.chave_pix && !(i.banco && i.agencia && i.conta);
                  return (
                    <TableRow key={String(i.id)}>
                      <TableCell className="text-sm">{String(i.nome)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{String(i.cpf)}</TableCell>
                      <TableCell className="text-xs">
                        {i.chave_pix ? (
                          <span className="text-muted-foreground">PIX {String(i.chave_pix)}</span>
                        ) : i.banco ? (
                          <span className="text-muted-foreground">{`${i.banco} / ${i.agencia} / ${i.conta}`}</span>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">sem dados de pagamento</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">{fmt(Number(i.valor_liquido))}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant={semDados ? "default" : "ghost"}
                          className="h-7 text-xs"
                          onClick={() => abrirEdicao(i)}
                        >
                          {semDados ? "Informar" : "Editar"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
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

      {/* Dados de pagamento de um colaborador */}
      <BaseDialog
        open={!!editItem}
        onOpenChange={(o) => { if (!o) setEditItem(null); }}
        title={`Dados de pagamento — ${editItem?.nome ?? ""}`}
        description="A chave Pix tem prioridade. Sem ela, informe banco, agência e conta."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancelar</Button>
            <Button
              onClick={() => dadosBancariosMutation.mutate()}
              disabled={dadosBancariosMutation.isPending}
            >
              Salvar
            </Button>
          </div>
        }
      >
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>Chave Pix</Label>
            <Input
              value={editPix}
              onChange={e => setEditPix(e.target.value)}
              placeholder="CPF, celular, e-mail ou chave aleatória"
              maxLength={140}
            />
            <p className="text-xs text-muted-foreground">
              A mesma validação do envio ao banco roda aqui — chave inválida não salva.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label>Banco</Label>
              <Input value={editBanco} onChange={e => setEditBanco(e.target.value)} maxLength={10} />
            </div>
            <div className="space-y-1">
              <Label>Agência</Label>
              <Input value={editAgencia} onChange={e => setEditAgencia(e.target.value)} maxLength={10} />
            </div>
            <div className="space-y-1">
              <Label>Conta</Label>
              <Input value={editConta} onChange={e => setEditConta(e.target.value)} maxLength={20} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Tipo de conta</Label>
            <Select value={editTipoConta || "CC"} onValueChange={setEditTipoConta}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CC">Conta corrente</SelectItem>
                <SelectItem value="PP">Poupança</SelectItem>
                <SelectItem value="PG">Conta pagamento</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            A correção também atualiza a rubrica deste CPF, então a próxima folha já vem certa —
            e a rubrica volta para rascunho, exigindo nova aprovação.
          </p>
        </div>
      </BaseDialog>
    </div>

  );
}
