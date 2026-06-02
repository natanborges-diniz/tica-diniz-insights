// src/lib/estoque/exportacao-plano.ts
// Módulo de exportação do Plano Mensal — CSV, Excel, e preparação de dados PDF.
// As funções de geração de PDF ficam no componente (necessitam de DOM/jsPDF).
//
// Testável em Node: XLSX funciona sem DOM; jsPDF não está importado aqui.

import * as XLSX from 'xlsx';
import type { FornecedorGrupo } from './fornecedor-plano';
import type { PlanoFinalMarca } from './plano-compra-payload';

export interface ExportParams {
  nomeEmpresa: string;
  codEmpresa: number;
  dataGeracao: string;
  grupos: FornecedorGrupo[];
  planoFinal: PlanoFinalMarca[];
}

// ── Helpers internos ──────────────────────────────────────────────────────────

function qtdFinalMarca(marca: string, planoFinal: PlanoFinalMarca[], lacunaFallback: number): number {
  return planoFinal.find(p => p.marca === marca)?.qtdComprar ?? lacunaFallback;
}

function sanitizeSheetName(name: string): string {
  return name.replace(/[:/\\?*[\]]/g, '-').substring(0, 31);
}

// ── CSV ───────────────────────────────────────────────────────────────────────

const CSV_HEADER = ['Fornecedor', 'Marca', 'Cód. Barras Interno', 'EAN', 'Descrição', 'Sugerido', 'Final (Marca)', 'Dias p/ Sair'];

/** Retorna todas as linhas (incluindo cabeçalho) como arrays de strings — puro, testável. */
export function gerarLinhasCSV(params: ExportParams): string[][] {
  const { grupos, planoFinal } = params;
  const linhas: string[][] = [CSV_HEADER];

  for (const grupo of grupos) {
    for (const marca of grupo.marcas) {
      const qtdFinal = qtdFinalMarca(marca.marca, planoFinal, marca.lacuna);
      if (marca.skusAlocados.length === 0) {
        linhas.push([
          grupo.fornecedor, marca.marca, '', '', '', '0', String(qtdFinal), '',
        ]);
        continue;
      }
      for (const sku of marca.skusAlocados) {
        linhas.push([
          grupo.fornecedor,
          marca.marca,
          sku.codigoBarra?.trim() ?? '',
          sku.ean?.trim() ?? '',
          sku.descricao,
          String(sku.qtdSugerida),
          String(qtdFinal),
          sku.diasGiroUltimaPeca === 9999 ? '' : String(sku.diasGiroUltimaPeca),
        ]);
      }
    }
  }
  return linhas;
}

/** Converte as linhas em string CSV com valores entre aspas duplas. */
export function gerarCSVString(params: ExportParams): string {
  return gerarLinhasCSV(params)
    .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

// ── Excel ─────────────────────────────────────────────────────────────────────

export interface ExcelData {
  resumo: (string | number)[][];
  sheets: Map<string, (string | number)[][]>;
}

/** Prepara os dados do workbook — puro, testável. */
export function prepararExcelData(params: ExportParams): ExcelData {
  const { grupos, planoFinal, nomeEmpresa, dataGeracao } = params;

  const resumo: (string | number)[][] = [
    [`Plano Mensal — ${nomeEmpresa}`],
    [`Gerado em: ${dataGeracao}`],
    [],
    ['Fornecedor / Marca', 'Marcas', 'Mix Ideal', 'Lacuna Sugerida', 'Final a Comprar'],
  ];

  for (const g of grupos) {
    const totalFinalForn = g.marcas.reduce(
      (s, m) => s + qtdFinalMarca(m.marca, planoFinal, m.lacuna), 0
    );
    resumo.push([g.fornecedor, g.marcas.length, g.totalMixIdeal, g.totalLacuna, totalFinalForn]);
    for (const m of g.marcas) {
      const qf = qtdFinalMarca(m.marca, planoFinal, m.lacuna);
      resumo.push([`  ${m.marca}`, '', m.mixTotal, m.lacuna, qf]);
    }
    resumo.push([]);
  }

  const sheets = new Map<string, (string | number)[][]>();
  for (const g of grupos) {
    const sheetName = sanitizeSheetName(g.fornecedor);
    const rows: (string | number)[][] = [
      ['Marca', 'Cód. Barras Interno', 'EAN', 'Descrição', 'Qtd Sugerida', 'Qtd Final', 'Dias p/ Sair'],
    ];
    for (const marca of g.marcas) {
      const qtdFinal = qtdFinalMarca(marca.marca, planoFinal, marca.lacuna);
      if (marca.skusAlocados.length === 0) {
        rows.push([marca.marca, '', '', '(sem SKUs alocados)', 0, qtdFinal, '']);
        continue;
      }
      for (const sku of marca.skusAlocados) {
        rows.push([
          marca.marca,
          sku.codigoBarra?.trim() ?? '',
          sku.ean?.trim() ?? '',
          sku.descricao,
          sku.qtdSugerida,
          qtdFinal,
          sku.diasGiroUltimaPeca === 9999 ? '' : sku.diasGiroUltimaPeca,
        ]);
      }
    }
    sheets.set(sheetName, rows);
  }

  return { resumo, sheets };
}

/** Gera o arquivo Excel (.xlsx) como Uint8Array — usa xlsx (funciona em Node). */
export function gerarExcel(params: ExportParams): Uint8Array {
  const data = prepararExcelData(params);
  const wb = XLSX.utils.book_new();

  const wsResumo = XLSX.utils.aoa_to_sheet(data.resumo);
  wsResumo['!cols'] = [{ wch: 40 }, { wch: 8 }, { wch: 12 }, { wch: 16 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');

  for (const [sheetName, rows] of data.sheets) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 40 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

// ── PDF — preparação de dados (puro, testável) ────────────────────────────────

export interface PDFLinhaItem {
  marca: string;
  codSku: number;
  codigoBarra: string;        // cod_barras_interno (sempre preenchido)
  ean: string | null;         // EAN do fabricante; null quando não disponível
  descricao: string;
  qtdSugerida: number;
  qtdFinal: number;
  diasGiro: number | null;
}

export interface PDFSecao {
  fornecedor: string;
  isSemFornecedor: boolean;
  linhas: PDFLinhaItem[];
  totalSugerido: number;
  totalFinal: number;
}

/** Prepara as seções de dados para geração de PDF — puro, testável. */
export function prepararSecoesPDF(params: ExportParams): PDFSecao[] {
  const { grupos, planoFinal } = params;

  return grupos.map(g => {
    const linhas: PDFLinhaItem[] = g.marcas.flatMap(m => {
      const qtdFinal = qtdFinalMarca(m.marca, planoFinal, m.lacuna);
      if (m.skusAlocados.length === 0) {
        return [{
          marca: m.marca, codSku: 0, codigoBarra: '', ean: null, descricao: '(sem alocação)',
          qtdSugerida: 0, qtdFinal, diasGiro: null,
        }];
      }
      return m.skusAlocados.map(sku => ({
        marca: m.marca,
        codSku: sku.codSku,
        codigoBarra: sku.codigoBarra?.trim() ?? '',
        ean: sku.ean?.trim() || null,
        descricao: sku.descricao,
        qtdSugerida: sku.qtdSugerida,
        qtdFinal,
        diasGiro: sku.diasGiroUltimaPeca === 9999 ? null : sku.diasGiroUltimaPeca,
      }));
    });

    const totalSugerido = linhas.reduce((s, l) => s + l.qtdSugerida, 0);
    const totalFinal = g.marcas.reduce(
      (s, m) => s + qtdFinalMarca(m.marca, planoFinal, m.lacuna), 0
    );

    return {
      fornecedor: g.fornecedor,
      isSemFornecedor: g.isSemFornecedor,
      linhas,
      totalSugerido,
      totalFinal,
    };
  });
}
