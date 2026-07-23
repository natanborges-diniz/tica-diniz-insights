// src/lib/estoque/mix-ideal-v2.ts
// Motor de Plano de Compra — participação proporcional por marca × capacidade,
// com cascata de mínimo (minimoProprio ?? minimoLoja ?? MIX_MINIMO_MARCA).
// Fonte única de mix por loja desde a Fase 2.0b.

import { calcularParticipacaoMarca } from './participacao-marca';
import { MIX_MINIMO_MARCA } from './constants';
import { subcategorizarPorDescricao } from '@/utils/categorizarProduto';

// ── Interfaces de entrada ──────────────────────────────────────────────────────

export interface ItemMixV2 {
  marca: string;
  qtdVendidos: number;
  totalVendido: number;
  estoqueAtual: number;
  isDeadStock?: boolean;
  diasGiroUltimaPeca?: number | null;
  categoria?: string;         // 'ARMACOES' | outros — undefined assume ARMACOES
  subcategoria?: string;      // 'AR_RX' | 'AR_SOLAR' | outros; fallback via descrição
  codSku?: number;
  descricao?: string;
  codigoBarra?: string;       // cod_barras_interno (sempre preenchido quando vem do Bridge)
  ean?: string | null;        // EAN do fabricante; null quando não disponível
}

export interface MarcaConfigV2 {
  pctSolar?: number | null;      // 0-100; null → usa pctSolarDefault
  estrategica?: boolean;
  recemIntroduzida?: boolean;
  minimoProprio?: number | null; // override do mínimo para esta marca; null → herda minimoLoja
}

// ── Interfaces de saída ────────────────────────────────────────────────────────

export interface SkuAlocado {
  codSku: number;
  descricao: string;
  diasGiroUltimaPeca: number; // 9999 quando null (sem dado de giro)
  qtdSugerida: number;
  subcategoria?: string;      // 'AR_RX' | 'AR_SOLAR'
  codigoBarra?: string;       // cod_barras_interno; undefined em SKUs manuais
  ean?: string | null;        // EAN do fabricante; null quando não disponível
  isManual?: boolean;         // true para SKUs inseridos manualmente pelo usuário
  id?: string;                // UUID para SKUs manuais (chave de deduplicação)
}

export type StatusMixV2 = 'OK' | 'ABAIXO_MINIMO_ESTRATEGICA' | 'SUGERIR_DESCONTINUAR' | 'SEM_VENDAS_180D';

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
  minimoEfetivo: number;       // mínimo aplicado a esta marca (cascata: minimoProprio ?? minimoLoja ?? MIX_MINIMO_MARCA)
  skusAlocados: SkuAlocado[];  // alocação por passadas (diasGiroUltimaPeca ASC)
  // Volume vendido 180d (Onda 2.B — Princípio #26)
  vendido180dTotal?: number;
  vendido180dRx?: number;
  vendido180dSolar?: number;
  // Alocação RX/Solar (Onda 2.B — Princípio #24)
  qtdAlocadaRx?: number;
  qtdAlocadaSolar?: number;
  lacunaRx?: number;            // porção RX da lacuna sem candidatos disponíveis
  lacunaSolar?: number;         // porção Solar da lacuna sem candidatos disponíveis
}

export interface CalcMixIdealV2Params {
  itens: ReadonlyArray<ItemMixV2>;
  capacidadeTotal: number;
  marcaConfigs?: Map<string, MarcaConfigV2>;
  pctSolarDefault?: number;    // 0-100, default 30
  minimoLoja?: number | null;  // capacidade_expositor.mix_minimo; null → herda MIX_MINIMO_MARCA
}

// ── Tipo interno para candidatos ──────────────────────────────────────────────

type CandidatoInterno = {
  codSku: number;
  descricao: string;
  diasGiroUltimaPeca: number | null | undefined;
  codigoBarra?: string;
  ean?: string | null;
  subcategoria: string;
};

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

// ── Alocação split RX/Solar (Onda 2.B — Princípio #24) ───────────────────────
//
// Divide a lacuna proporcionalmente entre RX e Solar e roda dois round-robins
// independentes. Em falta de candidatos numa categoria, a lacuna fica honesta.

function alocarSplit(
  candidatosRx: ReadonlyArray<CandidatoInterno>,
  candidatosSolar: ReadonlyArray<CandidatoInterno>,
  mixRX: number,
  mixSolar: number,
  lacuna: number,
): { skus: SkuAlocado[]; qtdAlocadaRx: number; qtdAlocadaSolar: number; lacunaRx: number; lacunaSolar: number } {
  if (lacuna <= 0) {
    return { skus: [], qtdAlocadaRx: 0, qtdAlocadaSolar: 0, lacunaRx: 0, lacunaSolar: 0 };
  }

  const mixTotal = mixRX + mixSolar;
  const lacunaRxAlloc = mixTotal > 0 ? Math.round(lacuna * mixRX / mixTotal) : 0;
  const lacunaSolarAlloc = lacuna - lacunaRxAlloc;

  const rxAloc = alocarPorPassadas(candidatosRx, lacunaRxAlloc);
  const solarAloc = alocarPorPassadas(candidatosSolar, lacunaSolarAlloc);

  const qtdAlocadaRx = rxAloc.reduce((s, sk) => s + sk.qtdSugerida, 0);
  const qtdAlocadaSolar = solarAloc.reduce((s, sk) => s + sk.qtdSugerida, 0);

  const skus: SkuAlocado[] = [
    ...rxAloc.map(sk => ({ ...sk, subcategoria: 'AR_RX' })),
    ...solarAloc.map(sk => ({ ...sk, subcategoria: 'AR_SOLAR' })),
  ];

  return {
    skus,
    qtdAlocadaRx,
    qtdAlocadaSolar,
    lacunaRx: lacunaRxAlloc - qtdAlocadaRx,
    lacunaSolar: lacunaSolarAlloc - qtdAlocadaSolar,
  };
}

// ── Função principal ──────────────────────────────────────────────────────────

/**
 * Calcula o mix ideal de marcas usando participação proporcional × capacidade.
 * Apenas Armações entram no cálculo.
 */
export function calcularMixIdealV2({
  itens,
  capacidadeTotal,
  marcaConfigs = new Map(),
  pctSolarDefault = 30,
  minimoLoja = null,
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

  // Volume vendido 180d por marca, split RX/Solar (Onda 2.B)
  const vendidoByMarca = new Map<string, { total: number; rx: number; solar: number }>();
  armacoes.forEach(i => {
    if (!(i.qtdVendidos > 0)) return;
    const k = (i.marca || 'SEM MARCA').trim();
    const subcat = i.subcategoria ?? subcategorizarPorDescricao(i.descricao ?? '');
    const entry = vendidoByMarca.get(k) ?? { total: 0, rx: 0, solar: 0 };
    entry.total += i.qtdVendidos;
    if (subcat === 'AR_RX') entry.rx += i.qtdVendidos;
    if (subcat === 'AR_SOLAR') entry.solar += i.qtdVendidos;
    vendidoByMarca.set(k, entry);
  });

  // Candidatos à alocação por marca, separados por RX/Solar
  const candidatosByMarca = new Map<string, CandidatoInterno[]>();
  armacoes.forEach(i => {
    if (i.codSku === undefined) return;
    // Filtros de candidato (Onda 1 — Princípio: só SKU com giro recente entra no plano)
    if (!(i.qtdVendidos > 0)) return;            // filtro 1: vendeu nos últimos 90d
    if (i.diasGiroUltimaPeca == null) return;    // filtro 2: tem giro válido
    if (i.diasGiroUltimaPeca > 90) return;       // filtro 3: giro recente (≤ 90d)
    const k = (i.marca || 'SEM MARCA').trim();
    const subcat = i.subcategoria ?? subcategorizarPorDescricao(i.descricao ?? '');
    const lista = candidatosByMarca.get(k) ?? [];
    lista.push({
      codSku: i.codSku,
      descricao: i.descricao ?? '',
      diasGiroUltimaPeca: i.diasGiroUltimaPeca,
      codigoBarra: i.codigoBarra,
      ean: i.ean,
      subcategoria: subcat,
    });
    candidatosByMarca.set(k, lista);
  });

  const resultado: MixMarcaV2[] = [];

  for (const [marca, part] of participacoes) {
    if (part.participacao === 0 && part.pecasVendidas === 0) continue;

    const config = marcaConfigs.get(marca) ?? {};
    const estrategica = config.estrategica ?? false;
    const pctSolar = config.pctSolar != null ? config.pctSolar : pctSolarDefault;
    const minimoEfetivo = config.minimoProprio ?? minimoLoja ?? MIX_MINIMO_MARCA;

    const mixTotalRaw = Math.floor(capacidadeTotal * part.participacao);

    let mixTotal: number;
    let status: StatusMixV2;

    if (mixTotalRaw < minimoEfetivo) {
      if (estrategica) {
        mixTotal = minimoEfetivo;
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

    const candidatos = candidatosByMarca.get(marca) ?? [];
    // Princípio #27: classificação estrita — OUTROS não compõe plano automático
    const candidatosRx = candidatos.filter(c => c.subcategoria === 'AR_RX');
    const candidatosSolar = candidatos.filter(c => c.subcategoria === 'AR_SOLAR');
    const { skus: skusAlocados, qtdAlocadaRx, qtdAlocadaSolar, lacunaRx, lacunaSolar } =
      alocarSplit(candidatosRx, candidatosSolar, mixRX, mixSolar, lacuna);

    const vend = vendidoByMarca.get(marca) ?? { total: 0, rx: 0, solar: 0 };

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
      minimoEfetivo,
      skusAlocados,
      vendido180dTotal: vend.total,
      vendido180dRx: vend.rx,
      vendido180dSolar: vend.solar,
      qtdAlocadaRx,
      qtdAlocadaSolar,
      lacunaRx,
      lacunaSolar,
    });
  }

  return resultado.sort((a, b) => b.participacao - a.participacao);
}
