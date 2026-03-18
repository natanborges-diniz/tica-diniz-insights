// src/services/zeissProductGrouping.ts
// Groups Zeiss products by base family, extracting corridor heights as selectable options.
// This mirrors the Hoya MatchGroup → alturasDisponiveis pattern.

import { ZeissProduto } from "./zeissService";

// ============================================
// TYPES
// ============================================

export interface ZeissCorridorOption {
  /** Corridor height in mm (e.g. 14, 16, 18) */
  altura: number;
  /** The product code for this specific corridor variant */
  cod: string;
  /** Full product for this variant */
  produto: ZeissProduto;
}

export interface ZeissProductGroup {
  /** Base family name without corridor height (e.g. "PR ZEISS Light 2 Freeform 1.59") */
  baseName: string;
  /** Category from catalog */
  cat: string;
  /** Available corridor heights within this group */
  corridors: ZeissCorridorOption[];
  /** All products in this group */
  produtos: ZeissProduto[];
  /** Whether this group has multiple corridor options */
  hasCorridorVariants: boolean;
}

// ============================================
// CORRIDOR EXTRACTION
// ============================================

/**
 * Known progressive corridor heights (in mm).
 * Zeiss typically offers: 10, 11, 12, 14, 16, 18, 20
 */
const VALID_CORRIDOR_HEIGHTS = new Set([10, 11, 12, 14, 15, 16, 18, 20]);

/**
 * Extracts corridor height from a Zeiss product name.
 * 
 * Patterns recognized:
 * - "D 14" or "D14" — explicit design height prefix
 * - "- D 14" — with dash separator
 * - Isolated number matching known corridor heights in progressive lens names
 * 
 * Returns null if no corridor height is detected.
 */
export function extractCorridorHeight(nome: string): { height: number; pattern: string } | null {
  if (!nome) return null;
  const upper = nome.toUpperCase().trim();

  // Pattern 1: "D 14", "D14", "- D 14", "- D14"
  const dPattern = upper.match(/[-–]\s*D\s*(\d{1,2})\b|\bD\s+(\d{1,2})\b/);
  if (dPattern) {
    const val = parseInt(dPattern[1] || dPattern[2], 10);
    if (VALID_CORRIDOR_HEIGHTS.has(val)) {
      return { height: val, pattern: dPattern[0] };
    }
  }

  // Pattern 2: Standalone number that matches known corridor heights
  // Must be surrounded by spaces or at word boundaries, and product must be progressive
  const isProgressiva = /PROGRESS|MULTIFOC|SMARTLIFE|INDIVIDUAL|DRIVESAFE|ENERGIZE|OFFICE|PRECISION/i.test(upper);
  if (isProgressiva) {
    // Look for isolated numbers like " 14 ", " 16 " (not part of material index like 1.59)
    const matches = upper.matchAll(/(?<!\d[.,])\b(\d{2})\b(?![.,]\d)/g);
    for (const m of matches) {
      const val = parseInt(m[1], 10);
      // Skip material indices (50, 53, 56, 59, 60, 67, 74) and product version numbers
      const materialIndicators = new Set([50, 53, 56, 59, 60, 67, 74]);
      if (VALID_CORRIDOR_HEIGHTS.has(val) && !materialIndicators.has(val)) {
        return { height: val, pattern: m[0] };
      }
    }
  }

  return null;
}

/**
 * Removes the corridor height pattern from a product name to get the "base" family name.
 * Used for grouping products that differ only by corridor height.
 */
export function getBaseName(nome: string): string {
  if (!nome) return "";
  const corridor = extractCorridorHeight(nome);
  if (!corridor) return nome.trim();

  // Remove the corridor pattern and clean up extra spaces/dashes
  let base = nome.replace(corridor.pattern, " ");
  base = base.replace(/\s*[-–]\s*[-–]\s*/g, " - "); // Fix double dashes
  base = base.replace(/\s{2,}/g, " ").trim();
  // Remove trailing dash
  base = base.replace(/\s*[-–]\s*$/, "").trim();
  return base;
}

// ============================================
// GROUPING
// ============================================

/**
 * Groups Zeiss products by base family, extracting corridor variants.
 * Products without corridor variants remain as single-product groups.
 */
export function groupZeissProducts(produtos: ZeissProduto[]): Map<string, ZeissProductGroup> {
  const groups = new Map<string, ZeissProductGroup>();

  for (const p of produtos) {
    const nome = p.nome || p.descr || p.cod || "";
    const baseName = getBaseName(nome);
    const corridor = extractCorridorHeight(nome);
    
    // Create group key from base name + category
    const groupKey = `${baseName}__${p.cat || ""}`.toUpperCase();

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        baseName,
        cat: p.cat || "",
        corridors: [],
        produtos: [],
        hasCorridorVariants: false,
      });
    }

    const group = groups.get(groupKey)!;
    group.produtos.push(p);

    if (corridor) {
      group.corridors.push({
        altura: corridor.height,
        cod: p.cod,
        produto: p,
      });
    }
  }

  // Mark groups with multiple corridor options and sort corridors
  for (const group of groups.values()) {
    group.corridors.sort((a, b) => a.altura - b.altura);
    group.hasCorridorVariants = group.corridors.length > 1;
  }

  return groups;
}

/**
 * Finds the group that a specific product belongs to.
 */
export function findGroupForProduct(
  produto: ZeissProduto,
  groups: Map<string, ZeissProductGroup>,
): ZeissProductGroup | null {
  const nome = produto.nome || produto.descr || produto.cod || "";
  const baseName = getBaseName(nome);
  const groupKey = `${baseName}__${produto.cat || ""}`.toUpperCase();
  return groups.get(groupKey) || null;
}

/**
 * Given a product and available groups, returns the corridor options if any.
 * Used by the UI to show a corridor selector after product selection.
 */
export function getCorridorOptionsForProduct(
  produto: ZeissProduto,
  allProducts: ZeissProduto[],
): ZeissCorridorOption[] {
  const groups = groupZeissProducts(allProducts);
  const group = findGroupForProduct(produto, groups);
  if (!group || !group.hasCorridorVariants) return [];
  return group.corridors;
}
