// Testes — D.7 / D.8
// Geração de CSV, Excel, preparação de dados PDF.

import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  gerarLinhasCSV,
  gerarCSVString,
  prepararExcelData,
  gerarExcel,
  prepararSecoesPDF,
  type ExportParams,
} from '../exportacao-plano';
import type { FornecedorGrupo } from '../fornecedor-plano';
import type { PlanoFinalMarca } from '../plano-compra-payload';
import type { MixMarcaV2 } from '../mix-ideal-v2';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeMarca = (marca: string, lacuna: number, skus: MixMarcaV2['skusAlocados'] = []): MixMarcaV2 => ({
  marca,
  participacao: 0.5,
  pctPecas: 0.5,
  pctFaturamento: 0.5,
  pecasVendidas: 50,
  faturamento: 5000,
  mixTotal: 80,
  mixRX: 56,
  mixSolar: 24,
  pctSolar: 30,
  estoqueEfetivo: 80 - lacuna,
  lacuna,
  status: 'OK',
  estrategica: false,
  skusAlocados: skus,
});

const GRUPOS: FornecedorGrupo[] = [
  {
    fornecedor: 'LUXOTTICA BR',
    isSemFornecedor: false,
    marcas: [
      makeMarca('RAYBAN', 62, [
        { codSku: 1, descricao: 'RB 3025 Aviator', diasGiroUltimaPeca: 10, qtdSugerida: 40, codigoBarra: '7891234567890', ean: '8056597137928' },
        { codSku: 2, descricao: 'RB 2140 Wayfarer', diasGiroUltimaPeca: 15, qtdSugerida: 22, codigoBarra: '7891234567891', ean: null },
      ]),
      makeMarca('OAKLEY', 23, [
        { codSku: 3, descricao: 'OAK Metal', diasGiroUltimaPeca: 9999, qtdSugerida: 23, codigoBarra: '7899876543211', ean: null },
      ]),
    ],
    totalMixIdeal: 160,
    totalLacuna: 85,
  },
  {
    fornecedor: 'SEM FORNECEDOR',
    isSemFornecedor: true,
    marcas: [
      makeMarca('GUESS', 10, [
        { codSku: 4, descricao: 'GU 2345', diasGiroUltimaPeca: 30, qtdSugerida: 10, codigoBarra: '7899876543210', ean: '8053672528009' },
      ]),
    ],
    totalMixIdeal: 80,
    totalLacuna: 10,
  },
];

const PLANO_FINAL: PlanoFinalMarca[] = [
  { marca: 'RAYBAN', qtdComprar: 50, ajusteUsuario: true },
  { marca: 'OAKLEY', qtdComprar: 23, ajusteUsuario: false },
  { marca: 'GUESS', qtdComprar: 10, ajusteUsuario: false },
];

const PARAMS: ExportParams = {
  nomeEmpresa: 'DINIZ PRIMITIVA I',
  codEmpresa: 1,
  dataGeracao: '2026-06-01',
  grupos: GRUPOS,
  planoFinal: PLANO_FINAL,
};

// ── CSV ───────────────────────────────────────────────────────────────────────

describe('gerarLinhasCSV', () => {
  it('primeira linha é o cabeçalho correto', () => {
    const linhas = gerarLinhasCSV(PARAMS);
    expect(linhas[0]).toEqual([
      'Fornecedor', 'Marca', 'Cód. Barras Interno', 'EAN', 'Descrição', 'Sugerido', 'Final (Marca)', 'Dias p/ Sair',
    ]);
  });

  it('uma linha por SKU alocado', () => {
    const linhas = gerarLinhasCSV(PARAMS);
    // 2 SKUs RAYBAN + 1 SKU OAKLEY + 1 SKU GUESS = 4 linhas de dados + 1 cabeçalho
    expect(linhas).toHaveLength(5);
  });

  it('fornecedor correto na coluna 0', () => {
    const linhas = gerarLinhasCSV(PARAMS);
    const aviatorRow = linhas.find(l => l[2] === '7891234567890'); // SKU 1 tem cód barras interno
    expect(aviatorRow?.[0]).toBe('LUXOTTICA BR');
  });

  it('codigoBarra aparece na coluna 2', () => {
    const linhas = gerarLinhasCSV(PARAMS);
    const aviatorRow = linhas.find(l => l[4] === 'RB 3025 Aviator');
    expect(aviatorRow?.[2]).toBe('7891234567890');
  });

  it('EAN preenchido aparece na coluna 3', () => {
    const linhas = gerarLinhasCSV(PARAMS);
    const aviatorRow = linhas.find(l => l[4] === 'RB 3025 Aviator');
    expect(aviatorRow?.[3]).toBe('8056597137928');
  });

  it('EAN nulo aparece como string vazia na coluna 3', () => {
    const linhas = gerarLinhasCSV(PARAMS);
    const wayfarerRow = linhas.find(l => l[4] === 'RB 2140 Wayfarer');
    expect(wayfarerRow?.[3]).toBe('');
  });

  it('dias_giro 9999 aparece como string vazia', () => {
    const linhas = gerarLinhasCSV(PARAMS);
    const oakleyRow = linhas.find(l => l[1] === 'OAKLEY');
    expect(oakleyRow?.[7]).toBe('');
  });

  it('dias_giro válido aparece como string numérica', () => {
    const linhas = gerarLinhasCSV(PARAMS);
    const aviatorRow = linhas.find(l => l[4] === 'RB 3025 Aviator');
    expect(aviatorRow?.[7]).toBe('10');
  });

  it('qtd Final usa valor do planoFinal (ajuste do usuário)', () => {
    const linhas = gerarLinhasCSV(PARAMS);
    // RAYBAN foi ajustado para 50 (originalmente 62)
    const aviatorRow = linhas.find(l => l[4] === 'RB 3025 Aviator');
    expect(aviatorRow?.[6]).toBe('50');
  });

  it('qtd Final usa lacuna quando marca não está no planoFinal', () => {
    const params: ExportParams = { ...PARAMS, planoFinal: [] };
    const linhas = gerarLinhasCSV(params);
    const aviatorRow = linhas.find(l => l[4] === 'RB 3025 Aviator');
    expect(aviatorRow?.[6]).toBe('62'); // lacuna de RAYBAN
  });

  it('marca sem SKUs alocados gera 1 linha placeholder', () => {
    const grupos: FornecedorGrupo[] = [{
      fornecedor: 'FORN',
      isSemFornecedor: false,
      marcas: [makeMarca('ZEISS', 0, [])],
      totalMixIdeal: 80,
      totalLacuna: 0,
    }];
    const linhas = gerarLinhasCSV({ ...PARAMS, grupos, planoFinal: [] });
    expect(linhas).toHaveLength(2); // header + 1 placeholder
    expect(linhas[1][5]).toBe('0'); // sugerido = 0 (col 5 com 8 colunas)
  });
});

describe('gerarCSVString', () => {
  it('linhas separadas por \\n', () => {
    const csv = gerarCSVString(PARAMS);
    const linhas = csv.split('\n');
    expect(linhas.length).toBeGreaterThan(1);
  });

  it('campos entre aspas duplas', () => {
    const csv = gerarCSVString(PARAMS);
    expect(csv).toMatch(/^"/);
  });

  it('aspas duplas no conteúdo são escapadas', () => {
    const grupos: FornecedorGrupo[] = [{
      fornecedor: 'FORN "TESTE"',
      isSemFornecedor: false,
      marcas: [makeMarca('MARCA', 5, [
        { codSku: 99, descricao: 'Desc "entre aspas"', diasGiroUltimaPeca: 10, qtdSugerida: 5 },
      ])],
      totalMixIdeal: 80,
      totalLacuna: 5,
    }];
    const csv = gerarCSVString({ ...PARAMS, grupos });
    expect(csv).toContain('""entre aspas""');
  });
});

// ── Excel ─────────────────────────────────────────────────────────────────────

describe('prepararExcelData', () => {
  it('resumo começa com o nome da empresa', () => {
    const data = prepararExcelData(PARAMS);
    expect(String(data.resumo[0][0])).toContain('DINIZ PRIMITIVA I');
  });

  it('sheets contém entrada por fornecedor', () => {
    const data = prepararExcelData(PARAMS);
    expect(data.sheets.has('LUXOTTICA BR')).toBe(true);
    expect(data.sheets.has('SEM FORNECEDOR')).toBe(true);
  });

  it('aba por fornecedor tem cabeçalho como primeira linha', () => {
    const data = prepararExcelData(PARAMS);
    const luxSheet = data.sheets.get('LUXOTTICA BR')!;
    expect(luxSheet[0]).toContain('Marca');
    expect(luxSheet[0]).toContain('Cód. Barras Interno');
    expect(luxSheet[0]).toContain('EAN');
    expect(luxSheet[0]).toContain('Qtd Final');
  });

  it('nome da aba truncado em 31 caracteres', () => {
    const grupos: FornecedorGrupo[] = [{
      fornecedor: 'FORNECEDOR COM NOME MUITO LONGO QUE EXCEDE LIMITE',
      isSemFornecedor: false,
      marcas: [],
      totalMixIdeal: 0,
      totalLacuna: 0,
    }];
    const data = prepararExcelData({ ...PARAMS, grupos });
    const nome = Array.from(data.sheets.keys())[0];
    expect(nome.length).toBeLessThanOrEqual(31);
  });

  it('resumo inclui linha para cada marca (indentada)', () => {
    const data = prepararExcelData(PARAMS);
    const marcasNoResumo = data.resumo.filter(
      row => typeof row[0] === 'string' && row[0].startsWith('  ')
    );
    expect(marcasNoResumo.length).toBeGreaterThanOrEqual(3); // RAYBAN, OAKLEY, GUESS
  });
});

describe('gerarExcel', () => {
  it('retorna Uint8Array', () => {
    const buf = gerarExcel(PARAMS);
    expect(buf).toBeInstanceOf(Uint8Array);
    expect(buf.length).toBeGreaterThan(0);
  });

  it('workbook pode ser lido de volta pelo xlsx', () => {
    const buf = gerarExcel(PARAMS);
    const wb = XLSX.read(buf, { type: 'array' });
    expect(wb.SheetNames).toContain('Resumo');
    expect(wb.SheetNames).toContain('LUXOTTICA BR');
  });

  it('workbook contém aba por fornecedor', () => {
    const buf = gerarExcel(PARAMS);
    const wb = XLSX.read(buf, { type: 'array' });
    expect(wb.SheetNames).toContain('SEM FORNECEDOR');
  });
});

// ── PDF data prep ─────────────────────────────────────────────────────────────

describe('prepararSecoesPDF', () => {
  it('uma seção por grupo de fornecedor', () => {
    const secoes = prepararSecoesPDF(PARAMS);
    expect(secoes).toHaveLength(2);
  });

  it('seção preserva nome do fornecedor', () => {
    const secoes = prepararSecoesPDF(PARAMS);
    expect(secoes[0].fornecedor).toBe('LUXOTTICA BR');
    expect(secoes[1].fornecedor).toBe('SEM FORNECEDOR');
  });

  it('isSemFornecedor propagado corretamente', () => {
    const secoes = prepararSecoesPDF(PARAMS);
    expect(secoes[0].isSemFornecedor).toBe(false);
    expect(secoes[1].isSemFornecedor).toBe(true);
  });

  it('totalFinal usa planoFinal (ajuste usuário)', () => {
    const secoes = prepararSecoesPDF(PARAMS);
    // LUXOTTICA BR: RAYBAN ajustado p/ 50 + OAKLEY 23 = 73
    expect(secoes[0].totalFinal).toBe(73);
  });

  it('totalSugerido soma qtdSugerida dos SKUs', () => {
    const secoes = prepararSecoesPDF(PARAMS);
    // LUXOTTICA: RB1(40)+RB2(22)+OAK(23) = 85
    expect(secoes[0].totalSugerido).toBe(85);
  });

  it('dias_giro 9999 convertido para null na linha PDF', () => {
    const secoes = prepararSecoesPDF(PARAMS);
    const lux = secoes[0];
    const oakleyLinha = lux.linhas.find(l => l.marca === 'OAKLEY');
    expect(oakleyLinha?.diasGiro).toBeNull();
  });

  it('EAN preenchido propagado para linha PDF', () => {
    const secoes = prepararSecoesPDF(PARAMS);
    const aviatorLinha = secoes[0].linhas.find(l => l.descricao === 'RB 3025 Aviator');
    expect(aviatorLinha?.ean).toBe('8056597137928');
  });

  it('EAN nulo propagado como null para linha PDF', () => {
    const secoes = prepararSecoesPDF(PARAMS);
    const wayfarerLinha = secoes[0].linhas.find(l => l.descricao === 'RB 2140 Wayfarer');
    expect(wayfarerLinha?.ean).toBeNull();
  });

  it('input vazio → seções vazias', () => {
    const params: ExportParams = { ...PARAMS, grupos: [] };
    expect(prepararSecoesPDF(params)).toEqual([]);
  });
});
