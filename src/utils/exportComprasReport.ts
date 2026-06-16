// src/utils/exportComprasReport.ts
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toPng } from "html-to-image";
import { formatters } from "./exportData";

export interface ComprasReportFilters {
  empresa: string;
  dataInicio: string;
  dataFim: string;
  fornecedores: string;
  contas: string;
  formasPgto: string;
  comparativo: string;
}

export interface ComprasReportKpis {
  total: number;
  notas: number;
  fornecedores: number;
  ticket: number;
  parcelas: number;
  prazoMedio: number;
}

export interface ComprasReportView {
  groupBy: string[];
  columns: { key: string; header: string; type: "dimension" | "measure"; format?: (v: any) => string }[];
  rows: Record<string, any>[];
}

export interface ComprasReportOptions {
  filename: string;
  title: string;
  subtitle?: string;
  filters: ComprasReportFilters;
  kpis: ComprasReportKpis;
  rows: Record<string, any>[];
  view?: ComprasReportView | null;
  chartElement?: HTMLElement | null;
}

const PAGE = { w: 297, h: 210 };
const MARGIN = { l: 14, r: 14, t: 14, b: 14 };
const CONTENT_W = PAGE.w - MARGIN.l - MARGIN.r;

function formatDateBR(value: string): string {
  if (!value) return "—";
  const [y, m, d] = value.split("-");
  return d && m && y ? `${d}/${m}/${y}` : value;
}

function drawHeader(doc: jsPDF, title: string, subtitle: string | undefined, page: number, total: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(20);
  doc.text(title, MARGIN.l, MARGIN.t);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(`Página ${page} de ${total}`, PAGE.w - MARGIN.r, MARGIN.t, { align: "right" });
  if (subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(subtitle, MARGIN.l, MARGIN.t + 5);
  }
  doc.setDrawColor(220);
  doc.setLineWidth(0.3);
  doc.line(MARGIN.l, MARGIN.t + 7, PAGE.w - MARGIN.r, MARGIN.t + 7);
}

function drawFooter(doc: jsPDF) {
  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, MARGIN.l, PAGE.h - 6);
}

function drawFilters(doc: jsPDF, f: ComprasReportFilters, y: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(40);
  doc.text("Filtros aplicados", MARGIN.l, y);
  y += 4;
  const items: Array<[string, string]> = [
    ["Empresa", f.empresa],
    ["Período (emissão)", `${formatDateBR(f.dataInicio)} a ${formatDateBR(f.dataFim)}`],
    ["Fornecedores", f.fornecedores || "Todos"],
    ["Contas contábeis", f.contas || "Todas"],
    ["Formas pgto", f.formasPgto || "Todas"],
    ["Comparativo", f.comparativo],
  ];
  autoTable(doc, {
    startY: y,
    body: items.map(([k, v]) => [k, v]),
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 1.8, textColor: 40 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 40, fillColor: [245, 247, 250] },
      1: { cellWidth: CONTENT_W - 40 },
    },
    margin: { left: MARGIN.l, right: MARGIN.r },
  });
  return (doc as any).lastAutoTable.finalY + 4;
}

function drawKpis(doc: jsPDF, k: ComprasReportKpis, y: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(40);
  doc.text("Indicadores", MARGIN.l, y);
  y += 4;
  const cards: Array<[string, string]> = [
    ["Total Comprado", formatters.currency(k.total)],
    ["Nº de Notas", formatters.number(k.notas)],
    ["Fornecedores", formatters.number(k.fornecedores)],
    ["Ticket Médio", formatters.currency(k.ticket)],
    ["Parcelas", formatters.number(k.parcelas)],
    ["Prazo Médio", `${k.prazoMedio}d`],
  ];
  const gap = 3;
  const cardW = (CONTENT_W - gap * (cards.length - 1)) / cards.length;
  const cardH = 18;
  cards.forEach(([label, value], i) => {
    const x = MARGIN.l + i * (cardW + gap);
    doc.setFillColor(245, 247, 250);
    doc.setDrawColor(220);
    doc.roundedRect(x, y, cardW, cardH, 1.5, 1.5, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(110);
    doc.text(label.toUpperCase(), x + 2, y + 5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(20);
    doc.text(value, x + 2, y + 13);
  });
  return y + cardH + 4;
}

async function drawChart(doc: jsPDF, el: HTMLElement, y: number): Promise<number> {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(40);
  doc.text("Análise gráfica", MARGIN.l, y);
  y += 4;
  const dataUrl = await toPng(el, { backgroundColor: "#ffffff", pixelRatio: 2, cacheBust: true });
  const img = new Image();
  img.src = dataUrl;
  await new Promise<void>((resolve) => {
    if (img.complete) return resolve();
    img.onload = () => resolve();
    img.onerror = () => resolve();
  });
  const ratio = img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 16 / 9;
  const availH = PAGE.h - MARGIN.b - 8 - y;
  let imgW = CONTENT_W;
  let imgH = imgW / ratio;
  if (imgH > availH) {
    imgH = availH;
    imgW = imgH * ratio;
  }
  doc.addImage(dataUrl, "PNG", MARGIN.l + (CONTENT_W - imgW) / 2, y, imgW, imgH, undefined, "FAST");
  return y + imgH + 4;
}

function drawTable(doc: jsPDF, rows: Record<string, any>[], startY: number, view?: ComprasReportView | null) {
  const hasView = view && view.columns.length > 0;
  const columns = hasView
    ? view!.columns
    : [
        { key: "fornecedor", header: "Fornecedor", type: "dimension" as const },
        { key: "empresaNome", header: "Loja", type: "dimension" as const },
        { key: "mes", header: "Mês", type: "dimension" as const },
        { key: "documento", header: "Documento", type: "dimension" as const },
        { key: "conta", header: "Conta", type: "dimension" as const },
        { key: "valorTotal", header: "Valor", type: "measure" as const, format: formatters.currency },
        { key: "qtdParcelas", header: "Parcelas", type: "measure" as const, format: formatters.number },
      ];
  const source = hasView ? view!.rows : rows;
  const head = [columns.map(c => c.header)];
  const body = source.map(row =>
    columns.map(c => {
      const v = row[c.key];
      if (v === null || v === undefined || v === "") return "—";
      return c.format ? c.format(v) : String(v);
    })
  );
  const columnStyles: Record<number, any> = {};
  columns.forEach((c, i) => {
    if (c.type === "measure") columnStyles[i] = { halign: "right" };
  });
  autoTable(doc, {
    head, body, startY,
    theme: "striped",
    styles: { fontSize: 8, cellPadding: 1.8, overflow: "linebreak" },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles,
    margin: { left: MARGIN.l, right: MARGIN.r, top: MARGIN.t + 10, bottom: MARGIN.b + 8 },
  });
}

export async function exportComprasReport(opts: ComprasReportOptions): Promise<void> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  let y = MARGIN.t + 12;
  y = drawFilters(doc, opts.filters, y);
  y = drawKpis(doc, opts.kpis, y);
  if (opts.chartElement) {
    try { y = await drawChart(doc, opts.chartElement, y); }
    catch (err) { console.error("Falha ao capturar gráfico:", err); }
  }
  doc.addPage();
  drawTable(doc, opts.rows, MARGIN.t + 12, opts.view);
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    drawHeader(doc, opts.title, opts.subtitle, i, total);
    drawFooter(doc);
  }
  doc.save(`${opts.filename}.pdf`);
}
