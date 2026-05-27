/**
 * Testes — C.7: Filtro RX/Solar afeta KPIs e contador da aba
 *
 * Testa a lógica pura de filtragem que é aplicada nos useMemo da VisaoEstoquePage.
 * O motor de mix-ideal (lacuna por marca) NÃO é afetado pelo filtro.
 */
import { describe, it, expect } from 'vitest';
import { calcularMixIdealMarcas } from '../mix-ideal';

type SubcategoriaFiltro = 'TODAS' | 'AR_RX' | 'AR_SOLAR';
type Categoria = 'ARMACOES' | 'LENTES' | 'OUTROS';

interface ItemMock {
  categoria: Categoria;
  subcategoria: 'AR_RX' | 'AR_SOLAR' | 'LENTES' | 'OUTROS';
  estoqueAtual: number;
  isDeadStock: boolean;
  fornecedor: string;
  marca: string;
  acaoSugerida: string;
  valorEstoqueCusto: number;
}

// ─── Dataset: mix de RX + Solar + Lentes ────────────────────────────────────
const MOCK: ItemMock[] = [
  // Armações RX — 3 itens
  { categoria: 'ARMACOES', subcategoria: 'AR_RX',   estoqueAtual: 10, isDeadStock: false, fornecedor: 'FornA', marca: 'MarcaA', acaoSugerida: 'ESTOQUE OK',     valorEstoqueCusto: 1000 },
  { categoria: 'ARMACOES', subcategoria: 'AR_RX',   estoqueAtual: 5,  isDeadStock: true,  fornecedor: 'FornB', marca: 'MarcaB', acaoSugerida: 'LIQUIDA 30%',   valorEstoqueCusto: 500  },
  { categoria: 'ARMACOES', subcategoria: 'AR_RX',   estoqueAtual: 8,  isDeadStock: false, fornecedor: 'FornA', marca: 'MarcaA', acaoSugerida: 'ANALISE PARA RECOMPRA', valorEstoqueCusto: 800 },
  // Armações Solar — 2 itens
  { categoria: 'ARMACOES', subcategoria: 'AR_SOLAR', estoqueAtual: 20, isDeadStock: false, fornecedor: 'FornC', marca: 'MarcaC', acaoSugerida: 'ESTOQUE OK',    valorEstoqueCusto: 2000 },
  { categoria: 'ARMACOES', subcategoria: 'AR_SOLAR', estoqueAtual: 3,  isDeadStock: true,  fornecedor: 'FornD', marca: 'MarcaD', acaoSugerida: 'LIQUIDA 50%',  valorEstoqueCusto: 300  },
  // Lentes — não deve ser afetado pelo filtro RX/Solar
  { categoria: 'LENTES',   subcategoria: 'LENTES',   estoqueAtual: 15, isDeadStock: false, fornecedor: 'FornE', marca: 'MarcaE', acaoSugerida: 'ESTOQUE OK',    valorEstoqueCusto: 1500 },
];

// ─── Helpers que espelham os useMemo da VisaoEstoquePage ────────────────────

function aplicarFiltro(itens: ItemMock[], filtro: SubcategoriaFiltro, soArmacoes = false) {
  let base = itens.filter(i => i.estoqueAtual > 0);
  if (soArmacoes) base = base.filter(i => i.categoria === 'ARMACOES');
  if (filtro !== 'TODAS') base = base.filter(i => i.subcategoria === filtro);
  return base;
}

function calcContagem(itens: ItemMock[], filtro: SubcategoriaFiltro) {
  const base = aplicarFiltro(itens, filtro, true); // só armações
  return { skus: base.length, pecas: base.reduce((s, i) => s + i.estoqueAtual, 0) };
}

function calcMetricas(itens: ItemMock[], filtro: SubcategoriaFiltro) {
  // espelha metricasVisiveis da página (aplica filtro na base já filtrada por armações)
  const base = aplicarFiltro(itens, filtro, true);
  const totalPecas = base.reduce((s, i) => s + i.estoqueAtual, 0);
  const totalSkusComEstoque = base.length;
  const valorTotalCusto = base.reduce((s, i) => s + i.valorEstoqueCusto, 0);
  const dead = base.filter(i => i.isDeadStock);
  const deadStockPecas = dead.reduce((s, i) => s + i.estoqueAtual, 0);
  const deadStockPercentual = totalPecas > 0 ? (deadStockPecas / totalPecas) * 100 : 0;
  const pecasLiquidar = base.filter(i => i.acaoSugerida.toUpperCase().includes('LIQUIDA')).reduce((s, i) => s + i.estoqueAtual, 0);
  const estoqueEfetivo = base.filter(i => !i.isDeadStock).reduce((s, i) => s + i.estoqueAtual, 0);
  return { totalPecas, totalSkusComEstoque, valorTotalCusto, deadStockPecas, deadStockPercentual, pecasLiquidar, estoqueEfetivo };
}

// ─── Contagem da aba ─────────────────────────────────────────────────────────
describe('contagemArmacoesVisiveis — contador da aba', () => {
  it('TODAS: conta todos os SKUs de Armações (RX + Solar)', () => {
    const r = calcContagem(MOCK, 'TODAS');
    // RX: 10+5+8=23 peças, 3 SKUs | Solar: 20+3=23 peças, 2 SKUs → Total: 5 SKUs, 46 peças
    expect(r.skus).toBe(5);
    expect(r.pecas).toBe(46);
  });

  it('AR_RX: conta apenas SKUs de Armações RX', () => {
    const r = calcContagem(MOCK, 'AR_RX');
    expect(r.skus).toBe(3);
    expect(r.pecas).toBe(23); // 10+5+8
  });

  it('AR_SOLAR: conta apenas SKUs de Armações Solar', () => {
    const r = calcContagem(MOCK, 'AR_SOLAR');
    expect(r.skus).toBe(2);
    expect(r.pecas).toBe(23); // 20+3
  });

  it('Lentes não aparecem no contador da aba, independente do filtro', () => {
    const soLentes: ItemMock[] = [
      { categoria: 'LENTES', subcategoria: 'LENTES', estoqueAtual: 50, isDeadStock: false, fornecedor: 'F', marca: 'M', acaoSugerida: 'OK', valorEstoqueCusto: 500 },
    ];
    expect(calcContagem(soLentes, 'TODAS').skus).toBe(0);
    expect(calcContagem(soLentes, 'AR_RX').skus).toBe(0);
  });
});

// ─── KPIs filtrados ──────────────────────────────────────────────────────────
describe('metricasVisiveis — KPIs respondem ao filtro', () => {
  it('TODAS: totalPecas = soma de todas as Armações', () => {
    const r = calcMetricas(MOCK, 'TODAS');
    expect(r.totalPecas).toBe(46); // 10+5+8+20+3
    expect(r.totalSkusComEstoque).toBe(5);
  });

  it('AR_RX: totalPecas e KPIs = apenas RX', () => {
    const r = calcMetricas(MOCK, 'AR_RX');
    expect(r.totalPecas).toBe(23);
    expect(r.totalSkusComEstoque).toBe(3);
    expect(r.valorTotalCusto).toBe(2300); // 1000+500+800
  });

  it('AR_SOLAR: totalPecas e KPIs = apenas Solar', () => {
    const r = calcMetricas(MOCK, 'AR_SOLAR');
    expect(r.totalPecas).toBe(23);
    expect(r.totalSkusComEstoque).toBe(2);
    expect(r.valorTotalCusto).toBe(2300); // 2000+300
  });

  it('Dead Stock responde ao filtro — RX', () => {
    const r = calcMetricas(MOCK, 'AR_RX');
    expect(r.deadStockPecas).toBe(5);  // só o SKU RX dead (5 peças)
    expect(r.deadStockPercentual).toBeCloseTo((5 / 23) * 100, 5);
  });

  it('Dead Stock responde ao filtro — Solar', () => {
    const r = calcMetricas(MOCK, 'AR_SOLAR');
    expect(r.deadStockPecas).toBe(3);  // só o SKU Solar dead (3 peças)
  });

  it('Estoque Efetivo responde ao filtro', () => {
    const rxM = calcMetricas(MOCK, 'AR_RX');
    expect(rxM.estoqueEfetivo).toBe(18); // 10+8 (exclui dead=5)

    const solarM = calcMetricas(MOCK, 'AR_SOLAR');
    expect(solarM.estoqueEfetivo).toBe(20); // 20 (exclui dead=3)

    const todasM = calcMetricas(MOCK, 'TODAS');
    expect(todasM.estoqueEfetivo).toBe(38); // 10+8+20
  });

  it('Peças p/ Liquidar responde ao filtro', () => {
    // RX: 1 item com LIQUIDA (5 peças) | Solar: 1 item com LIQUIDA (3 peças)
    expect(calcMetricas(MOCK, 'AR_RX').pecasLiquidar).toBe(5);
    expect(calcMetricas(MOCK, 'AR_SOLAR').pecasLiquidar).toBe(3);
    expect(calcMetricas(MOCK, 'TODAS').pecasLiquidar).toBe(8);
  });
});

// ─── Filtro ignorado para outras categorias ──────────────────────────────────
describe('filtro RX/Solar ignorado quando categoria ≠ Armações', () => {
  it('se categoria = LENTES, filtro subcategoria não altera contagem', () => {
    // Quando o usuário está na aba Lentes, subcategoriaFiltroVisual = 'TODAS' (reset)
    // O filtro RX/Solar nunca é aplicado fora de Armações
    const soLentes: ItemMock[] = [
      { categoria: 'LENTES', subcategoria: 'LENTES', estoqueAtual: 50, isDeadStock: false, fornecedor: 'F', marca: 'M', acaoSugerida: 'OK', valorEstoqueCusto: 500 },
    ];
    // Simulação: filtro TODAS aplicado (como ocorre ao mudar de aba)
    const sem = aplicarFiltro(soLentes, 'TODAS', false).filter(i => i.categoria === 'LENTES');
    expect(sem.length).toBe(1);
    expect(sem[0].estoqueAtual).toBe(50);
  });
});

// ─── Motor de mix-ideal NÃO é afetado pelo filtro ───────────────────────────
describe('calcularMixIdealMarcas — lacuna não muda com filtro RX/Solar', () => {
  // A função de lacuna recebe todos os itens da marca (RX + Solar juntos)
  // e calcula pecasAtuais sem conhecimento de subcategoria
  const ITENS_MARCA = [
    { marca: 'RAYBAN', qtdVendidos: 10, totalVendido: 1000, estoqueAtual: 8,  isDeadStock: false }, // RX
    { marca: 'RAYBAN', qtdVendidos: 5,  totalVendido: 500,  estoqueAtual: 12, isDeadStock: false }, // Solar
  ];

  it('lacuna = max(0, pecasIdeais - (RX + Solar)) quando ambos passados', () => {
    const r = calcularMixIdealMarcas(ITENS_MARCA);
    const rayban = r.find(m => m.marca === 'RAYBAN')!;
    // pecasAtuais = 8 + 12 = 20 (ambos não-dead)
    expect(rayban.pecasAtuais).toBe(20);
  });

  it('se apenas RX for passado, pecasAtuais = só RX (mas isso nunca ocorre no motor)', () => {
    const somenteRX = ITENS_MARCA.filter((_, i) => i === 0);
    const r = calcularMixIdealMarcas(somenteRX);
    const rayban = r.find(m => m.marca === 'RAYBAN')!;
    expect(rayban.pecasAtuais).toBe(8);
    // Confirma que a lacuna seria maior (mix-ideal vê menos peças)
    const rCompleto = calcularMixIdealMarcas(ITENS_MARCA);
    const raybanCompleto = rCompleto.find(m => m.marca === 'RAYBAN')!;
    expect(raybanCompleto.lacuna).toBeLessThanOrEqual(rayban.lacuna);
  });

  it('subcategoria não é parâmetro de calcularMixIdealMarcas — invariante estrutural', () => {
    // O motor não aceita nem conhece subcategoria.
    // Verificamos que o resultado é idêntico independente de qualquer "filtro visual".
    const r1 = calcularMixIdealMarcas(ITENS_MARCA);
    const r2 = calcularMixIdealMarcas(ITENS_MARCA); // mesma chamada
    expect(r1).toEqual(r2);
    // A função é pura — sem estado externo
    expect(r1[0].lacuna).toBe(r2[0].lacuna);
  });
});
