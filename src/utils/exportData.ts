// src/utils/exportData.ts
// Utilitários de exportação reutilizáveis para todo o projeto

import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ExportColumn {
  key: string;
  header: string;
  format?: (value: any) => string;
}

export interface ExportOptions {
  filename: string;
  title?: string;
  columns: ExportColumn[];
  data: Record<string, any>[];
}

// Formatar valor para exportação
function formatValue(value: any, format?: (v: any) => string): string {
  if (value === null || value === undefined) return '';
  if (format) return format(value);
  return String(value);
}

// Preparar dados para exportação
function prepareData(options: ExportOptions): string[][] {
  const headers = options.columns.map(col => col.header);
  const rows = options.data.map(row =>
    options.columns.map(col => formatValue(row[col.key], col.format))
  );
  return [headers, ...rows];
}

// ============================================
// EXPORTAR CSV
// ============================================
export function exportToCSV(options: ExportOptions): void {
  const data = prepareData(options);
  const csvContent = data
    .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(';'))
    .join('\n');
  
  const BOM = '\uFEFF'; // UTF-8 BOM para Excel reconhecer acentos
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${options.filename}.csv`);
}

// ============================================
// EXPORTAR EXCEL
// ============================================
export function exportToExcel(options: ExportOptions): void {
  const data = prepareData(options);
  const ws = XLSX.utils.aoa_to_sheet(data);
  
  // Ajustar largura das colunas
  const colWidths = options.columns.map((col, idx) => {
    const maxLength = Math.max(
      col.header.length,
      ...options.data.map(row => formatValue(row[col.key], col.format).length)
    );
    return { wch: Math.min(maxLength + 2, 50) };
  });
  ws['!cols'] = colWidths;
  
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Dados');
  XLSX.writeFile(wb, `${options.filename}.xlsx`);
}

// ============================================
// EXPORTAR PDF
// ============================================
export function exportToPDF(options: ExportOptions): void {
  const doc = new jsPDF({
    orientation: options.columns.length > 6 ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Título
  if (options.title) {
    doc.setFontSize(16);
    doc.text(options.title, 14, 15);
  }

  // Data de geração
  doc.setFontSize(10);
  doc.setTextColor(100);
  const dataGeracao = new Date().toLocaleString('pt-BR');
  doc.text(`Gerado em: ${dataGeracao}`, 14, options.title ? 22 : 15);

  // Tabela
  const headers = options.columns.map(col => col.header);
  const rows = options.data.map(row =>
    options.columns.map(col => formatValue(row[col.key], col.format))
  );

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: options.title ? 28 : 20,
    styles: {
      fontSize: 8,
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [245, 247, 250],
    },
    margin: { top: 10, right: 10, bottom: 10, left: 10 },
  });

  doc.save(`${options.filename}.pdf`);
}

// ============================================
// HELPER: Download blob
// ============================================
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============================================
// FORMATADORES COMUNS
// ============================================
export const formatters = {
  currency: (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0),
  
  date: (value: string | null) => {
    if (!value) return '';
    const datePart = value.split('T')[0];
    const [year, month, day] = datePart.split('-');
    return `${day}/${month}/${year}`;
  },
  
  number: (value: number) =>
    new Intl.NumberFormat('pt-BR').format(value || 0),
  
  percent: (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2 }).format(value || 0),
};
