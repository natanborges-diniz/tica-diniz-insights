/**
 * Testes — Onda 2.A (complementares)
 *
 * construirMixMarcasCompleto: augmentação com marcas sem vendas.
 * calcularCortes: índices corte1 e corte2.
 */
import { describe, it, expect } from 'vitest';
import { construirMixMarcasCompleto, calcularCortes } from '../mix-marcas-completo';
import { MIX_MINIMO_MARCA } from '../constants';
import type { MixMarcaV2, ItemMixV2 } from '../mix-ideal-v2';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const marcaMotor = (marca: string, mixTotal: number): MixMarcaV2 => ({
  marca,
  participacao: 0.5,
  pctPecas: 50,
  pctFaturamento: 50,
  pecasVendidas: 50,
  faturamento: 5000,
  mixTotal,
  mixRX: Math.round(mixTotal * 0.7),
  mixSolar: Math.round(mixTotal * 0.3),
  pctSolar: 30,
  estoqueEfetivo: 20,
  lacuna: Math.max(0, mixTotal - 20),
  status: mixTotal >= MIX_MINIMO_MARCA ? 'OK' : 'SUGERIR_DESCONTINUAR',
  estrategica: false,
  skusAlocados: [],
});

const itemEstoque = (marca: string, estoqueAtual: number, isDeadStock = false): ItemMixV2 => ({
  marca,
  qtdVendidos: 0,
  totalVendido: 0,
  estoqueAtual,
  isDeadStock,
  categoria: 'ARMACOES',
  codSku: Math.floor(Math.random() * 9000) + 1000,
  diasGiroUltimaPeca: null,
});

// ── construirMixMarcasCompleto ─────────────────────────────────────────────────

describe('construirMixMarcasCompleto — inclusão de marcas extras', () => {
  it('marca com estoque > 0 e sem vendas é incluída após as do motor', () => {
    const mixMarcas = [marcaMotor('RAYBAN', 100)];
    const itensMix = [itemEstoque('NOVA', 15)];
    const result = construirMixMarcasCompleto(mixMarcas, itensMix, new Map(), 30);
    expect(result).toHaveLength(2);
    expect(result[0].marca).toBe('RAYBAN');
    expect(result[1].marca).toBe('NOVA');
  });

  it('marca já presente no motor NÃO é duplicada', () => {
    const mixMarcas = [marcaMotor('RAYBAN', 100)];
    const itensMix = [itemEstoque('RAYBAN', 30)];
    const result = construirMixMarcasCompleto(mixMarcas, itensMix, new Map(), 30);
    expect(result).toHaveLength(1);
  });

  it('marca com estoqueAtual=0 NÃO é incluída', () => {
    const mixMarcas: MixMarcaV2[] = [];
    const itensMix = [itemEstoque('ZERADA', 0)];
    const result = construirMixMarcasCompleto(mixMarcas, itensMix, new Map(), 30);
    expect(result).toHaveLength(0);
  });

  it('item de categoria LENTES NÃO é incluído', () => {
    const mixMarcas: MixMarcaV2[] = [];
    const itensMix: ItemMixV2[] = [
      { marca: 'ZEISS', qtdVendidos: 0, totalVendido: 0, estoqueAtual: 10, isDeadStock: false, categoria: 'LENTES', codSku: 99 },
    ];
    const result = construirMixMarcasCompleto(mixMarcas, itensMix, new Map(), 30);
    expect(result).toHaveLength(0);
  });

  it('extra com estoque ativo → status SEM_VENDAS_180D, mixTotal=0', () => {
    const mixMarcas: MixMarcaV2[] = [];
    const itensMix = [itemEstoque('NOVA', 10, false)];
    const result = construirMixMarcasCompleto(mixMarcas, itensMix, new Map(), 30);
    expect(result[0].status).toBe('SEM_VENDAS_180D');
    expect(result[0].mixTotal).toBe(0);
  });

  it('extra com TODO estoque dead stock → status SUGERIR_DESCONTINUAR', () => {
    const mixMarcas: MixMarcaV2[] = [];
    const itensMix = [itemEstoque('MORTA', 10, true)];
    const result = construirMixMarcasCompleto(mixMarcas, itensMix, new Map(), 30);
    expect(result[0].status).toBe('SUGERIR_DESCONTINUAR');
    expect(result[0].estoqueEfetivo).toBe(0);
  });

  it('extras ordenados por estoqueEfetivo DESC', () => {
    const mixMarcas: MixMarcaV2[] = [];
    const itensMix = [
      itemEstoque('PEQUENA', 5),
      itemEstoque('GRANDE', 40),
      itemEstoque('MEDIA', 20),
    ];
    const result = construirMixMarcasCompleto(mixMarcas, itensMix, new Map(), 30);
    expect(result.map(m => m.marca)).toEqual(['GRANDE', 'MEDIA', 'PEQUENA']);
  });
});

describe('construirMixMarcasCompleto — toggle estratégica', () => {
  it('extra não-estratégica: mixTotal=0, status=SEM_VENDAS_180D', () => {
    const mixMarcas: MixMarcaV2[] = [];
    const itensMix = [itemEstoque('MARCA', 10)];
    const result = construirMixMarcasCompleto(mixMarcas, itensMix, new Map(), 30);
    expect(result[0].mixTotal).toBe(0);
    expect(result[0].status).toBe('SEM_VENDAS_180D');
    expect(result[0].estrategica).toBe(false);
  });

  it('após toggle estratégica=true: mixTotal=MIX_MINIMO_MARCA, status=ABAIXO_MINIMO_ESTRATEGICA', () => {
    const mixMarcas: MixMarcaV2[] = [];
    const itensMix = [itemEstoque('MARCA', 10)];
    const overrides = new Map([['MARCA', { estrategica: true }]]);
    const result = construirMixMarcasCompleto(mixMarcas, itensMix, overrides, 30);
    expect(result[0].mixTotal).toBe(MIX_MINIMO_MARCA);
    expect(result[0].status).toBe('ABAIXO_MINIMO_ESTRATEGICA');
    expect(result[0].estrategica).toBe(true);
  });

  it('estratégica com estoque suficiente → lacuna=0', () => {
    const mixMarcas: MixMarcaV2[] = [];
    const itensMix = [itemEstoque('MARCA', MIX_MINIMO_MARCA + 5)];
    const overrides = new Map([['MARCA', { estrategica: true }]]);
    const result = construirMixMarcasCompleto(mixMarcas, itensMix, overrides, 30);
    expect(result[0].lacuna).toBe(0);
  });

  it('pct_solar override aplicado ao extra estratégico', () => {
    const mixMarcas: MixMarcaV2[] = [];
    const itensMix = [itemEstoque('MARCA', 5)];
    const overrides = new Map([['MARCA', { estrategica: true, pct_solar: 100 }]]);
    const result = construirMixMarcasCompleto(mixMarcas, itensMix, overrides, 30);
    expect(result[0].pctSolar).toBe(100);
    expect(result[0].mixRX).toBe(0);
    expect(result[0].mixSolar).toBe(result[0].mixTotal);
  });
});

// ── calcularCortes ─────────────────────────────────────────────────────────────

describe('calcularCortes', () => {
  it('corte1 = número de marcas com mixTotal >= MIX_MINIMO_MARCA', () => {
    const lista: MixMarcaV2[] = [
      marcaMotor('A', 100),
      marcaMotor('B', 50),
      marcaMotor('C', 10),  // abaixo
      marcaMotor('D', 0),   // abaixo
    ];
    const { corte1 } = calcularCortes(lista, 800);
    expect(corte1).toBe(2);
  });

  it('corte2 = floor(capacidadeTotal / MIX_MINIMO_MARCA)', () => {
    const { corte2 } = calcularCortes([], 800);
    expect(corte2).toBe(Math.floor(800 / MIX_MINIMO_MARCA));
  });

  it('lista vazia → corte1=0', () => {
    const { corte1 } = calcularCortes([], 800);
    expect(corte1).toBe(0);
  });

  it('todas com mixTotal >= mínimo → corte1 = lista.length', () => {
    const lista = [marcaMotor('A', 50), marcaMotor('B', 25)];
    const { corte1 } = calcularCortes(lista, 500);
    expect(corte1).toBe(2);
  });

  it('capacidade 0 → corte2=0', () => {
    const { corte2 } = calcularCortes([], 0);
    expect(corte2).toBe(0);
  });
});
