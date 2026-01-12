// src/utils/exportVisual.ts
// Utilitários para exportar elementos visuais como imagem e PDF

import { toPng, toJpeg } from 'html-to-image';
import jsPDF from 'jspdf';

export interface ExportVisualOptions {
  filename: string;
  title?: string;
  backgroundColor?: string;
}

// ============================================
// EXPORTAR COMO IMAGEM PNG
// ============================================
export async function exportToImage(
  element: HTMLElement,
  options: ExportVisualOptions
): Promise<void> {
  try {
    const dataUrl = await toPng(element, {
      quality: 1,
      backgroundColor: options.backgroundColor || '#ffffff',
      pixelRatio: 2, // Alta resolução
    });

    downloadDataUrl(dataUrl, `${options.filename}.png`);
  } catch (error) {
    console.error('Erro ao exportar imagem:', error);
    throw error;
  }
}

// ============================================
// EXPORTAR COMO PDF (visual/screenshot)
// ============================================
export async function exportVisualToPDF(
  element: HTMLElement,
  options: ExportVisualOptions
): Promise<void> {
  try {
    const dataUrl = await toJpeg(element, {
      quality: 0.95,
      backgroundColor: options.backgroundColor || '#ffffff',
      pixelRatio: 2,
    });

    // Obter dimensões do elemento
    const { width, height } = element.getBoundingClientRect();
    
    // Determinar orientação baseada no aspecto
    const orientation = width > height ? 'landscape' : 'portrait';
    
    const doc = new jsPDF({
      orientation,
      unit: 'px',
      format: [width + 40, height + 80], // Adiciona margem
    });

    // Título
    if (options.title) {
      doc.setFontSize(16);
      doc.text(options.title, 20, 25);
    }

    // Data de geração
    doc.setFontSize(10);
    doc.setTextColor(100);
    const dataGeracao = new Date().toLocaleString('pt-BR');
    doc.text(`Gerado em: ${dataGeracao}`, 20, options.title ? 40 : 20);

    // Adicionar imagem
    const imgY = options.title ? 50 : 30;
    doc.addImage(dataUrl, 'JPEG', 20, imgY, width, height);

    doc.save(`${options.filename}.pdf`);
  } catch (error) {
    console.error('Erro ao exportar PDF:', error);
    throw error;
  }
}

// ============================================
// HELPER: Download data URL
// ============================================
function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
