// src/lib/estoque/mix-multi-loja.ts
// Motor puro que roda o mix ideal para várias lojas de uma vez e expõe
// agregadores por marca e por loja. Não faz I/O — o consumidor monta o input.
//
// O motor não sabe de onde vieram os dados (bridge por loja, snapshot Supabase,
// mock de teste). Isso deixa a assinatura estável mesmo se a fonte mudar.

import {
  calcularMixIdealV2,
  type ItemMixV2,
  type MarcaConfigV2,
  type MixMarcaV2,
} from './mix-ideal-v2';

// ── Entrada ───────────────────────────────────────────────────────────────────

export interface LojaInput {
  codEmpresa: number;
  itens: ReadonlyArray<ItemMixV2>;
  capacidadeTotal: number;
  pctSolarDefault?: number;
  minimoLoja?: number | null;
  marcaConfigs?: Map<string, MarcaConfigV2>;
}

export interface CalcMixMultiLojaParams {
  lojas: ReadonlyArray<LojaInput>;
}

// ── Saída granular ────────────────────────────────────────────────────────────

export interface MixLojaMarca extends MixMarcaV2 {
  codEmpresa: number;
}

// ── Saída agregada ────────────────────────────────────────────────────────────

export interface MarcaAgregada {
  marca: string;
  lojasCount: number;              // # lojas em que a marca aparece com participação > 0
  mixTotal: number;                // Σ mixTotal por loja
  estoqueEfetivo: number;          // Σ estoqueEfetivo
  lacuna: number;                  // Σ lacuna
  pecasVendidas: number;           // Σ pecasVendidas (6 meses)
  faturamento: number;             // Σ faturamento (6 meses)
  temEstrategica: boolean;         // marca é estratégica em ≥1 loja
  temAbaixoMinEstrategica: boolean;// ≥1 loja com status ABAIXO_MINIMO_ESTRATEGICA
  temSugerirDescontinuar: boolean; // ≥1 loja com status SUGERIR_DESCONTINUAR
}

export interface LojaAgregada {
  codEmpresa: number;
  marcasCount: number;             // # marcas com participação > 0 nesta loja
  capacidadeTotal: number;         // pass-through do input
  mixTotal: number;                // Σ mixTotal das marcas nesta loja
  estoqueEfetivo: number;          // Σ estoqueEfetivo
  lacuna: number;                  // Σ lacuna
  pecasVendidas: number;
  faturamento: number;
}

// ── Cálculo principal ─────────────────────────────────────────────────────────

/**
 * Roda calcularMixIdealV2 para cada loja e retorna uma linha por (loja, marca).
 * Preserva a semântica do motor V2 loja a loja — nada é misturado entre lojas
 * na hora de calcular participação (o share de RAYBAN em Barueri é independente
 * do share dela em Primitiva).
 */
export function calcularMixIdealMultiLoja({
  lojas,
}: CalcMixMultiLojaParams): MixLojaMarca[] {
  const resultado: MixLojaMarca[] = [];
  for (const loja of lojas) {
    const mixLoja = calcularMixIdealV2({
      itens: loja.itens,
      capacidadeTotal: loja.capacidadeTotal,
      pctSolarDefault: loja.pctSolarDefault,
      minimoLoja: loja.minimoLoja,
      marcaConfigs: loja.marcaConfigs,
    });
    for (const m of mixLoja) {
      resultado.push({ ...m, codEmpresa: loja.codEmpresa });
    }
  }
  return resultado;
}

// ── Agregadores ───────────────────────────────────────────────────────────────

/**
 * Soma métricas por marca através de todas as lojas. Ordenado por faturamento DESC.
 *
 * `participacao` NÃO é agregada — cada valor é relativo à loja e somá-los não faz
 * sentido. A UI da Entrega 2 pode derivar "% da rede" via mixTotal / Σ capacidades.
 */
export function agregarPorMarca(
  mix: ReadonlyArray<MixLojaMarca>,
): MarcaAgregada[] {
  const byMarca = new Map<string, MarcaAgregada>();
  for (const m of mix) {
    const cur = byMarca.get(m.marca) ?? {
      marca: m.marca,
      lojasCount: 0,
      mixTotal: 0,
      estoqueEfetivo: 0,
      lacuna: 0,
      pecasVendidas: 0,
      faturamento: 0,
      temEstrategica: false,
      temAbaixoMinEstrategica: false,
      temSugerirDescontinuar: false,
    };
    cur.lojasCount += 1;
    cur.mixTotal += m.mixTotal;
    cur.estoqueEfetivo += m.estoqueEfetivo;
    cur.lacuna += m.lacuna;
    cur.pecasVendidas += m.pecasVendidas;
    cur.faturamento += m.faturamento;
    if (m.estrategica) cur.temEstrategica = true;
    if (m.status === 'ABAIXO_MINIMO_ESTRATEGICA') cur.temAbaixoMinEstrategica = true;
    if (m.status === 'SUGERIR_DESCONTINUAR') cur.temSugerirDescontinuar = true;
    byMarca.set(m.marca, cur);
  }
  return Array.from(byMarca.values()).sort((a, b) => b.faturamento - a.faturamento);
}

/**
 * Soma métricas por loja através de todas as marcas. Ordenado por codEmpresa ASC.
 *
 * `capacidadeTotal` é preenchida pelo motor multi-loja através do input original
 * — mas como o agregador só recebe MixLojaMarca[], precisa que o consumidor
 * também forneça o map de capacidades. Para evitar a dependência, expõe a versão
 * simples (sem capacidade) e deixa a UI cruzar depois se precisar.
 */
export function agregarPorLoja(
  mix: ReadonlyArray<MixLojaMarca>,
  capacidadePorLoja?: ReadonlyMap<number, number>,
): LojaAgregada[] {
  const byLoja = new Map<number, LojaAgregada>();
  for (const m of mix) {
    const cur = byLoja.get(m.codEmpresa) ?? {
      codEmpresa: m.codEmpresa,
      marcasCount: 0,
      capacidadeTotal: capacidadePorLoja?.get(m.codEmpresa) ?? 0,
      mixTotal: 0,
      estoqueEfetivo: 0,
      lacuna: 0,
      pecasVendidas: 0,
      faturamento: 0,
    };
    cur.marcasCount += 1;
    cur.mixTotal += m.mixTotal;
    cur.estoqueEfetivo += m.estoqueEfetivo;
    cur.lacuna += m.lacuna;
    cur.pecasVendidas += m.pecasVendidas;
    cur.faturamento += m.faturamento;
    byLoja.set(m.codEmpresa, cur);
  }
  return Array.from(byLoja.values()).sort((a, b) => a.codEmpresa - b.codEmpresa);
}
