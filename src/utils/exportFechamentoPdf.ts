import { geradoEmSP } from "@/lib/datetime";
// src/utils/exportFechamentoPdf.ts
// PDFs do Fechamento Mensal de Comissões (RH) — dois níveis (Natan):
//   * RESUMIDO: os totais dos "botões" (extrato), seccionado por loja com
//     subtotais, metas de cada semana e prêmios — conclusivo e interpretativo.
//   * ANALÍTICO: o mesmo racional EXPANDIDO por operações (venda/NF/OS,
//     forma, origem, taxa, comissão linha a linha).
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ResultadoVendedor } from "@/lib/comissoes/motorComissao";

export interface SemanaPdf {
  semanaInicio: string;
  semanaFim: string;
  statusLabel: string;
  /** meta do recorte: da LOJA (sem filtro) ou do VENDEDOR filtrado */
  metaLoja: number;
  baseTotal: number;
  comissao: number;
  premios: number;
  aPagar: number;
}

export interface LojaPdf {
  nome: string;
  consolidado: ResultadoVendedor[];
  semanas: SemanaPdf[];
  temParcial: boolean;
}

export interface FechamentoPdfParams {
  titulo: string;
  periodoLabel: string; // "Junho 2026 (21/05 a 20/06) — modo RECEBIDO"
  lojas: LojaPdf[];
  geradoEm?: Date;
  /** rótulo da coluna de meta semanal ("Meta da loja" | "Meta do vendedor") */
  metaLabel?: string;
}

const brl = (n: number) =>
  `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dt = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

function cabecalho(doc: jsPDF, params: FechamentoPdfParams, subtitulo: string) {
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(params.titulo, 14, 14);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`${params.periodoLabel} · ${subtitulo}`, 14, 20);
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    `Gerado em ${geradoEmSP(params.geradoEm ?? new Date())} — fechamentos congelados são o documento probatório do pagamento (reabertura só ADM)`,
    14,
    25
  );
  doc.setTextColor(0);
}

function rodapeParcial(doc: jsPDF, y: number, temParcial: boolean): number {
  if (!temParcial) return y;
  doc.setFontSize(8);
  doc.setTextColor(180, 80, 0);
  doc.text(
    "⚠ Contém semanas PARCIAIS (não fechadas) — valores sujeitos a alteração até o fechamento.",
    14,
    y
  );
  doc.setTextColor(0);
  return y + 5;
}

function secaoLoja(
  doc: jsPDF,
  loja: LojaPdf,
  analitico: boolean,
  metaLabel: string
): void {
  const startY = (doc as any).lastAutoTable?.finalY
    ? (doc as any).lastAutoTable.finalY + 8
    : 32;
  let y = startY > 265 ? (doc.addPage(), 16) : startY;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(loja.nome, 14, y);
  doc.setFont("helvetica", "normal");
  y = rodapeParcial(doc, y + 4, loja.temParcial);

  // metas e prêmios por semana (interpretativo)
  autoTable(doc, {
    startY: y + 1,
    head: [["Semana", "Status", metaLabel, "Base recebida", "Comissão", "Prêmios (apurados por semana)", "A pagar"]],
    body: loja.semanas.map((s) => [
      `${dt(s.semanaInicio)} – ${dt(s.semanaFim)}`,
      s.statusLabel,
      brl(s.metaLoja),
      brl(s.baseTotal),
      brl(s.comissao),
      brl(s.premios),
      brl(s.aPagar),
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [40, 60, 120] },
    theme: "grid",
    margin: { left: 14, right: 14 },
  });

  // resumo por vendedor (os "botões" do extrato)
  const totais = loja.consolidado.reduce(
    (t, v) => ({
      meta: t.meta + v.metaSemana,
      emitido: t.emitido + (v.basePorOrigem.vendasEmitidas ?? 0),
      ato: t.ato + v.basePorOrigem.vendaPeriodo,
      anterior: t.anterior + v.basePorOrigem.saldoAnterior,
      aReceber: t.aReceber + (v.basePorOrigem.saldoAReceber ?? 0),
      base: t.base + v.baseTotal,
      restit: t.restit + v.restituicoes,
      comissao: t.comissao + v.comissao,
      premios: t.premios + v.premioValor,
      pagar: t.pagar + v.totalPagar,
    }),
    { meta: 0, emitido: 0, ato: 0, anterior: 0, aReceber: 0, base: 0, restit: 0, comissao: 0, premios: 0, pagar: 0 }
  );

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 3,
    head: [[
      "Vendedor", "Meta mês", "% Meta", "Vendeu (emitido)", "Receb. no ato",
      "Receb. meses ant.", "Ficou a receber", "Base", "Restit.", "Comissão", "Prêmios", "A pagar",
    ]],
    body: [
      ...loja.consolidado.map((v) => [
        v.vendedorNome ?? `Vendedor ${v.codVendedor}`,
        brl(v.metaSemana),
        `${v.percentualMeta}%`,
        brl(v.basePorOrigem.vendasEmitidas ?? 0),
        brl(v.basePorOrigem.vendaPeriodo),
        brl(v.basePorOrigem.saldoAnterior),
        brl(v.basePorOrigem.saldoAReceber ?? 0),
        brl(v.baseTotal),
        v.restituicoes ? `- ${brl(v.restituicoes)}` : "—",
        brl(v.comissao),
        v.premioValor ? brl(v.premioValor) : "—",
        brl(v.totalPagar),
      ]),
      [
        { content: `SUBTOTAL ${loja.nome}`, styles: { fontStyle: "bold" } },
        { content: brl(totais.meta), styles: { fontStyle: "bold" } },
        "",
        { content: brl(totais.emitido), styles: { fontStyle: "bold" } },
        { content: brl(totais.ato), styles: { fontStyle: "bold" } },
        { content: brl(totais.anterior), styles: { fontStyle: "bold" } },
        { content: brl(totais.aReceber), styles: { fontStyle: "bold" } },
        { content: brl(totais.base), styles: { fontStyle: "bold" } },
        { content: totais.restit ? `- ${brl(totais.restit)}` : "—", styles: { fontStyle: "bold" } },
        { content: brl(totais.comissao), styles: { fontStyle: "bold" } },
        { content: brl(totais.premios), styles: { fontStyle: "bold" } },
        { content: brl(totais.pagar), styles: { fontStyle: "bold" } },
      ] as any,
    ],
    styles: { fontSize: 7 },
    headStyles: { fillColor: [60, 60, 60] },
    theme: "striped",
    margin: { left: 14, right: 14 },
  });

  if (analitico) {
    for (const v of loja.consolidado) {
      if (!v.detalhe.length) continue;
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 3,
        head: [[
          { content: `${v.vendedorNome ?? `Vendedor ${v.codVendedor}`} — operações`, colSpan: 9, styles: { halign: "left", fillColor: [90, 90, 120] } } as any,
        ], ["Venda", "NF", "OS(s)", "Emissão", "Pagamento", "Forma", "Origem", "Valor", "Comissão"]],
        body: [
          ...v.detalhe.map((d) => [
            String(d.numeroVenda ?? d.codTransacao),
            String(d.numeroNf ?? "—"),
            d.osList ?? "—",
            dt(d.dataEmissao),
            dt(d.dataPagamento),
            d.formaCategoria,
            d.origem === "VENDA_PERIODO" ? "Venda do período" : "Saldo anterior",
            brl(d.valor),
            `${brl(d.comissao)} (${d.taxa}%)`,
          ]),
          [
            { content: `Total ${v.vendedorNome ?? v.codVendedor}`, colSpan: 7, styles: { fontStyle: "bold" } } as any,
            { content: brl(v.baseTotal), styles: { fontStyle: "bold" } } as any,
            { content: brl(v.comissao), styles: { fontStyle: "bold" } } as any,
          ],
        ],
        styles: { fontSize: 6.5 },
        theme: "grid",
        margin: { left: 14, right: 14 },
      });
    }
  }
}

function totalGeral(doc: jsPDF, lojas: LojaPdf[]) {
  const g = lojas.reduce(
    (t, l) => {
      l.consolidado.forEach((v) => {
        t.base += v.baseTotal;
        t.comissao += v.comissao;
        t.premios += v.premioValor;
        t.pagar += v.totalPagar;
      });
      return t;
    },
    { base: 0, comissao: 0, premios: 0, pagar: 0 }
  );
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 6,
    head: [["TOTAL GERAL", "Base", "Comissão", "Prêmios", "A pagar"]],
    body: [["Todas as lojas do relatório", brl(g.base), brl(g.comissao), brl(g.premios), brl(g.pagar)]],
    styles: { fontSize: 9, fontStyle: "bold" },
    headStyles: { fillColor: [20, 20, 20] },
    theme: "grid",
    margin: { left: 14, right: 14 },
  });
}

export function gerarPdfFechamento(params: FechamentoPdfParams, analitico: boolean) {
  const doc = new jsPDF({ orientation: "landscape" });
  cabecalho(doc, params, analitico ? "Relatório ANALÍTICO (expandido por operações)" : "Relatório RESUMIDO");
  // só lojas com movimento no recorte filtrado — sem seções vazias
  const relevantes = params.lojas.filter(
    (l) => l.consolidado.length > 0 && l.consolidado.some((v) => v.baseTotal > 0 || v.totalPagar > 0)
  );
  for (const loja of relevantes) {
    secaoLoja(doc, loja, analitico, params.metaLabel ?? "Meta da loja");
  }
  totalGeral(doc, relevantes);
  const sufixo = analitico ? "analitico" : "resumido";
  doc.save(`${params.titulo.replace(/\s+/g, "_").toLowerCase()}_${sufixo}.pdf`);
}
