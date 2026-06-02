// src/lib/estoque/mix-ideal-v2.ts
// Motor de Plano de Compra V2 — participação proporcional por marca (Princípio #6).
//
// NÃO modifica calcularMixIdealMarcas (legado OTB). Função nova e isolada.

import { calcularParticipacaoMarca } from './participacao-marca';
import { MIX_MINIMO_MARCA } from './constants';

// ── Interfaces de entrada ──────────────────────────────────────────────────────

export interface ItemMixV2 {
  marca: string;
  qtdVendidos: number;
  totalVendido: number;
  estoqueAtual: number;
  isDeadStock?: boolean;
  diasGiroUltimaPeca?: number | null;
  categoria?: string;         // 'ARMACOES' | outros — undefined assume ARMACOES
  codSku?: number;
  descricao?: string;
  codigoBarra?: string;       // cod_barras_interno (sempre preenchido quando vem do Bridge)
  ean?: string | null;        // EAN do fabricante; null quando não disponível
}

export interface MarcaConfigV2 {
  pctSolar?: number | null;   // 0-100; null → usa pctSolarDefault
  estrategica?: boolean;
  recemIntroduzida?: boolean;
}

// ── Interfaces de saída ────────────────────────────────────────────────────────

export interface SkuAlocado {
  codSku: number;
  descricao: string;
  diasGiroUltimaPeca: number; // 9999 quando null (sem dado de giro)
  qtdSugerida: number;
  codigoBarra?: string;       // cod_barras_interno; undefined em SKUs manuais
  ean?: string | null;        // EAN do fabricante; null quando não disponível
  isManual?: boolean;         // true para SKUs inseridos manualmente pelo usuário
  id?: string;                // UUID para SKUs manuais (chave de deduplicação)
}

export type StatusMixV2 = 'OK' | 'ABAIXO_MINIMO_ESTRATEGICA' | 'SUGERIR_DESCONTINUAR';

export interface MixMarcaV2 {
  marca: string;
  participacao: number;        // 0-1
  pctPecas: number;
  pctFaturamento: number;
  pecasVendidas: number;
  faturamento: number;
  mixTotal: number;            // peças ideais para a marca (após regras de mínimo)
  mixRX: number;               // mixTotal × (1 − pctSolar/100)
  mixSolar: number;            // mixTotal − mixRX
  pctSolar: number;            // 0-100 (valor efetivo usado)
  estoqueEfetivo: number;      // armações ativas (estoqueAtual > 0 && !isDeadStock)
  lacuna: number;              // max(0, mixTotal − estoqueEfetivo)
  status: StatusMixV2;
  estrategica: boolean;
  skusAlocados: SkuAlocado[];  // alocação por passadas (diasGiroUltimaPeca ASC)
}

export interface CalcMixIdealV2Params {
  itens: ReadonlyArray<ItemMixV2>;
  capacidadeTotal: number;
  marcaConfigs?: Map<string, MarcaConfigV2>;
  pctSolarDefault?: number;    // 0-100, default 30
}

// ── Alocação por passadas (round-robin, mais rápido primeiro) ─────────────────

function alocarPorPassadas(
  candidatos: ReadonlyArray<{
    codSku: number;
    descricao: string;
    diasGiroUltimaPeca: number | null | undefined;
    codigoBarra?: string;
    ean?: string | null;
  }>,
  lacuna: number
): SkuAlocado[] {
  if (lacuna <= 0 || candidatos.length === 0) return [];

  const sorted = [...candidatos].sort((a, b) => {
    const da = a.diasGiroUltimaPeca ?? Infinity;
    const db = b.diasGiroUltimaPeca ?? Infinity;
    return da - db;
  });

  const qtds = new Array<number>(sorted.length).fill(0);
  for (let rem = lacuna, i = 0; rem > 0; rem--, i++) {
    qtds[i % sorted.length] += 1;
  }

  return sorted
    .map((sku, idx) => ({
      codSku: sku.codSku,
      descricao: sku.descricao,
      diasGiroUltimaPeca: sku.diasGiroUltimaPeca ?? 9999,
      qtdSugerida: qtds[idx],
      codigoBarra: sku.codigoBarra,
      ean: sku.ean,
    }))
    .filter(s => s.qtdSugerida > 0);
}

// ── Função principal ──────────────────────────────────────────────────────────

/**
 * Calcula o mix ideal de marcas (V2) usando participação proporcional.
 *
 * Apenas Armações entram no cálculo.
 * Legado OTB: usa calcularMixIdealMarcas (mix-ideal.ts) — não alterado.
 */
export function calcularMixIdealV2({
  itens,
  capacidadeTotal,
  marcaConfigs = new Map(),
  pctSolarDefault = 30,
}: CalcMixIdealV2Params): MixMarcaV2[] {
  if (itens.length === 0 || capacidadeTotal <= 0) return [];

  const armacoes = itens.filter(
    i => i.categoria === undefined || i.categoria === 'ARMACOES'
  );

  const participacoes = calcularParticipacaoMarca(armacoes);

  // Estoque efetivo por marca (não dead stock, com estoque)
  const estoqueEfMap = new Map<string, number>();
  armacoes.forEach(i => {
    const k = (i.marca || 'SEM MARCA').trim();
    if (i.estoqueAtual > 0 && !i.isDeadStock) {
      estoqueEfMap.set(k, (estoqueEfMap.get(k) ?? 0) + i.estoqueAtual);
    }
  });

  // Candidatos à alocação por marca (qualquer SKU com codSku definido)
  const candidatosByMarca = new Map<
    string,
    Array<{ codSku: number; descricao: string; diasGiroUltimaPeca: number | null | undefined }>
  >();
  armacoes.forEach(i => {
    if (i.codSku === undefined) return;
    // Filtros de candidato (Onda 1 — Princípio: só SKU com giro recente entra no plano)
    if (!(i.qtdVendidos > 0)) return;            // filtro 1: vendeu nos últimos 90d
    if (i.diasGiroUltimaPeca == null) return;    // filtro 2: tem giro válido
    if (i.diasGiroUltimaPeca > 90) return;       // filtro 3: giro recente (≤ 90d)
    const k = (i.marca || 'SEM MARCA').trim();
    const lista = candidatosByMarca.get(k) ?? [];
    lista.push({
      codSku: i.codSku,
      descricao: i.descricao ?? '',
      diasGiroUltimaPeca: i.diasGiroUltimaPeca,
      codigoBarra: i.codigoBarra,
      ean: i.ean,
    });
    candidatosByMarca.set(k, lista);
  });

  const resultado: MixMarcaV2[] = [];

  for (const [marca, part] of participacoes) {
    if (part.participacao === 0 && part.pecasVendidas === 0) continue;

    const config = marcaConfigs.get(marca) ?? {};
    const estrategica = config.estrategica ?? false;
    const pctSolar = config.pctSolar != null ? config.pctSolar : pctSolarDefault;

    const mixTotalRaw = Math.round(capacidadeTotal * part.participacao);

    let mixTotal: number;
    let status: StatusMixV2;

    if (mixTotalRaw < MIX_MINIMO_MARCA) {
      if (estrategica) {
        mixTotal = MIX_MINIMO_MARCA;
        status = 'ABAIXO_MINIMO_ESTRATEGICA';
      } else {
        mixTotal = 0;
        status = 'SUGERIR_DESCONTINUAR';
      }
    } else {
      mixTotal = mixTotalRaw;
      status = 'OK';
    }

    const mixRX = Math.round(mixTotal * (1 - pctSolar / 100));
    const mixSolar = mixTotal - mixRX;
    const estoqueEfetivo = estoqueEfMap.get(marca) ?? 0;
    const lacuna = Math.max(0, mixTotal - estoqueEfetivo);
    const skusAlocados = alocarPorPassadas(candidatosByMarca.get(marca) ?? [], lacuna);

    resultado.push({
      marca,
      participacao: part.participacao,
      pctPecas: part.pctPecas,
      pctFaturamento: part.pctFaturamento,
      pecasVendidas: part.pecasVendidas,
      faturamento: part.faturamento,
      mixTotal,
      mixRX,
      mixSolar,
      pctSolar,
      estoqueEfetivo,
      lacuna,
      status,
      estrategica,
      skusAlocados,
    });
  }

  return resultado.sort((a, b) => b.participacao - a.participacao);
}
