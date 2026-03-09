// src/services/hoyaProductRequirements.ts
// Deriva requisitos de campos a partir dos dados do catálogo Hoya (ranges, campos complementares).
// Substitui a heurística baseada em nome (isSurfacada) por dados reais do produto.

import { HoyaProduto } from "./hoyaService";

/**
 * Requisitos derivados do produto Hoya.
 * Cada flag indica se aquele grupo de dados é exigido para o pedido.
 */
export interface ProductRequirements {
  /** Produto exige DNP (distância naso-pupilar) */
  needsDnp: boolean;
  /** Produto exige altura pupilar */
  needsAlturaPupilar: boolean;
  /** Produto exige medidas de armação (largura, altura, ponte, forma, tipo) */
  needsDadosArmacao: boolean;
  /** Produto aceita adição (progressivas, etc.) */
  needsAdicao: boolean;
  /** Range de altura pupilar válido (quando needsAlturaPupilar = true) */
  alturaPupilarRange: { min: number; max: number } | null;
  /** Range de adição válido (quando needsAdicao = true) */
  adicaoRange: { min: number; max: number } | null;
  /** Label amigável: "Lente Pronta" ou "Lente Surfaçada" */
  tipoLabel: string;
  /** True se classificado como lente pronta (não exige armação/DNP/altura) */
  isLentePronta: boolean;
}

/**
 * Deriva os requisitos de um produto Hoya a partir de seus ranges e metadados.
 *
 * Lógica:
 * - Se `alturaPupilarMinima` e `alturaPupilarMaxima` são ambos 0 (ou iguais a 0),
 *   o produto NÃO exige altura pupilar → é uma lente pronta.
 * - Lentes prontas também não exigem DNP nem dados de armação.
 * - Se há range de adição válido (min > 0 ou max > 0), o produto aceita adição.
 */
export function getProductRequirements(produto: HoyaProduto): ProductRequirements {
  const apMin = produto.alturaPupilarMinima ?? 0;
  const apMax = produto.alturaPupilarMaxima ?? 0;
  const hasAlturaPupilarRange = apMin !== 0 || apMax !== 0;

  const adMin = produto.adicaoMinima ?? 0;
  const adMax = produto.adicaoMaxima ?? 0;
  const hasAdicaoRange = adMin !== 0 || adMax !== 0;

  // Se o produto não tem range de altura pupilar, é lente pronta
  // Lentes prontas não exigem DNP, altura pupilar nem dados de armação
  const isLentePronta = !hasAlturaPupilarRange;

  return {
    needsDnp: !isLentePronta,
    needsAlturaPupilar: hasAlturaPupilarRange,
    needsDadosArmacao: !isLentePronta,
    needsAdicao: hasAdicaoRange,
    alturaPupilarRange: hasAlturaPupilarRange ? { min: apMin, max: apMax } : null,
    adicaoRange: hasAdicaoRange ? { min: adMin, max: adMax } : null,
    tipoLabel: isLentePronta ? "Lente Pronta" : "Lente Surfaçada",
    isLentePronta,
  };
}

/**
 * Versão fallback quando não temos o produto completo (ex: validação sem produto carregado).
 * Assume surfaçada (mais restritivo) por segurança.
 */
export function getDefaultRequirements(): ProductRequirements {
  return {
    needsDnp: true,
    needsAlturaPupilar: true,
    needsDadosArmacao: true,
    needsAdicao: true,
    alturaPupilarRange: null,
    adicaoRange: null,
    tipoLabel: "Lente Surfaçada",
    isLentePronta: false,
  };
}
