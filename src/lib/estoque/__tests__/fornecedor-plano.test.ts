// Testes — D.6 / D.8
// Cascata marca→fornecedor e agrupamento por fornecedor.

import { describe, it, expect } from 'vitest';
import {
  resolverFornecedor,
  agruparPorFornecedor,
  SEM_FORNECEDOR_LABEL,
  type FornecedorGrupo,
} from '../fornecedor-plano';
import type { MixMarcaV2 } from '../mix-ideal-v2';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeMarca = (marca: string, overrides: Partial<MixMarcaV2> = {}): MixMarcaV2 => ({
  marca,
  participacao: 0.5,
  pctPecas: 0.5,
  pctFaturamento: 0.5,
  pecasVendidas: 50,
  faturamento: 5000,
  mixTotal: 50,
  mixRX: 35,
  mixSolar: 15,
  pctSolar: 30,
  estoqueEfetivo: 20,
  lacuna: 30,
  status: 'OK',
  estrategica: false,
  skusAlocados: [],
  ...overrides,
});

const MAPEAMENTO: ReadonlyMap<string, string> = new Map([
  ['RAYBAN', 'LUXOTTICA BR'],
  ['OAKLEY', 'LUXOTTICA BR'],
  ['STEPPER', 'STEPPER BRASIL'],
]);

// ── resolverFornecedor ────────────────────────────────────────────────────────

describe('resolverFornecedor', () => {
  it('usa Bridge quando fornecedor_nome é válido', () => {
    expect(resolverFornecedor('RAYBAN', 'LUXOTTICA', MAPEAMENTO)).toBe('LUXOTTICA');
  });

  it('ignora Bridge "SEM FORNECEDOR" e usa Supabase fallback', () => {
    expect(resolverFornecedor('RAYBAN', 'SEM FORNECEDOR', MAPEAMENTO)).toBe('LUXOTTICA BR');
  });

  it('ignora Bridge "N/D" e usa Supabase fallback', () => {
    expect(resolverFornecedor('OAKLEY', 'N/D', MAPEAMENTO)).toBe('LUXOTTICA BR');
  });

  it('ignora Bridge "NULL" e usa Supabase fallback', () => {
    expect(resolverFornecedor('STEPPER', 'NULL', MAPEAMENTO)).toBe('STEPPER BRASIL');
  });

  it('ignora Bridge vazio e usa Supabase fallback', () => {
    expect(resolverFornecedor('RAYBAN', '', MAPEAMENTO)).toBe('LUXOTTICA BR');
  });

  it('ignora Bridge null e usa Supabase fallback', () => {
    expect(resolverFornecedor('RAYBAN', null, MAPEAMENTO)).toBe('LUXOTTICA BR');
  });

  it('lookup Supabase é case-insensitive (marca em minúsculo)', () => {
    expect(resolverFornecedor('rayban', 'SEM FORNECEDOR', MAPEAMENTO)).toBe('LUXOTTICA BR');
  });

  it('sem Bridge E sem mapeamento Supabase → SEM_FORNECEDOR_LABEL', () => {
    expect(resolverFornecedor('GUESS', 'SEM FORNECEDOR', MAPEAMENTO))
      .toBe(SEM_FORNECEDOR_LABEL);
  });

  it('sem mapeamento Supabase nenhum → SEM_FORNECEDOR_LABEL', () => {
    expect(resolverFornecedor('VOGUE', null, new Map())).toBe(SEM_FORNECEDOR_LABEL);
  });
});

// ── agruparPorFornecedor ──────────────────────────────────────────────────────

describe('agruparPorFornecedor', () => {
  it('input vazio → resultado vazio', () => {
    expect(agruparPorFornecedor([], new Map())).toEqual([]);
  });

  it('agrupa marcas do mesmo fornecedor juntas', () => {
    const mix = [makeMarca('RAYBAN'), makeMarca('OAKLEY'), makeMarca('STEPPER')];
    const fpm = new Map([
      ['RAYBAN', 'LUXOTTICA BR'],
      ['OAKLEY', 'LUXOTTICA BR'],
      ['STEPPER', 'STEPPER BRASIL'],
    ]);
    const grupos = agruparPorFornecedor(mix, fpm);
    expect(grupos).toHaveLength(2);
    const lux = grupos.find(g => g.fornecedor === 'LUXOTTICA BR')!;
    expect(lux.marcas).toHaveLength(2);
    expect(lux.marcas.map(m => m.marca)).toContain('RAYBAN');
    expect(lux.marcas.map(m => m.marca)).toContain('OAKLEY');
  });

  it('SEM_FORNECEDOR_LABEL fica como último grupo', () => {
    const mix = [makeMarca('GUESS'), makeMarca('RAYBAN'), makeMarca('OAKLEY')];
    const fpm = new Map([
      ['RAYBAN', 'LUXOTTICA BR'],
      ['OAKLEY', 'LUXOTTICA BR'],
      // GUESS sem mapeamento → SEM_FORNECEDOR_LABEL
    ]);
    const grupos = agruparPorFornecedor(mix, fpm);
    const ultimo = grupos[grupos.length - 1];
    expect(ultimo.isSemFornecedor).toBe(true);
    expect(ultimo.fornecedor).toBe(SEM_FORNECEDOR_LABEL);
  });

  it('fornecedores nomeados são ordenados alfabeticamente', () => {
    const mix = [makeMarca('A'), makeMarca('B'), makeMarca('C')];
    const fpm = new Map([
      ['A', 'ZEISS'],
      ['B', 'ALCON'],
      ['C', 'MENICON'],
    ]);
    const grupos = agruparPorFornecedor(mix, fpm);
    const nomes = grupos.map(g => g.fornecedor);
    expect(nomes).toEqual(['ALCON', 'MENICON', 'ZEISS']);
  });

  it('totalMixIdeal e totalLacuna somam as marcas do grupo', () => {
    const mix = [
      makeMarca('RAYBAN', { mixTotal: 100, lacuna: 60 }),
      makeMarca('OAKLEY', { mixTotal: 63, lacuna: 23 }),
    ];
    const fpm = new Map([['RAYBAN', 'LUX'], ['OAKLEY', 'LUX']]);
    const grupos = agruparPorFornecedor(mix, fpm);
    expect(grupos[0].totalMixIdeal).toBe(163);
    expect(grupos[0].totalLacuna).toBe(83);
  });

  it('isSemFornecedor = false para fornecedor nomeado', () => {
    const mix = [makeMarca('RAYBAN')];
    const fpm = new Map([['RAYBAN', 'LUXOTTICA BR']]);
    const grupos = agruparPorFornecedor(mix, fpm);
    expect(grupos[0].isSemFornecedor).toBe(false);
  });

  it('marca sem mapeamento → grupo SEM_FORNECEDOR_LABEL com isSemFornecedor=true', () => {
    const mix = [makeMarca('GUESS')];
    const grupos = agruparPorFornecedor(mix, new Map());
    expect(grupos).toHaveLength(1);
    expect(grupos[0].isSemFornecedor).toBe(true);
    expect(grupos[0].fornecedor).toBe(SEM_FORNECEDOR_LABEL);
  });

  it('múltiplas marcas sem mapeamento ficam no mesmo grupo', () => {
    const mix = [makeMarca('GUESS'), makeMarca('VOGUE'), makeMarca('ESCADA')];
    const grupos = agruparPorFornecedor(mix, new Map());
    expect(grupos).toHaveLength(1);
    expect(grupos[0].marcas).toHaveLength(3);
  });
});
