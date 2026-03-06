// src/services/hoyaMatchingService.ts
// Intelligent matching between ERP lens descriptions and Hoya catalog products
// v3 — Catalog-first matching with fuzzy fallback

import { HoyaProduto } from "./hoyaService";

// ============================================
// TYPES
// ============================================

export interface ParsedLensDescription {
  tipoLente: "progressiva" | "monofocal" | "unknown";
  desenho: string | null;
  materialIndex: string | null;
  tratamento: string | null;
  isFotossensivel: boolean;
  fotossensivelTipo: string | null;
  fotossensivelCor: string | null;
  isBlue: boolean;
  isINC: boolean;
  isPronta: boolean;
  fornecedor: string | null;
  rawDescription: string;
  tokens: string[];
}

export interface MatchGroup {
  desenho: string;
  material: string;
  codigoDesenho: number;
  codigoMaterial: number;
  alturasDisponiveis: { altura: number; codigoAltura: number }[];
  tratamentosDisponiveis: { tratamento: string; codigoTratamento: number; temCor: boolean }[];
  fotossensiveisDisponiveis: { nome: string; codigoFotossensivel: number }[];
  produtos: HoyaProduto[];
  score: number;
  scoreDetails: string[];
}

export interface MatchResult {
  parsed: ParsedLensDescription;
  groups: MatchGroup[];
  bestGroup: MatchGroup | null;
  bestProduct: HoyaProduto | null;
}

// ============================================
// CONSTANTS & MAPS
// ============================================

const MATERIAL_MAP: Record<string, string[]> = {
  "1.50": ["150", "1.50", "CR39", "CR-39"],
  "1.53": ["TVX", "153", "Trivex", "1.53", "TRIVEX"],
  "1.56": ["156", "1.56"],
  "1.59": ["POLI", "159", "Policarbonato", "1.59", "POLICARBONATO", "PC"],
  "1.60": ["160", "1.60", "MR8"],
  "1.67": ["167", "1.67", "MR7", "MR-7"],
  "1.74": ["174", "1.74", "MR174"],
};

/** Reverse material index lookup: given a string like "174", return "1.74" */
function findMaterialIndex(s: string): string | null {
  const upper = s.toUpperCase();
  for (const [idx, aliases] of Object.entries(MATERIAL_MAP)) {
    if (upper === idx) return idx;
    if (aliases.some(a => a.toUpperCase() === upper)) return idx;
  }
  return null;
}

/** Design aliases — ERP keywords → canonical Hoya names (ordered by priority) */
const DESIGN_ALIASES: Record<string, string[]> = {
  // === Progressivas premium ===
  "HOYALUX ID MYSTYLE V+": ["Hoyalux iD MyStyle V+"],
  "ID MYSTYLE V+": ["Hoyalux iD MyStyle V+"],
  "MYSTYLE V+": ["Hoyalux iD MyStyle V+"],
  "IDENTIFY V+": ["Hoyalux iD MyStyle V+"],
  "INDENTIFY V+": ["Hoyalux iD MyStyle V+"],
  "IDENTIFY": ["Hoyalux iD MyStyle V+", "iD MyStyle"],
  "INDENTIFY": ["Hoyalux iD MyStyle V+", "iD MyStyle"],
  "ID MYSTYLE": ["Hoyalux iD MyStyle V+", "iD MyStyle"],
  "MYSTYLE": ["Hoyalux iD MyStyle V+", "iD MyStyle", "MyStyle"],

  // === Progressivas iD ===
  "HOYALUX ID LS FF": ["Hoyalux iD LS FF"],
  "ID LS FF": ["Hoyalux iD LS FF"],
  "HOYALUX ID FF": ["Hoyalux iD FF"],
  "ID FF": ["Hoyalux iD FF"],
  "HOYALUX ID": ["Hoyalux iD FF", "Hoyalux iD LS FF"],

  // === Progressivas D+ / D FF ===
  "HOYALUX D+ FF": ["Hoyalux D+ FF"],
  "D+ FF": ["Hoyalux D+ FF"],
  "HOYALUX D+": ["Hoyalux D+ FF", "Hoyalux D+"],
  "D+": ["Hoyalux D+ FF", "Hoyalux D+"],
  "DFF": ["Hoyalux D FF", "Hoyalux D+ FF"],
  "D FF": ["Hoyalux D FF"],
  "HOYALUX D FF": ["Hoyalux D FF"],

  // === Sportive ===
  "HOYALUX SPORTIVE FF": ["Hoyalux Sportive FF"],
  "HOYALUX SPORTIVE": ["Hoyalux Sportive FF"],
  "SPORTIVE FF": ["Hoyalux Sportive FF"],
  "SPORTIVE": ["Hoyalux Sportive FF"],

  // === Ocupacionais / WorkSmart ===
  "WORKSMART ROOM": ["Worksmart Room"],
  "WORK SMART ROOM": ["Worksmart Room"],
  "WORKSMART DESK": ["Worksmart Desk"],
  "WORKSMART SPACE": ["Worksmart Space"],
  "WORKSMART": ["WorkSmart", "Worksmart Room", "Worksmart Desk", "Worksmart Space"],
  "WORK SMART": ["WorkSmart", "Worksmart Room"],

  // === Sync ===
  "SYNC III": ["Sync III"],
  "SYNC 3": ["Sync III"],
  "SYNC": ["Sync III", "Sync"],

  // === Monofocais ===
  "NULUX EP": ["Nulux EP"],
  "NULUX": ["Nulux"],
  "HILUX": ["Hilux"],
  "ARGOS": ["Argos"],

  // === Outras famílias ===
  "BALANSIS": ["Balansis"],
  "AMPLITUDE": ["Amplitude"],
  "SUMMIT PRO": ["Summit Pro"],
  "SUMMIT": ["Summit"],
  "LIFESTYLE": ["Lifestyle"],
  "TRUEFORM": ["TrueForm"],
  "ARRAY": ["Array"],
  "PRECISION": ["Precision"],
};

/** Priority-ordered designs for substring matching (longest first) */
const PRIORITY_DESENHOS = [
  "Hoyalux iD MyStyle V+",
  "Hoyalux iD LS FF",
  "Hoyalux iD FF",
  "Hoyalux D+ FF",
  "Hoyalux D FF",
  "Hoyalux Sportive FF",
  "Worksmart Room",
  "Worksmart Desk",
  "Worksmart Space",
  "WorkSmart",
  "Sync III",
  "Sync",
  "iD MyStyle V+",
  "iD MyStyle",
  "iD FreeForm",
  "MyStyle",
  "Nulux EP",
  "Nulux",
  "Hilux",
  "Argos",
  "Amplitude",
  "Summit Pro",
  "Summit",
  "Balansis",
  "Lifestyle",
  "TrueForm",
  "Array",
  "Precision",
];

/** Treatment aliases — ERP keywords → Hoya treatment names (most specific first) */
const TREATMENT_ALIASES: { keywords: string[]; hoyaNames: string[]; isBlue?: boolean; isINC?: boolean }[] = [
  { keywords: ["MEIRYO"], hoyaNames: ["Meiryo", "MEIRYO"] },
  { keywords: ["LONGBLUE", "LONG BLUE", "LL BLUE", "LLBLUE"], hoyaNames: ["HV LL Bluecontrol", "Bluecontrol"], isBlue: true },
  { keywords: ["NORISK BLUE", "NO RISK BLUE", "NORISC BLUE"], hoyaNames: ["NoRisk", "Bluecontrol"], isBlue: true },
  { keywords: ["BLUECONTROL", "BLUE CONTROL", "BLUCONTROL"], hoyaNames: ["HV LL Bluecontrol", "Bluecontrol", "BlueControl"], isBlue: true },
  { keywords: ["LONGLIFE", "LONG LIFE", "LL", "LONG"], hoyaNames: ["HV LongLife", "LongLife"] },
  { keywords: ["NORISK", "NO RISK", "NORISC"], hoyaNames: ["NoRisk"] },
  { keywords: ["CLEANEXTRA", "CLEAN EXTRA"], hoyaNames: ["CleanExtra"] },
  { keywords: ["HARD", "INC", "ANTI RISCO", "ANTIRISCO"], hoyaNames: ["HV HARD Anti-Risco", "HARD Anti-Risco", "Anti-Risco"], isINC: true },
  { keywords: ["BLUE"], hoyaNames: ["HV LL Bluecontrol", "Bluecontrol"], isBlue: true },
];

/** Known suppliers */
const SUPPLIER_KEYWORDS: [string, string][] = [
  ["HOYA", "HOYA"],
  ["ZEISS", "ZEISS"],
  ["ESSILOR", "ESSILOR"],
  ["VARILUX", "ESSILOR"],
  ["CRIZAL", "ESSILOR"],
  ["DMAX", "PROPRIA"],
  ["DNZ", "PROPRIA"],
];

/** Photochromic keywords (most specific first) */
const PHOTO_KEYWORDS = [
  { keywords: ["SUN PRO", "SUNPRO"], tipo: "Sun Pro" },
  { keywords: ["SENSITY DARK", "SENSITYDARK"], tipo: "Sensity Dark" },
  { keywords: ["SENSITY 2", "SENSITY2"], tipo: "Sensity 2" },
  { keywords: ["SENSITY ORIGINAL"], tipo: "Sensity" },
  { keywords: ["SENSITY"], tipo: "Sensity" },
  { keywords: ["TRANSITIONS", "FOTOSSENSIVEL", "FOTOSSENSÍVEL", "PHOTO", "FOTOCROMATICA", "FOTOCROMÁTICA"], tipo: "Sensity" },
];

/** Color keywords */
const COLOR_MAP: Record<string, string> = {
  "CZ": "CZ", "CINZA": "CZ", "GREY": "CZ", "GRAY": "CZ",
  "MR": "MR", "MARROM": "MR", "BROWN": "MR",
  "VD": "VD", "VERDE": "VD", "GREEN": "VD",
};

const NOISE_WORDS = new Set([
  "LENTE", "LENTES", "PAR", "DE", "COM", "PARA", "EM", "DO", "DA", "DAS", "DOS",
  "E", "OU", "O", "A", "OS", "AS", "UM", "UMA", "NO", "NA", "AO", "POR",
  "CADA", "GRAU", "RECEITA", "RX", "COMPLETA", "COMPLETO", "HOYA",
  "LG", "LP", "VS", "EST", "PREMIUM", "RES", "SURF", "PRONTA",
]);

// ============================================
// FUZZY UTILITIES
// ============================================

/** Levenshtein distance between two strings */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[m][n];
}

/** Normalized similarity (0..1, 1 = identical) */
function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/** Normalize for comparison */
function norm(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// ============================================
// ERP DESCRIPTION PARSER (v3)
// ============================================

export function buildDesenhosFromCatalog(catalogo: { desenho: string }[]): string[] {
  const catalogDesigns = [...new Set(catalogo.map(p => p.desenho).filter(Boolean))];
  const priorityUpper = new Set(PRIORITY_DESENHOS.map(d => d.toUpperCase()));
  const extras = catalogDesigns.filter(d => !priorityUpper.has(d.toUpperCase()));
  extras.sort((a, b) => b.length - a.length);
  return [...PRIORITY_DESENHOS, ...extras];
}

function normalizeDescription(desc: string): string {
  let s = desc.toUpperCase().trim();
  // Separate stuck-together tokens like "HILUX1.50" → "HILUX 1.50"
  s = s.replace(/([A-Z])(\d+\.\d+)/g, "$1 $2");
  s = s.replace(/(\d+\.\d+)([A-Z])/g, "$1 $2");
  s = s.replace(/\bHOYA\s+D\+/g, "HOYALUX D+");
  s = s.replace(/\bHOYA\s+D\s+FF\b/g, "HOYALUX D FF");
  s = s.replace(/\bINDENTIFY\b/g, "IDENTIFY");
  s = s.replace(/\bID\s*MYSTYLE\b/g, "ID MYSTYLE");
  s = s.replace(/\bWORK\s*SMART\b/g, "WORKSMART");
  s = s.replace(/\bSYNC\s*3\b/g, "SYNC III");
  s = s.replace(/\bSUN\s*PRO\b/g, "SUN PRO");
  s = s.replace(/\bSENSITY\s*DARK\b/g, "SENSITY DARK");
  s = s.replace(/\bSENSITY\s*2\b/g, "SENSITY 2");
  s = s.replace(/\bLONG\s*LIFE\b/g, "LONGLIFE");
  s = s.replace(/\bLONG\s*BLUE\b/g, "LONGBLUE");
  s = s.replace(/\bNO\s*RISK\b/g, "NORISK");
  s = s.replace(/\bCLEAN\s*EXTRA\b/g, "CLEANEXTRA");
  s = s.replace(/\bANTI\s*RISCO\b/g, "ANTIRISCO");
  s = s.replace(/\bBLUE\s*CONTROL\b/g, "BLUECONTROL");
  return s;
}

function extractTokens(normalized: string): string[] {
  return normalized
    .split(/[\s\-\/\(\)\[\],;:\.]+/)
    .filter(t => t.length > 0 && !NOISE_WORDS.has(t));
}

export function parseErpDescription(desc: string, knownDesenhos?: string[]): ParsedLensDescription {
  const normalized = normalizeDescription(desc);
  const rawTokens = extractTokens(normalized);
  const desenhosList = knownDesenhos ?? PRIORITY_DESENHOS;

  // Lente Pronta (LP) — detected from the normalized string before noise removal
  // NOTE: LP products in Hoya do NOT have "Pronta" in the name.
  // "DG" in product name = surfaçada (custom). Without "DG" = pronta (ready-made).
  const isPronta = /\bLP\b/.test(normalized);

  // Tipo de lente
  const isProgressiva = rawTokens.some(t => ["PR", "PROG", "PROGRESSIVA", "PROGRESSIVO", "MULTIFOCAL"].includes(t));
  const isMonofocal = rawTokens.some(t => ["MONO", "MONOFOCAL", "VS", "SV"].includes(t)) || normalized.includes("VISAO SIMPLES");
  const tipoLente = isProgressiva ? "progressiva" : isMonofocal ? "monofocal" : "unknown";

  // Fornecedor
  let fornecedor: string | null = null;
  for (const [kw, sup] of SUPPLIER_KEYWORDS) {
    if (normalized.includes(kw)) { fornecedor = sup; break; }
  }

  // Material index — scan tokens for known indices
  let materialIndex: string | null = null;
  for (const token of rawTokens) {
    const found = findMaterialIndex(token);
    if (found) { materialIndex = found; break; }
  }
  // Also check raw string for patterns like "1.74", "1.67"
  if (!materialIndex) {
    const idxMatch = normalized.match(/\b1\.(50|53|56|59|60|67|74)\b/);
    if (idxMatch) materialIndex = `1.${idxMatch[1]}`;
  }
  if (!materialIndex && (normalized.includes("TRIVEX") || normalized.includes("TVX"))) materialIndex = "1.53";
  if (!materialIndex && normalized.includes("POLI")) materialIndex = "1.59";

  // Desenho — 1) alias map (longest key first), 2) substring, 3) fuzzy
  let desenho: string | null = null;

  const aliasKeys = Object.keys(DESIGN_ALIASES).sort((a, b) => b.length - a.length);
  for (const aliasKey of aliasKeys) {
    if (normalized.includes(aliasKey)) {
      const candidates = DESIGN_ALIASES[aliasKey];
      const found = candidates.find(c =>
        desenhosList.some(d => d.toUpperCase() === c.toUpperCase())
      );
      desenho = found ?? candidates[0];
      break;
    }
  }

  if (!desenho) {
    for (const d of desenhosList) {
      if (normalized.includes(d.toUpperCase())) {
        desenho = d;
        break;
      }
    }
  }

  // Fuzzy fallback: find best Levenshtein match among catalog designs
  if (!desenho) {
    const meaningfulTokens = rawTokens.filter(t => t.length >= 3 && !["150", "153", "156", "159", "160", "167", "174"].includes(t));
    const joined = meaningfulTokens.join(" ");
    if (joined.length >= 3) {
      let bestSim = 0;
      let bestDesign: string | null = null;
      for (const d of desenhosList) {
        const sim = similarity(norm(joined), norm(d));
        if (sim > bestSim) {
          bestSim = sim;
          bestDesign = d;
        }
      }
      if (bestSim >= 0.5 && bestDesign) {
        desenho = bestDesign;
      }
    }
  }

  // Fotossensível / Photochromic
  let isFotossensivel = false;
  let fotossensivelTipo: string | null = null;
  let fotossensivelCor: string | null = null;
  for (const ph of PHOTO_KEYWORDS) {
    if (ph.keywords.some(kw => normalized.includes(kw))) {
      isFotossensivel = true;
      fotossensivelTipo = ph.tipo;
      break;
    }
  }
  if (isFotossensivel) {
    for (const [kw, cor] of Object.entries(COLOR_MAP)) {
      if (rawTokens.includes(kw)) { fotossensivelCor = cor; break; }
    }
  }

  // Treatment
  let tratamento: string | null = null;
  let isBlue = false;
  let isINC = false;
  for (const tAlias of TREATMENT_ALIASES) {
    if (tAlias.keywords.some(kw => normalized.includes(kw))) {
      tratamento = tAlias.hoyaNames[0];
      if (tAlias.isBlue) isBlue = true;
      if (tAlias.isINC) isINC = true;
      break;
    }
  }

  // LP detection: do NOT append "Pronta" — the scoring engine
  // uses DG presence/absence to rank products correctly

  return {
    tipoLente, desenho, materialIndex, tratamento,
    isFotossensivel, fotossensivelTipo, fotossensivelCor,
    isBlue, isINC, isPronta, fornecedor,
    rawDescription: desc,
    tokens: rawTokens,
  };
}

// ============================================
// PRESCRIPTION FILTER
// ============================================

interface PrescricaoFiltro {
  esfericoOd?: number | null;
  esfericoOe?: number | null;
  cilindricoOd?: number | null;
  cilindricoOe?: number | null;
  adicaoOd?: number | null;
  adicaoOe?: number | null;
}

function isGrauCompativel(produto: HoyaProduto, prescricao: PrescricaoFiltro): boolean {
  const esfOd = prescricao.esfericoOd ?? 0;
  const esfOe = prescricao.esfericoOe ?? 0;
  if (esfOd < produto.esfericoMinimo || esfOd > produto.esfericoMaximo) return false;
  if (esfOe < produto.esfericoMinimo || esfOe > produto.esfericoMaximo) return false;
  const cilOd = prescricao.cilindricoOd ?? 0;
  const cilOe = prescricao.cilindricoOe ?? 0;
  if (cilOd < produto.cilindricoMinimo || cilOd > produto.cilindricoMaximo) return false;
  if (cilOe < produto.cilindricoMinimo || cilOe > produto.cilindricoMaximo) return false;
  if (produto.adicaoMinima > 0 || produto.adicaoMaxima > 0) {
    const adicOd = prescricao.adicaoOd ?? 0;
    const adicOe = prescricao.adicaoOe ?? 0;
    if (adicOd > 0 && (adicOd < produto.adicaoMinima || adicOd > produto.adicaoMaxima)) return false;
    if (adicOe > 0 && (adicOe < produto.adicaoMinima || adicOe > produto.adicaoMaxima)) return false;
  }
  return true;
}

// ============================================
// SCORING ENGINE (v3 — Catalog-First)
// ============================================

/**
 * v3 scoring: The key insight is that we score DESIGN + MATERIAL as primary signals,
 * and then ENRICH the group with ALL available treatments/photos from the catalog.
 * Treatment/photo are used as ranking bonuses but NEVER as exclusion filters.
 *
 * v3.1 fix: Material match is now a HARD signal — explicit material mismatch
 * incurs a heavy penalty to prevent e.g. Trivex from outranking 1.50.
 * DG/LP penalties are capped so they never override a material match.
 */

/**
 * Detect if a product is surfaçada (custom-ground).
 * Rule: Only SV (Visão Simples) lenses WITHOUT "DG" in the name are "Prontas".
 * ALL other lenses (PR/Progressive, Lifestyle, etc.) are ALWAYS surfaçadas,
 * regardless of whether they have "DG" in the name or not.
 */
function produtoIsSurfacada(produto: HoyaProduto): boolean {
  const isSV = produto.tipoLente === "Visao Simples";
  if (!isSV) return true; // Non-SV lenses are ALWAYS surfaçadas
  // Within SV: DG = surfaçada, no DG = pronta
  const hasDG = /\bDG\b/i.test(produto.nome) || /\bDG\b/i.test(produto.desenho);
  return hasDG;
}

/** Convenience: is this product a "Lente Pronta"? */
function produtoIsPronta(produto: HoyaProduto): boolean {
  return !produtoIsSurfacada(produto);
}

function calcDesignScore(parsed: ParsedLensDescription, produto: HoyaProduto): { score: number; details: string[] } {
  let score = 0;
  const details: string[] = [];

  // === 1. DESIGN MATCH (primary signal, max 50) ===
  if (parsed.desenho) {
    const parsedNorm = norm(parsed.desenho);
    const prodNorm = norm(produto.desenho);
    if (parsedNorm === prodNorm) {
      score += 50;
      details.push(`Desenho exato "${produto.desenho}" ✓ (+50)`);
    } else if (prodNorm.includes(parsedNorm) || parsedNorm.includes(prodNorm)) {
      score += 35;
      details.push(`Desenho parcial "${produto.desenho}" ~ (+35)`);
    } else {
      // Fuzzy design similarity
      const sim = similarity(parsedNorm, prodNorm);
      if (sim >= 0.6) {
        const pts = Math.round(sim * 25);
        score += pts;
        details.push(`Desenho fuzzy "${produto.desenho}" (${Math.round(sim * 100)}%) (+${pts})`);
      }
    }
  } else {
    // No design parsed — use token overlap against product name
    const prodText = `${produto.desenho} ${produto.nome}`.toUpperCase();
    const meaningfulTokens = parsed.tokens.filter(t => t.length >= 3);
    let hits = 0;
    for (const t of meaningfulTokens) {
      if (prodText.includes(t)) hits++;
    }
    if (hits > 0) {
      const pts = Math.min(hits * 8, 30);
      score += pts;
      details.push(`Token overlap (${hits} hits) (+${pts})`);
    }
  }

  // === 2. MATERIAL MATCH (primary signal, max 30 / penalty -25) ===
  // When the ERP explicitly states a material index (e.g. "1.50"),
  // a mismatch is a STRONG negative signal — prevents Trivex from beating 1.50.
  if (parsed.materialIndex) {
    const prodMatStr = String(produto.material).toUpperCase();
    const expectedAliases = MATERIAL_MAP[parsed.materialIndex] ?? [parsed.materialIndex];
    const matches = expectedAliases.some(a => {
      const aN = norm(a);
      const pN = norm(prodMatStr);
      return aN === pN || pN.includes(aN) || aN.includes(pN);
    });
    if (matches) {
      score += 30;
      details.push(`Material "${produto.material}" ✓ (+30)`);
    } else {
      // Explicit material mismatch — heavy penalty
      score -= 25;
      details.push(`Material "${produto.material}" ≠ esperado ${parsed.materialIndex} (-25)`);
    }
  }

  // === 3. TIPO LENTE bonus (max 5) ===
  if (parsed.tipoLente === "progressiva" && produto.tipoLente === "Visao Progressiva") {
    score += 5;
    details.push(`Tipo Progressiva ✓ (+5)`);
  } else if (parsed.tipoLente === "monofocal" && produto.tipoLente === "Visao Simples") {
    score += 5;
    details.push(`Tipo Monofocal ✓ (+5)`);
  }

  // === 3b. LENTE PRONTA (LP) vs SURFAÇADA (DG) bonus/penalty ===
  // "DG" in product name = surfaçada (custom-ground). Without "DG" = pronta (ready-made).
  // Penalties are moderate so they NEVER override an explicit material match.
  const isDG = produtoIsDG(produto);
  if (parsed.isPronta) {
    if (!isDG) {
      score += 10;
      details.push(`Lente Pronta (LP) — produto sem DG ✓ (+10)`);
    } else {
      score -= 10;
      details.push(`Lente Pronta (LP) mas produto DG (surfaçada) (-10)`);
    }
  } else {
    if (isDG) {
      score += 5;
      details.push(`Produto DG (surfaçada) para item não-LP ✓ (+5)`);
    } else {
      score -= 5;
      details.push(`Produto sem DG (pronta) para item não-LP (-5)`);
    }
  }

  // === 4. TREATMENT BONUS (ranking aid, max 15) ===
  if (parsed.tratamento) {
    const prodTrat = norm(produto.tratamento ?? "");
    const parsedTratNorm = norm(parsed.tratamento);
    if (parsedTratNorm && prodTrat) {
      if (parsedTratNorm === prodTrat || prodTrat.includes(parsedTratNorm) || parsedTratNorm.includes(prodTrat)) {
        score += 15;
        details.push(`Tratamento "${produto.tratamento}" ✓ (+15)`);
      } else {
        // Check aliases
        for (const tAlias of TREATMENT_ALIASES) {
          const matchesParsed = tAlias.hoyaNames.some(n => {
            const nn = norm(n);
            return nn === parsedTratNorm || nn.includes(parsedTratNorm) || parsedTratNorm.includes(nn);
          });
          if (matchesParsed) {
            const matchesProd = tAlias.hoyaNames.some(n => {
              const nn = norm(n);
              return prodTrat.includes(nn) || nn.includes(prodTrat);
            });
            if (matchesProd) {
              score += 10;
              details.push(`Tratamento alias "${produto.tratamento}" ~ (+10)`);
              break;
            }
          }
        }
      }
    }
  }

  // === 5. PHOTOCHROMIC BONUS (max 10) ===
  if (parsed.isFotossensivel) {
    if (produto.codigoFotossensivel != null && produto.fotossensivel) {
      score += 10;
      details.push(`Fotossensível ✓ (+10)`);
      if (parsed.fotossensivelTipo) {
        const fotoStr = String(produto.fotossensivel).toUpperCase();
        if (fotoStr.includes(parsed.fotossensivelTipo.toUpperCase())) {
          score += 5;
          details.push(`Tipo foto "${parsed.fotossensivelTipo}" ✓ (+5)`);
        }
      }
    }
  }

  return { score, details };
}

// ============================================
// MATCHING ENGINE (v3 — Catalog-First)
// ============================================

/**
 * The v3 engine works in 3 phases:
 * 
 * Phase 1: Parse description → extract design, material, treatment, photo hints
 * Phase 2: Score ALL products by design + material affinity (catalog-first)
 * Phase 3: Group by design+material family, ENRICH each group with ALL available
 *          treatments/photos from the catalog (not just matched ones)
 * 
 * This ensures that even if "Meiryo" isn't in the ERP description,
 * it still appears as an available treatment for a Hilux 1.50 group.
 */
export function matchProducts(
  catalogo: HoyaProduto[],
  descricaoErp: string,
  prescricao?: PrescricaoFiltro
): MatchResult {
  const allDesenhos = buildDesenhosFromCatalog(catalogo);
  const parsed = parseErpDescription(descricaoErp, allDesenhos);

  // Phase 1: Filter by prescription compatibility
  let compativeis = prescricao
    ? catalogo.filter(p => isGrauCompativel(p, prescricao))
    : [...catalogo];

  // Soft filter by tipo lente
  if (parsed.tipoLente === "progressiva") {
    const filtered = compativeis.filter(p => p.tipoLente === "Visao Progressiva");
    if (filtered.length > 0) compativeis = filtered;
  } else if (parsed.tipoLente === "monofocal") {
    const filtered = compativeis.filter(p => p.tipoLente === "Visao Simples");
    if (filtered.length > 0) compativeis = filtered;
  }

  // Phase 2: Score each product
  const scored = compativeis.map(p => {
    const { score, details } = calcDesignScore(parsed, p);
    return { produto: p, score, details };
  }).sort((a, b) => b.score - a.score);

  // Phase 3: Build groups — KEY CHANGE: group by design+material,
  // then enrich with ALL products from catalog for that family
  const meaningful = scored.filter(s => s.score > 0);
  const results = meaningful.length > 0 ? meaningful : scored.slice(0, 100);

  // Collect unique design+material+DG families from scored results
  // v3.1: We now include DG/non-DG as a separate dimension to avoid
  // mixing surfaçadas and prontas under the same family name
  const familyKeys = new Set<string>();
  const familyMap = new Map<string, { score: number; details: string[] }>();

  for (const { produto, score, details } of results) {
    const isDG = produtoIsDG(produto);
    const key = `${produto.codigoDesenho}_${produto.codigoMaterial}_${isDG ? "DG" : "LP"}`;
    familyKeys.add(key);
    const existing = familyMap.get(key);
    if (!existing || score > existing.score) {
      familyMap.set(key, { score, details });
    }
  }

  // Now build groups by pulling ALL catalog products for each family
  // This ensures ALL treatments and photos are available, not just matched ones
  const groupMap = new Map<string, MatchGroup>();

  for (const key of familyKeys) {
    const parts = key.split("_");
    const codDesenho = Number(parts[0]);
    const codMaterial = Number(parts[1]);
    const keyDG = parts[2] === "DG";
    const familyScore = familyMap.get(key)!;

    // Get ALL products in this family from the full catalog (not just scored ones)
    const familyProducts = (prescricao
      ? catalogo.filter(p => isGrauCompativel(p, prescricao))
      : catalogo
    ).filter(p => 
      p.codigoDesenho === codDesenho && 
      p.codigoMaterial === codMaterial &&
      produtoIsDG(p) === keyDG
    );

    if (familyProducts.length === 0) continue;

    // Build display-friendly material name
    const rawMaterial = String(familyProducts[0].material);
    const materialLabel = rawMaterial;

    // Build display name with DG/Pronta indicator
    const dgLabel = keyDG ? " (Surfaçada)" : " (Pronta)";
    const displayDesenho = familyProducts[0].desenho + dgLabel;

    const group: MatchGroup = {
      desenho: displayDesenho,
      material: materialLabel,
      codigoDesenho: codDesenho,
      codigoMaterial: codMaterial,
      alturasDisponiveis: [],
      tratamentosDisponiveis: [],
      fotossensiveisDisponiveis: [],
      produtos: familyProducts,
      score: familyScore.score,
      scoreDetails: familyScore.details,
    };

    // Collect ALL unique options from the family
    const seenAlturas = new Set<number>();
    const seenTratamentos = new Set<number>();
    const seenFotos = new Set<number>();

    for (const p of familyProducts) {
      if (p.altura != null && p.codigoAltura != null && !seenAlturas.has(p.codigoAltura)) {
        seenAlturas.add(p.codigoAltura);
        group.alturasDisponiveis.push({ altura: p.altura, codigoAltura: p.codigoAltura });
      }
      if (!seenTratamentos.has(p.codigoTratamento)) {
        seenTratamentos.add(p.codigoTratamento);
        group.tratamentosDisponiveis.push({
          tratamento: p.tratamento,
          codigoTratamento: p.codigoTratamento,
          temCor: p.nome.toUpperCase().includes(" COR"),
        });
      }
      if (p.codigoFotossensivel != null && p.fotossensivel && !seenFotos.has(p.codigoFotossensivel)) {
        seenFotos.add(p.codigoFotossensivel);
        group.fotossensiveisDisponiveis.push({
          nome: String(p.fotossensivel),
          codigoFotossensivel: p.codigoFotossensivel,
        });
      }
    }

    // Sort sub-items
    group.alturasDisponiveis.sort((a, b) => a.altura - b.altura);
    group.tratamentosDisponiveis.sort((a, b) => a.tratamento.localeCompare(b.tratamento));

    groupMap.set(key, group);
  }

  const groups = Array.from(groupMap.values()).sort((a, b) => b.score - a.score);

  const bestGroup = groups.length > 0 ? groups[0] : null;
  let bestProduct: HoyaProduto | null = null;
  if (bestGroup) {
    // Find the best-scored product within the best group
    const bestGroupProducts = results.filter(s => {
      return s.produto.codigoDesenho === bestGroup.codigoDesenho &&
             s.produto.codigoMaterial === bestGroup.codigoMaterial;
    });
    bestProduct = bestGroupProducts.length > 0 ? bestGroupProducts[0].produto : bestGroup.produtos[0];
  }

  return { parsed, groups, bestGroup, bestProduct };
}

// ============================================
// SUPPLIER DETECTION
// ============================================

export function detectSupplier(descricao: string | null | undefined): string | null {
  if (!descricao) return null;
  const upper = descricao.toUpperCase();
  for (const [kw, sup] of SUPPLIER_KEYWORDS) {
    if (upper.includes(kw)) return sup;
  }
  return null;
}

export function getSupplierBadgeInfo(supplier: string | null): {
  label: string;
  className: string;
} | null {
  if (!supplier) return null;
  switch (supplier) {
    case "HOYA":
      return { label: "Hoya", className: "bg-chart-1/15 text-chart-1 border-chart-1/30" };
    case "ZEISS":
      return { label: "Zeiss", className: "bg-chart-2/15 text-chart-2 border-chart-2/30" };
    case "ESSILOR":
      return { label: "Essilor", className: "bg-chart-3/15 text-chart-3 border-chart-3/30" };
    case "PROPRIA":
      return { label: "Própria", className: "bg-muted text-muted-foreground border-border" };
    default:
      return null;
  }
}

// Helper: find the exact product from selections
export function findExactProduct(
  produtos: HoyaProduto[],
  codigoDesenho: number,
  codigoMaterial: number,
  codigoAltura: number | null,
  codigoTratamento: number,
  codigoFotossensivel: number | null,
  isCor: boolean
): HoyaProduto | null {
  return produtos.find(p => {
    if (p.codigoDesenho !== codigoDesenho) return false;
    if (p.codigoMaterial !== codigoMaterial) return false;
    if (codigoAltura != null && p.codigoAltura !== codigoAltura) return false;
    if (p.codigoTratamento !== codigoTratamento) return false;
    if (codigoFotossensivel != null && p.codigoFotossensivel !== codigoFotossensivel) return false;
    if (codigoFotossensivel == null && p.codigoFotossensivel != null) return false;
    const hasCor = p.nome.toUpperCase().includes(" COR");
    if (isCor !== hasCor) return false;
    return true;
  }) ?? null;
}
