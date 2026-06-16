// src/utils/exportSalesFamilyReport.ts
// Relatório completo em PDF: título, filtros, KPIs, gráfico e tabela.
// Quebras de página controladas, sem cortes.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toPng } from 'html-to-image';
import { formatters } from './exportData';

export interface ReportFilters {
  empresa: string;
  dataInicio: string;
  dataFim: string;
  vendedor: string;
  familia: string;
  fornecedor: string;
  busca: string;
}

export interface ReportKpis {
  faturamento: number;
  vendas: number;
  pecas: number;
  ticketMedio: number;
}

export interface ReportRow {
  empresa?: string;
  vendedor?: string;
  familia?: string;
  fornecedor?: string;
  qtdTransacao?: number;
  qtdProdutos?: number;
  totalVendido?: number;
}

export interface SalesFamilyReportOptions {
  filename: string;
  title: string;
  subtitle?: string;
  filters: ReportFilters;
  kpis: ReportKpis;
  rows: ReportRow[];
  chartElement?: HTMLElement | null;
}

const PAGE = { w: 297, h: 210 }; // A4 landscape (mm)
const MARGIN = { l: 14, r: 14, t: 14, b: 14 };
const CONTENT_W = PAGE.w - MARGIN.l - MARGIN.r;

function formatDateBR(value: string): string {
  if (!value) return '—';
  const [y, m, d] = value.split('-');
  return d && m && y ? `${d}/${m}/${y}` : value;
}

function drawHeader(doc: jsPDF, title: string, subtitle: string | undefined, pageNum: number, totalPages: number) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(20);
  doc.text(title, MARGIN.l, MARGIN.t);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(110);
  const right = `Página ${pageNum} de ${totalPages}`;
  doc.text(right, PAGE.w - MARGIN.r, MARGIN.t, { align: 'right' });

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
  const gerado = `Gerado em ${new Date().toLocaleString('pt-BR')}`;
  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text(gerado, MARGIN.l, PAGE.h - 6);
}

function drawFiltersBlock(doc: jsPDF, filters: ReportFilters, y: number): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(40);
  doc.text('Filtros aplicados', MARGIN.l, y);
  y += 4;

  const items: Array<[string, string]> = [
    ['Empresa', filters.empresa],
    ['Período', `${formatDateBR(filters.dataInicio)}  a  ${formatDateBR(filters.dataFim)}`],
    ['Vendedor', filters.vendedor],
    ['Família', filters.familia],
    ['Fornecedor', filters.fornecedor],
    ['Busca', filters.busca || '—'],
  ];

  autoTable(doc, {
    startY: y,
    body: items.map(([k, v]) => [k, v]),
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 1.8, textColor: 40 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 35, fillColor: [245, 247, 250] },
      1: { cellWidth: CONTENT_W - 35 },
    },
    margin: { left: MARGIN.l, right: MARGIN.r },
  });

  // @ts-ignore lastAutoTable está disponível em runtime
  return (doc as any).lastAutoTable.finalY + 4;
}

function drawKpisBlock(doc: jsPDF, kpis: ReportKpis, y: number): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(40);
  doc.text('Indicadores', MARGIN.l, y);
  y += 4;

  const cards: Array<[string, string]> = [
    ['Faturamento', formatters.currency(kpis.faturamento)],
    ['Vendas (nº cupons)', formatters.number(kpis.vendas)],
    ['Peças vendidas', formatters.number(kpis.pecas)],
    ['Ticket médio', formatters.currency(kpis.ticketMedio)],
  ];

  const gap = 4;
  const cardW = (CONTENT_W - gap * (cards.length - 1)) / cards.length;
  const cardH = 18;

  cards.forEach(([label, value], i) => {
    const x = MARGIN.l + i * (cardW + gap);
    doc.setFillColor(245, 247, 250);
    doc.setDrawColor(220);
    doc.roundedRect(x, y, cardW, cardH, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(label.toUpperCase(), x + 3, y + 5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(20);
    doc.text(value, x + 3, y + 13);
  });

  return y + cardH + 4;
}

async function drawChart(doc: jsPDF, chartElement: HTMLElement, y: number): Promise<number> {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(40);
  doc.text('Vendas por Família (Top 10)', MARGIN.l, y);
  y += 4;

  const dataUrl = await toPng(chartElement, {
    backgroundColor: '#ffffff',
    pixelRatio: 2,
    cacheBust: true,
  });

  // Carregar a imagem para obter proporção real
  const img = new Image();
  img.src = dataUrl;
  await new Promise<void>((resolve) => {
    if (img.complete) return resolve();
    img.onload = () => resolve();
    img.onerror = () => resolve();
  });

  const ratio = img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 16 / 9;
  const availableH = PAGE.h - MARGIN.b - 8 - y;
  let imgW = CONTENT_W;
  let imgH = imgW / ratio;
  if (imgH > availableH) {
    imgH = availableH;
    imgW = imgH * ratio;
  }
  const xCenter = MARGIN.l + (CONTENT_W - imgW) / 2;
  doc.addImage(dataUrl, 'PNG', xCenter, y, imgW, imgH, undefined, 'FAST');
  return y + imgH + 4;
}

function drawTable(
  doc: jsPDF,
  rows: ReportRow[],
  startY: number,
  title: string,
  subtitle: string | undefined,
  pageOffset: number,
  totalPagesRef: { value: number }
) {
  const head = [['Empresa', 'Vendedor', 'Família', 'Fornecedor', 'Vendas', 'Peças', 'Faturamento']];
  const body = rows.map((r) => [
    r.empresa ?? '—',
    r.vendedor ?? '—',
    r.familia ?? '—',
    r.fornecedor ?? '—',
    formatters.number(r.qtdTransacao ?? 0),
    formatters.number(r.qtdProdutos ?? 0),
    formatters.currency(r.totalVendido ?? 0),
  ]);

  autoTable(doc, {
    head,
    body,
    startY,
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 1.8, overflow: 'linebreak' },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: {
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
    },
    margin: { left: MARGIN.l, right: MARGIN.r, top: MARGIN.t + 10, bottom: MARGIN.b + 8 },
    didDrawPage: () => {
      // header/footer desenhados depois com numeração final
    },
  });
}

export async function exportSalesFamilyReport(opts: SalesFamilyReportOptions): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // ===== Página 1: capa (filtros + KPIs + gráfico) =====
  let y = MARGIN.t + 12;
  y = drawFiltersBlock(doc, opts.filters, y);
  y = drawKpisBlock(doc, opts.kpis, y);

  if (opts.chartElement) {
    try {
      y = await drawChart(doc, opts.chartElement, y);
    } catch (err) {
      console.error('Falha ao capturar gráfico:', err);
    }
  }

  // ===== Páginas seguintes: tabela =====
  doc.addPage();
  drawTable(doc, opts.rows, MARGIN.t + 12, opts.title, opts.subtitle, 2, { value: 0 });

  // ===== Header/Footer em todas as páginas =====
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    drawHeader(doc, opts.title, opts.subtitle, i, total);
    drawFooter(doc);
  }

  doc.save(`${opts.filename}.pdf`);
}
