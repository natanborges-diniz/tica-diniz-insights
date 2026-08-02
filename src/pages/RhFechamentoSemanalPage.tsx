// src/pages/RhFechamentoSemanalPage.tsx
// Fase 4 (revisada) — Fechamento de comissões p/ RH com visão MENSAL:
// o pagamento é sempre do MÊS COMERCIAL (21→20); a tela consolida as semanas
// do mês por vendedor, mostrando PARCIAIS ao vivo para semanas ainda não
// fechadas (e "em andamento" para a semana corrente). Cada semana é congelada
// individualmente (snapshot imutável); "Fechar mês" fecha todas as semanas já
// terminadas. Export XLSX mensal consolidado + detalhe por OS.

import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  FileSpreadsheet, Lock, Unlock, Calculator, AlertTriangle, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { useEmpresas } from "@/hooks/useEmpresas";
import {
  gerarPrevia,
  fecharSemana,
  listarFechamentos,
  getFechamentoItens,
  reabrirFechamento,
  semanasDoMes,
  getSaldosAbertos,
  type PreviaFechamento,
  type ModoFechamento,
  type SaldoAberto,
} from "@/services/fechamentoService";
import {
  consolidarVendedores,
  type ResultadoVendedor,
} from "@/lib/comissoes/motorComissao";
import { gerarPdfFechamento, type LojaPdf } from "@/utils/exportFechamentoPdf";
import { getMetasSemanais } from "@/services/metasSemanaisService";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// última consulta gerada sobrevive à navegação entre telas (memória da sessão)
let ultimaConsulta: {
  mes: number;
  modo: string;
  visao: LojaView[];
} | null = null;

type StatusSemana = "FECHADA" | "REABERTA" | "PARCIAL" | "EM_ANDAMENTO";

interface SemanaView {
  semanaInicio: string;
  semanaFim: string;
  status: StatusSemana;
  fechamentoId?: string;
  previa?: PreviaFechamento;
  vendedores: ResultadoVendedor[];
  avisos: string[];
}

interface LojaView {
  codEmpresa: number;
  nome: string;
  semanas: SemanaView[];
  consolidado: ResultadoVendedor[];
  temParcial: boolean;
  saldosAbertos: SaldoAberto[];
}

function fmtBRL(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtData(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

const STATUS_BADGE: Record<StatusSemana, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  FECHADA: { label: "Fechada", variant: "default" },
  REABERTA: { label: "Reaberta", variant: "destructive" },
  PARCIAL: { label: "Parcial (não fechada)", variant: "secondary" },
  EM_ANDAMENTO: { label: "Em andamento", variant: "outline" },
};

// ---------- export XLSX mensal (resumo consolidado + detalhe) ----------
function exportarXlsxMensal(titulo: string, loja: LojaView, vendedores: ResultadoVendedor[], filtro: (vs: ResultadoVendedor[]) => ResultadoVendedor[]) {
  const wb = XLSX.utils.book_new();
  const resumo = vendedores.map((v) => ({
    "Cód. Vendedor": v.codVendedor,
    Vendedor: v.vendedorNome ?? "",
    "Meta do Mês": v.metaSemana,
    "% Meta": v.percentualMeta,
    "Recebido no Ato (Vendas do Período)": v.basePorOrigem.vendaPeriodo,
    "Recebido de Períodos Anteriores": v.basePorOrigem.saldoAnterior,
    "Emitido em OS no Período": v.basePorOrigem.vendasEmitidas ?? "",
    "Ficou a Receber (Período)": v.basePorOrigem.saldoAReceber ?? "",
    "Base Total (Recebido)": v.baseTotal,
    Restituições: v.restituicoes,
    Comissão: v.comissao,
    Prêmios: v.premioValor,
    "Total a Pagar": v.totalPagar,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), "Resumo Mensal");

  const porSemana = loja.semanas.flatMap((s) =>
    filtro(s.vendedores).map((v) => ({
      Semana: `${s.semanaInicio} a ${s.semanaFim}`,
      Status: STATUS_BADGE[s.status].label,
      "Cód. Vendedor": v.codVendedor,
      Vendedor: v.vendedorNome ?? "",
      Base: v.baseTotal,
      Restituições: v.restituicoes,
      Comissão: v.comissao,
      Prêmio: v.premioValor,
      "A Pagar": v.totalPagar,
    }))
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(porSemana), "Por Semana");

  const detalhe = loja.semanas.flatMap((s) =>
    filtro(s.vendedores).flatMap((v) =>
      v.detalhe.map((d) => ({
        Semana: s.semanaInicio,
        "Cód. Vendedor": v.codVendedor,
        Vendedor: v.vendedorNome ?? "",
        Venda: d.numeroVenda ?? d.codTransacao,
        NF: d.numeroNf ?? "",
        "OS(s)": d.osList ?? "",
        Emissão: d.dataEmissao,
        Pagamento: d.dataPagamento,
        Forma: d.formaCategoria,
        Origem: d.origem,
        Valor: d.valor,
        "Taxa %": d.taxa,
        Comissão: d.comissao,
      }))
    )
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalhe), "Detalhe por OS");

  if (loja.saldosAbertos.length) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        loja.saldosAbertos.map((sa) => ({
          "Cód. Vendedor": sa.codVendedor,
          Vendedor: sa.vendedorNome ?? "",
          Venda: sa.numeroVenda ?? sa.codTransacao,
          NF: sa.numeroNf ?? "",
          "OS(s)": sa.osList ?? "",
          Emissão: sa.dataEmissao,
          Vencimento: sa.dataVencimento ?? "",
          "Forma Registrada": sa.formaCategoria,
          "Valor em Aberto": sa.valorAberto,
        }))
      ),
      "Saldos a Receber"
    );
  }
  XLSX.writeFile(wb, `${titulo}.xlsx`);
}

// ---------- tabela de vendedores ----------
function TabelaFechamento({ vendedores, metaLabel, origemFiltro = "ALL", formaFiltro = "ALL" }: {
  vendedores: ResultadoVendedor[];
  metaLabel?: string;
  origemFiltro?: "ALL" | "VENDA_PERIODO" | "SALDO_ANTERIOR";
  formaFiltro?: string;
}) {
  const [aberto, setAberto] = useState<number | null>(null);
  const filtraDetalhe = (d: ResultadoVendedor["detalhe"]) =>
    d.filter(
      (x) =>
        (origemFiltro === "ALL" || x.origem === origemFiltro) &&
        (formaFiltro === "ALL" || x.formaCategoria === formaFiltro)
    );
  const tot = vendedores.reduce(
    (t, v) => ({
      meta: t.meta + v.metaSemana,
      base: t.base + v.baseTotal,
      restit: t.restit + v.restituicoes,
      comissao: t.comissao + v.comissao,
      premios: t.premios + v.premioValor,
      pagar: t.pagar + v.totalPagar,
    }),
    { meta: 0, base: 0, restit: 0, comissao: 0, premios: 0, pagar: 0 }
  );
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Vendedor</TableHead>
          <TableHead className="text-right">{metaLabel ?? "Meta"}</TableHead>
          <TableHead className="text-right">% Meta</TableHead>
          <TableHead className="text-right">Base</TableHead>
          <TableHead className="text-right">Restit.</TableHead>
          <TableHead className="text-right">Comissão</TableHead>
          <TableHead className="text-right">Prêmios</TableHead>
          <TableHead className="text-right">A pagar</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {vendedores.map((v) => (
          <>
            <TableRow key={v.codVendedor}>
              <TableCell>
                <span className="font-medium">
                  {v.vendedorNome ?? (v.codVendedor === 0 ? "Sem vendedor" : `Vendedor ${v.codVendedor}`)}
                </span>
                <div className="text-xs text-muted-foreground space-x-2">
                  <span title="Recebido no ato das vendas do período (entrada paga no cadastro da OS)">
                    recebido no ato: <strong>R$ {fmtBRL(v.basePorOrigem.vendaPeriodo)}</strong>
                  </span>
                  <span title="Recebido no período de OS de períodos anteriores">
                    · de períodos anteriores: <strong>R$ {fmtBRL(v.basePorOrigem.saldoAnterior)}</strong>
                  </span>
                  {v.basePorOrigem.vendasEmitidas != null && (
                    <span title="Total emitido em OS no período">
                      · emitido no período: <strong>R$ {fmtBRL(v.basePorOrigem.vendasEmitidas)}</strong>
                    </span>
                  )}
                  {v.basePorOrigem.saldoAReceber != null && (
                    <span title="Saldo das vendas do período que ficou a receber (não comissiona até ser pago)">
                      · ficou a receber: <strong>R$ {fmtBRL(v.basePorOrigem.saldoAReceber)}</strong>
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right">R$ {fmtBRL(v.metaSemana)}</TableCell>
              <TableCell className="text-right">{v.percentualMeta}%</TableCell>
              <TableCell className="text-right">R$ {fmtBRL(v.baseTotal)}</TableCell>
              <TableCell className="text-right">
                {v.restituicoes > 0 ? `- R$ ${fmtBRL(v.restituicoes)}` : "—"}
              </TableCell>
              <TableCell className="text-right">R$ {fmtBRL(v.comissao)}</TableCell>
              <TableCell className="text-right">
                {v.premioValor > 0 ? `R$ ${fmtBRL(v.premioValor)}` : "—"}
              </TableCell>
              <TableCell className="text-right font-semibold">R$ {fmtBRL(v.totalPagar)}</TableCell>
              <TableCell>
                {v.detalhe.length > 0 && (
                  <Button
                    variant="ghost" size="icon" title="Detalhe por OS/venda"
                    onClick={() => setAberto(aberto === v.codVendedor ? null : v.codVendedor)}
                  >
                    <ChevronDown className={`h-4 w-4 transition-transform ${aberto === v.codVendedor ? "rotate-180" : ""}`} />
                  </Button>
                )}
              </TableCell>
            </TableRow>
            {aberto === v.codVendedor && (
              <TableRow key={`${v.codVendedor}-det`}>
                <TableCell colSpan={9} className="bg-muted/40">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Venda</TableHead>
                        <TableHead>NF</TableHead>
                        <TableHead>OS(s)</TableHead>
                        <TableHead>Emissão</TableHead>
                        <TableHead>Pagamento</TableHead>
                        <TableHead>Forma</TableHead>
                        <TableHead>Origem</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead className="text-right">Taxa</TableHead>
                        <TableHead className="text-right">Comissão</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtraDetalhe(v.detalhe).map((d, i) => (
                        <TableRow key={i}>
                          <TableCell>{d.numeroVenda ?? d.codTransacao}</TableCell>
                          <TableCell className="text-xs">{d.numeroNf ?? "—"}</TableCell>
                          <TableCell className="text-xs">{d.osList ?? "—"}</TableCell>
                          <TableCell>{fmtData(d.dataEmissao)}</TableCell>
                          <TableCell>{fmtData(d.dataPagamento)}</TableCell>
                          <TableCell>{d.formaCategoria}</TableCell>
                          <TableCell className="text-xs">{d.origem}</TableCell>
                          <TableCell className="text-right">R$ {fmtBRL(d.valor)}</TableCell>
                          <TableCell className="text-right">{d.taxa}%</TableCell>
                          <TableCell className="text-right">R$ {fmtBRL(d.comissao)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableCell>
              </TableRow>
            )}
          </>
        ))}
        <TableRow className="bg-muted/50">
          <TableCell className="font-bold">Subtotal ({vendedores.length} vendedor(es))</TableCell>
          <TableCell className="text-right font-bold">R$ {fmtBRL(tot.meta)}</TableCell>
          <TableCell className="text-right font-bold">
            {tot.meta > 0 ? `${Math.round((tot.base / tot.meta) * 10000) / 100}%` : "—"}
          </TableCell>
          <TableCell className="text-right font-bold">R$ {fmtBRL(tot.base)}</TableCell>
          <TableCell className="text-right font-bold">
            {tot.restit > 0 ? `- R$ ${fmtBRL(tot.restit)}` : "—"}
          </TableCell>
          <TableCell className="text-right font-bold">R$ {fmtBRL(tot.comissao)}</TableCell>
          <TableCell className="text-right font-bold">
            {tot.premios > 0 ? `R$ ${fmtBRL(tot.premios)}` : "—"}
          </TableCell>
          <TableCell className="text-right font-bold">R$ {fmtBRL(tot.pagar)}</TableCell>
          <TableCell />
        </TableRow>
      </TableBody>
    </Table>
  );
}

export default function RhFechamentoSemanalPage() {
  const { isAdmin } = useAuth();
  const { empresas } = useEmpresas();

  const hoje = new Date().toISOString().split("T")[0];
  const [ano] = useState(new Date().getFullYear());
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [lojasSel, setLojasSel] = useState<Set<number>>(new Set());
  const [modo, setModo] = useState<ModoFechamento>("RECEBIDO");

  const [visao, setVisaoState] = useState<LojaView[]>([]);
  const setVisao = (v: LojaView[], persistir?: { mes: number; modo: string }) => {
    setVisaoState(v);
    if (persistir && v.length) ultimaConsulta = { ...persistir, visao: v };
  };
  const [vendedorSel, setVendedorSel] = useState<string>("ALL");
  const [agrupamento, setAgrupamento] = useState<"LOJA" | "VENDEDOR">("LOJA");
  const [origemSel, setOrigemSel] = useState<"ALL" | "VENDA_PERIODO" | "SALDO_ANTERIOR">("ALL");
  const [formaSel, setFormaSel] = useState<string>("ALL");
  const [gerando, setGerando] = useState(false);
  const [progresso, setProgresso] = useState<{ feitas: number; total: number } | null>(null);

  const [fechando, setFechando] = useState(false);

  // restaura a última consulta ao voltar para a tela
  useEffect(() => {
    if (ultimaConsulta && ultimaConsulta.mes === mes && ultimaConsulta.modo === modo && !visao.length) {
      setVisaoState(ultimaConsulta.visao);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!(ultimaConsulta && ultimaConsulta.mes === mes && ultimaConsulta.modo === modo)) {
      setVisaoState([]);
    }
  }, [mes, modo]);

  const gerarVisao = useCallback(async () => {
    // lojas OPCIONAIS: nada selecionado = rede toda (a comissão do vendedor
    // precisa enxergar passagens por qualquer loja)
    const lojasAlvo = lojasSel.size
      ? [...lojasSel]
      : empresas.map((e) => e.codEmpresa);
    if (!lojasAlvo.length) {
      toast.error("Nenhuma loja disponível");
      return;
    }
    setGerando(true);
    setProgresso(null);
    try {
      const semanas = await semanasDoMes(ano, mes);
      if (!semanas.length) {
        toast.error(`Sem semanas geradas para ${MESES[mes - 1]} — configure em Metas primeiro`);
        return;
      }
      const fechados = await listarFechamentos({ ano, mes });
      const codigos = lojasAlvo.sort((a, b) => a - b);

      // Cada célula loja×semana é uma consulta ao ERP (até 60s cada).
      // Executamos em paralelo com limite de concorrência para não travar.
      const tarefas: Array<{ cod: number; nome: string; idx: number; s: typeof semanas[number] }> = [];
      codigos.forEach((cod) => {
        const nome = empresas.find((e) => e.codEmpresa === cod)?.nome ?? `Loja ${cod}`;
        semanas.forEach((s, idx) => tarefas.push({ cod, nome, idx, s }));
      });

      const total = tarefas.length;
      let concluidas = 0;
      setProgresso({ feitas: 0, total });

      const buckets = new Map<number, SemanaView[]>();
      codigos.forEach((cod) => buckets.set(cod, new Array(semanas.length)));

      let cursor = 0;
      const CONCORRENCIA = 5;
      const worker = async () => {
        while (cursor < tarefas.length) {
          const t = tarefas[cursor++];
          const { cod, nome, idx, s } = t;
          const fechado = fechados.find(
            (f) => f.codEmpresa === cod && f.semanaInicio === s.semanaInicio
          );
          let view: SemanaView;
          if (fechado && fechado.status === "FECHADO") {
            view = {
              ...s,
              status: "FECHADA",
              fechamentoId: fechado.id,
              vendedores: await getFechamentoItens(fechado.id),
              avisos: [],
            };
          } else {
            // semanas encerradas: cache de 6h no bridge (dados estáveis);
            // só a semana corrente vai ao Firebird ao vivo
            const previa = await gerarPrevia(cod, nome, ano, mes, s.semanaInicio, s.semanaFim, modo, {
              permitirCache: s.semanaFim < hoje,
            });
            view = {
              ...s,
              status: fechado?.status === "REABERTO"
                ? "REABERTA"
                : s.semanaFim < hoje
                  ? "PARCIAL"
                  : "EM_ANDAMENTO",
              fechamentoId: fechado?.id,
              previa,
              vendedores: previa.vendedores,
              avisos: previa.avisos,
            };
          }
          buckets.get(cod)![idx] = view;
          concluidas += 1;
          setProgresso({ feitas: concluidas, total });
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(CONCORRENCIA, tarefas.length) }, () => worker())
      );

      const resultado: LojaView[] = [];
      for (const cod of codigos) {
        const nome = empresas.find((e) => e.codEmpresa === cod)?.nome ?? `Loja ${cod}`;
        const views = (buckets.get(cod) ?? []).filter(Boolean) as SemanaView[];
        let saldosAbertos: SaldoAberto[] = [];
        try {
          saldosAbertos = await getSaldosAbertos(
            cod,
            semanas[0].semanaInicio,
            semanas[semanas.length - 1].semanaFim
          );
        } catch {
          toast.warning(`${nome}: não foi possível carregar os saldos a receber`);
        }
        resultado.push({
          codEmpresa: cod,
          nome,
          semanas: views,
          consolidado: consolidarVendedores(views.map((v) => v.vendedores)),
          temParcial: views.some((v) => v.status !== "FECHADA"),
          saldosAbertos,
        });
      }
      setVisao(resultado, { mes, modo });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar visão do mês");
    } finally {
      setGerando(false);
      setProgresso(null);
    }
  }, [lojasSel, ano, mes, modo, empresas, hoje]);


  const vendedoresDaVisao = (() => {
    const m = new Map<number, string>();
    visao.forEach((l) =>
      l.consolidado.forEach((v) =>
        m.set(v.codVendedor, v.vendedorNome ?? `Vendedor ${v.codVendedor}`)
      )
    );
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  })();

  const filtraVendedor = (vs: ResultadoVendedor[]) =>
    vendedorSel === "ALL" ? vs : vs.filter((v) => String(v.codVendedor) === vendedorSel);

  const handleFecharSemana = async (loja: LojaView, s: SemanaView) => {
    if (!s.previa) return;
    if (s.status === "EM_ANDAMENTO" &&
      !window.confirm("Esta semana ainda está em andamento — fechar mesmo assim?")) return;
    setFechando(true);
    try {
      await fecharSemana(s.previa);
      toast.success(`Semana ${fmtData(s.semanaInicio)} fechada — ${loja.nome}`);
      await gerarVisao();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao fechar semana");
    } finally {
      setFechando(false);
    }
  };

  const handleFecharMes = async (loja: LojaView) => {
    const abertas = loja.semanas.filter(
      (s) => (s.status === "PARCIAL" || s.status === "REABERTA") && s.previa
    );
    if (!abertas.length) {
      toast.info("Nenhuma semana terminada pendente de fechamento nesta loja");
      return;
    }
    if (!window.confirm(
      `Fechar ${abertas.length} semana(s) de ${MESES[mes - 1]} de ${loja.nome}? Os fechamentos são imutáveis.`
    )) return;
    setFechando(true);
    try {
      for (const s of abertas) {
        await fecharSemana(s.previa!);
      }
      toast.success(`Mês fechado (${abertas.length} semana(s)) — ${loja.nome}`);
      await gerarVisao();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao fechar mês");
    } finally {
      setFechando(false);
    }
  };

  const exportarPdf = async (analitico: boolean) => {
    if (!visao.length) {
      toast.error("Gere a visão do mês antes de exportar");
      return;
    }
    try {
      const lojasPdf: LojaPdf[] = [];
      for (const loja of visao) {
        // meta da LOJA por semana (interpretativo: meta × realizado × prêmio)
        const metasLoja = await getMetasSemanais({ tipo: "LOJA", codEmpresa: loja.codEmpresa, ano, mes });
        lojasPdf.push({
          nome: loja.nome,
          consolidado: filtraVendedor(loja.consolidado),
          temParcial: loja.temParcial,
          semanas: loja.semanas.map((sv) => {
            const vend = filtraVendedor(sv.vendedores);
            return {
              semanaInicio: sv.semanaInicio,
              semanaFim: sv.semanaFim,
              statusLabel: STATUS_BADGE[sv.status].label,
              metaLoja: metasLoja.find((m) => m.semanaInicio === sv.semanaInicio)?.metaValor ?? 0,
              baseTotal: vend.reduce((t, v) => t + v.baseTotal, 0),
              comissao: vend.reduce((t, v) => t + v.comissao, 0),
              premios: vend.reduce((t, v) => t + v.premioValor, 0),
              aPagar: vend.reduce((t, v) => t + v.totalPagar, 0),
            };
          }),
        });
      }
      const vendedorLabel =
        vendedorSel === "ALL" ? "" : ` — ${vendedoresDaVisao.find(([c]) => String(c) === vendedorSel)?.[1] ?? vendedorSel}`;
      gerarPdfFechamento(
        {
          titulo: `Fechamento de Comissões ${MESES[mes - 1]} ${ano}${vendedorLabel}`,
          periodoLabel: `Mês comercial ${MESES[mes - 1]} ${ano} (21→20) · modo ${modo}`,
          lojas: lojasPdf,
        },
        analitico
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar PDF");
    }
  };

  const handleReabrir = async (s: SemanaView) => {
    if (!s.fechamentoId) return;
    if (!window.confirm(`Reabrir a semana ${fmtData(s.semanaInicio)}? A reabertura fica registrada.`)) return;
    try {
      await reabrirFechamento(s.fechamentoId);
      toast.success("Semana reaberta — gere a visão novamente para refazer");
      await gerarVisao();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao reabrir");
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Calculator className="h-5 w-5" />
          Fechamento Mensal — Comissões (RH)
        </h1>
        <p className="text-sm text-muted-foreground">
          Pagamento sempre pelo mês comercial (21→20) · semanas não fechadas aparecem como PARCIAIS
        </p>
      </div>

      {/* Seleção */}
      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label>Mês comercial</Label>
              <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MESES.map((n, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{n} {ano}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Modo</Label>
              <Select value={modo} onValueChange={(v) => setModo(v as ModoFechamento)}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="RECEBIDO">Recebido (padrão)</SelectItem>
                  <SelectItem value="EMITIDO">Emitido em OS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={gerarVisao} disabled={gerando}>
              <Calculator className="h-4 w-4 mr-2" />
              {gerando
                ? progresso
                  ? `Calculando ${progresso.feitas}/${progresso.total}...`
                  : "Calculando..."
                : "Gerar visão do mês"}
            </Button>
            {visao.length > 0 && (
              <>
                <div className="space-y-2">
                  <Label>Agrupar por</Label>
                  <Select value={agrupamento} onValueChange={(v) => setAgrupamento(v as "LOJA" | "VENDEDOR")}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOJA">Loja</SelectItem>
                      <SelectItem value="VENDEDOR">Vendedor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Vendedor</Label>
                  <Select value={vendedorSel} onValueChange={setVendedorSel}>
                    <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Todos os vendedores</SelectItem>
                      {vendedoresDaVisao.map(([cod, nome]) => (
                        <SelectItem key={cod} value={String(cod)}>{nome} ({cod})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Origem (detalhe)</Label>
                  <Select value={origemSel} onValueChange={(v) => setOrigemSel(v as typeof origemSel)}>
                    <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Todas as origens</SelectItem>
                      <SelectItem value="VENDA_PERIODO">Venda do período</SelectItem>
                      <SelectItem value="SALDO_ANTERIOR">Recebimento de períodos anteriores</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Forma (detalhe)</Label>
                  <Select value={formaSel} onValueChange={setFormaSel}>
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Todas as formas</SelectItem>
                      {["CARTAO_CREDITO", "CARTAO_DEBITO", "PIX", "AVISTA", "CREDIARIO", "CHEQUE", "CONVENIO", "CREDITOS", "OUTROS"].map((f) => (
                        <SelectItem key={f} value={f}>{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" onClick={() => window.print()}>
                  Imprimir
                </Button>
                <Button variant="outline" onClick={() => exportarPdf(false)}>
                  PDF Resumido
                </Button>
                <Button variant="outline" onClick={() => exportarPdf(true)}>
                  PDF Analítico
                </Button>
              </>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Lojas (nenhuma selecionada = rede toda)</Label>
            <div className="flex flex-wrap gap-2">
              {empresas.map((emp) => (
                <label
                  key={emp.codEmpresa}
                  className={[
                    "flex items-center gap-1.5 text-sm border rounded-full px-3 py-1 cursor-pointer select-none",
                    lojasSel.has(emp.codEmpresa) ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted",
                  ].join(" ")}
                >
                  <Checkbox
                    className="hidden"
                    checked={lojasSel.has(emp.codEmpresa)}
                    onCheckedChange={() => {
                      const novo = new Set(lojasSel);
                      if (novo.has(emp.codEmpresa)) novo.delete(emp.codEmpresa);
                      else novo.add(emp.codEmpresa);
                      setLojasSel(novo);
                    }}
                  />
                  {emp.nome}
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {gerando && <Skeleton className="h-64" />}

      {/* ---------- VISÃO POR VENDEDOR (consolidada nas lojas selecionadas) ---------- */}
      {!gerando && agrupamento === "VENDEDOR" && visao.length > 0 && (() => {
        const todos = filtraVendedor(consolidarVendedores(visao.map((l) => l.consolidado)));
        const totalGeral = todos.reduce((t, v) => t + v.totalPagar, 0);
        const temParcial = visao.some((l) => l.temParcial);
        return (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2">
                  Por Vendedor — {MESES[mes - 1]} {ano}
                  <Badge variant="outline">{modo}</Badge>
                  {temParcial && <Badge variant="secondary">inclui parciais</Badge>}
                </CardTitle>
                <CardDescription>
                  {visao.length} loja(s) consideradas (passagens por outras lojas incluídas) · cada linha traz as fontes do valor
                  (recebido no ato, de períodos anteriores, emitido e a receber) — expanda para o
                  detalhe por OS/venda · <strong>total a pagar R$ {fmtBRL(totalGeral)}</strong>
                </CardDescription>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  const wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(
                    wb,
                    XLSX.utils.json_to_sheet(
                      todos.map((v) => ({
                        "Cód. Vendedor": v.codVendedor,
                        Vendedor: v.vendedorNome ?? "",
                        "Meta do Mês": v.metaSemana,
                        "% Meta": v.percentualMeta,
                        "Recebido no Ato (Vendas do Período)": v.basePorOrigem.vendaPeriodo,
                        "Recebido de Períodos Anteriores": v.basePorOrigem.saldoAnterior,
                        "Emitido em OS no Período": v.basePorOrigem.vendasEmitidas ?? "",
                        "Ficou a Receber (Período)": v.basePorOrigem.saldoAReceber ?? "",
                        "Base Total (Recebido)": v.baseTotal,
                        Restituições: v.restituicoes,
                        Comissão: v.comissao,
                        Prêmios: v.premioValor,
                        "Total a Pagar": v.totalPagar,
                      }))
                    ),
                    "Por Vendedor"
                  );
                  XLSX.utils.book_append_sheet(
                    wb,
                    XLSX.utils.json_to_sheet(
                      todos.flatMap((v) =>
                        v.detalhe.map((d) => ({
                          "Cód. Vendedor": v.codVendedor,
                          Vendedor: v.vendedorNome ?? "",
                          Venda: d.numeroVenda ?? d.codTransacao,
                          NF: d.numeroNf ?? "",
                          "OS(s)": d.osList ?? "",
                          Emissão: d.dataEmissao,
                          Pagamento: d.dataPagamento,
                          Forma: d.formaCategoria,
                          Origem: d.origem,
                          Valor: d.valor,
                          "Taxa %": d.taxa,
                          Comissão: d.comissao,
                        }))
                      )
                    ),
                    "Detalhe por OS"
                  );
                  const sufixo = vendedorSel === "ALL" ? "" : `_vend${vendedorSel}`;
                  XLSX.writeFile(wb, `fechamento_por_vendedor_${ano}-${String(mes).padStart(2, "0")}${sufixo}.xlsx`);
                }}
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                XLSX por Vendedor
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {vendedorSel !== "ALL" && todos.length === 1 && (() => {
                const v = todos[0];
                const Tile = ({ rotulo, valor, destaque, hint, filtroOrigem }: {
                  rotulo: string; valor: number; destaque?: boolean; hint?: string;
                  filtroOrigem?: "VENDA_PERIODO" | "SALDO_ANTERIOR";
                }) => {
                  const ativo = filtroOrigem && origemSel === filtroOrigem;
                  return (
                    <div
                      className={[
                        "rounded-lg border p-3 transition-colors",
                        destaque ? "bg-primary/5 border-primary/30" : "bg-muted/30",
                        filtroOrigem ? "cursor-pointer hover:border-primary" : "",
                        ativo ? "ring-2 ring-primary border-primary" : "",
                      ].join(" ")}
                      title={filtroOrigem ? `${hint ?? ""} — clique para filtrar o detalhe` : hint}
                      onClick={() => {
                        if (!filtroOrigem) return;
                        setOrigemSel(ativo ? "ALL" : filtroOrigem);
                        toast.info(ativo ? "Filtro de origem removido" : `Detalhe filtrado: ${rotulo}`);
                      }}
                    >
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
                      <p className={`text-xl font-bold ${destaque ? "text-primary" : ""}`}>R$ {fmtBRL(valor)}</p>
                      {ativo && <p className="text-[10px] text-primary">filtrando detalhe ✕</p>}
                    </div>
                  );
                };
                return (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      Extrato de {v.vendedorNome ?? `Vendedor ${v.codVendedor}`} — {MESES[mes - 1]} {ano}
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <Tile rotulo="Vendeu no mês (emitido em OS)" valor={v.basePorOrigem.vendasEmitidas ?? 0}
                        hint="Total emitido em OS/vendas cadastradas no mês comercial" />
                      <Tile rotulo="Recebido no ato (vendas do mês)" valor={v.basePorOrigem.vendaPeriodo}
                        hint="Pago no cadastramento da OS + cartões processados (valor integral)" filtroOrigem="VENDA_PERIODO" />
                      <Tile rotulo="Recebido de meses anteriores" valor={v.basePorOrigem.saldoAnterior}
                        hint="Saldos de OS de períodos anteriores pagos neste mês" filtroOrigem="SALDO_ANTERIOR" />
                      <Tile rotulo="Ficou a receber (vendas do mês)" valor={v.basePorOrigem.saldoAReceber ?? 0}
                        hint="Saldo das vendas do mês ainda em aberto — comissiona quando o cliente pagar" />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <Tile rotulo="Base comissionável" valor={v.baseTotal}
                        hint="Recebido no ato + recebido de meses anteriores − restituições" />
                      <Tile rotulo="Comissão" valor={v.comissao} />
                      <Tile rotulo="Prêmios" valor={v.premioValor} />
                      <Tile rotulo="Total a pagar" valor={v.totalPagar} destaque />
                    </div>
                  </div>
                );
              })()}
              <TabelaFechamento vendedores={todos} metaLabel="Meta do mês" origemFiltro={origemSel} formaFiltro={formaSel} />
            </CardContent>
          </Card>
        );
      })()}

      {agrupamento === "LOJA" && visao.map((loja) => {
        const totalMes = loja.consolidado.reduce((s, v) => s + v.totalPagar, 0);
        return (
          <Card key={loja.codEmpresa}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {loja.nome}
                  <Badge variant="outline">{modo}</Badge>
                  {loja.temParcial ? (
                    <Badge variant="secondary">inclui parciais</Badge>
                  ) : (
                    <Badge>mês 100% fechado</Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {MESES[mes - 1]} {ano} · {loja.semanas.length} semana(s) ·{" "}
                  <strong>total a pagar R$ {fmtBRL(totalMes)}</strong>
                  {loja.temParcial && " (sujeito a alteração até fechar todas as semanas)"}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    const vs = filtraVendedor(loja.consolidado);
                    const sufixo = vendedorSel === "ALL" ? "" : `_vend${vendedorSel}`;
                    exportarXlsxMensal(
                      `fechamento_mensal_${loja.codEmpresa}_${ano}-${String(mes).padStart(2, "0")}${sufixo}`,
                      loja, vs, filtraVendedor
                    );
                  }}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  XLSX Mensal
                </Button>
                {loja.temParcial && (
                  <Button onClick={() => handleFecharMes(loja)} disabled={fechando}>
                    <Lock className="h-4 w-4 mr-2" />
                    Fechar mês
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Consolidado mensal por vendedor */}
              <TabelaFechamento vendedores={filtraVendedor(loja.consolidado)} metaLabel="Meta do mês" origemFiltro={origemSel} formaFiltro={formaSel} />

              {/* Semanas */}
              <Accordion type="multiple">
                {loja.semanas.map((s) => {
                  const badge = STATUS_BADGE[s.status];
                  const totalSemana = s.vendedores.reduce((t, v) => t + v.totalPagar, 0);
                  return (
                    <AccordionItem key={s.semanaInicio} value={s.semanaInicio}>
                      <AccordionTrigger>
                        <span className="flex flex-1 items-center justify-between pr-4 gap-3">
                          <span>
                            Semana {fmtData(s.semanaInicio)} – {fmtData(s.semanaFim)}
                          </span>
                          <span className="flex items-center gap-3">
                            <span className="text-sm">R$ {fmtBRL(totalSemana)}</span>
                            <Badge variant={badge.variant}>{badge.label}</Badge>
                          </span>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-3">
                        {s.avisos.map((a, i) => (
                          <Alert key={i}>
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>{a}</AlertDescription>
                          </Alert>
                        ))}
                        <div className="flex gap-2">
                          {(s.status === "PARCIAL" || s.status === "REABERTA" || s.status === "EM_ANDAMENTO") && s.previa && (
                            <Button size="sm" onClick={() => handleFecharSemana(loja, s)} disabled={fechando}>
                              <Lock className="h-4 w-4 mr-2" />
                              Fechar semana
                            </Button>
                          )}
                          {s.status === "FECHADA" && isAdmin && (
                            <Button size="sm" variant="outline" onClick={() => handleReabrir(s)}>
                              <Unlock className="h-4 w-4 mr-2" />
                              Reabrir (admin)
                            </Button>
                          )}
                        </div>
                        <TabelaFechamento vendedores={filtraVendedor(s.vendedores)} metaLabel="Meta da semana" origemFiltro={origemSel} formaFiltro={formaSel} />
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>

              {/* Saldos a receber em aberto (vendas do mês) */}
              {loja.saldosAbertos.length > 0 && (() => {
                const saldosFiltrados = vendedorSel === "ALL"
                  ? loja.saldosAbertos
                  : loja.saldosAbertos.filter((sa) => String(sa.codVendedor) === vendedorSel);
                const totalAberto = saldosFiltrados.reduce((t, sa) => t + sa.valorAberto, 0);
                return (
                  <Accordion type="single" collapsible>
                    <AccordionItem value="saldos">
                      <AccordionTrigger>
                        <span className="flex flex-1 items-center justify-between pr-4">
                          <span className="font-medium">Saldos a receber em aberto (vendas do mês)</span>
                          <span className="flex items-center gap-2">
                            <Badge variant="secondary">{saldosFiltrados.length} parcela(s)</Badge>
                            <span className="text-sm font-semibold">R$ {fmtBRL(totalAberto)}</span>
                          </span>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <p className="text-xs text-muted-foreground mb-2">
                          Saldo ainda não tem forma de pagamento definida — a comissão assume a forma
                          quando o cliente pagar. Cartões não geram saldo (comissionam no processamento).
                        </p>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Vendedor</TableHead>
                              <TableHead>Venda</TableHead>
                              <TableHead>OS(s)</TableHead>
                              <TableHead>Emissão</TableHead>
                              <TableHead>Vencimento</TableHead>
                              <TableHead>Forma registrada</TableHead>
                              <TableHead className="text-right">Valor em aberto</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {saldosFiltrados.map((sa, i) => (
                              <TableRow key={i}>
                                <TableCell className="font-medium">
                                  {sa.vendedorNome ?? `Vendedor ${sa.codVendedor}`}
                                </TableCell>
                                <TableCell>{sa.numeroVenda ?? sa.codTransacao}</TableCell>
                                <TableCell className="text-xs">{sa.osList ?? "—"}</TableCell>
                                <TableCell>{fmtData(sa.dataEmissao)}</TableCell>
                                <TableCell>{sa.dataVencimento ? fmtData(sa.dataVencimento) : "—"}</TableCell>
                                <TableCell className="text-xs">{sa.formaCategoria}</TableCell>
                                <TableCell className="text-right">R$ {fmtBRL(sa.valorAberto)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                );
              })()}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
