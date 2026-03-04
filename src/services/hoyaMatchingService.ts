// src/services/hoyaMatchingService.ts
// Intelligent matching between ERP lens descriptions and Hoya catalog products
// v2 — robust token-based fuzzy matching

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
  fornecedor: string | null;
  rawDescription: string;
  /** All meaningful tokens extracted from the description */
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

/** Map ERP material index to all known Hoya material field values */
const MATERIAL_MAP: Record<string, string[]> = {
  "1.50": ["150", "1.50"],
  "1.53": ["TVX", "153", "Trivex", "1.53"],
  "1.56": ["156", "1.56"],
  "1.59": ["POLI", "159", "Policarbonato", "1.59"],
  "1.60": ["160", "1.60"],
  "1.67": ["167", "1.67"],
  "1.74": ["174", "1.74"],
};

/** Aliases for design names — ERP shorthand → canonical Hoya name(s) */
const DESIGN_ALIASES: Record<string, string[]> = {
  "D+": ["Hoyalux D+ FF", "Hoyalux D+"],
  "DFF": ["Hoyalux D FF", "Hoyalux D+ FF"],
  "D FF": ["Hoyalux D FF"],
  "D+ FF": ["Hoyalux D+ FF"],
  "HOYALUX D+": ["Hoyalux D+ FF", "Hoyalux D+"],
  "HOYALUX D FF": ["Hoyalux D FF"],
  "HOYALUX D+ FF": ["Hoyalux D+ FF"],
  "HOYALUX ID": ["Hoyalux iD FF", "Hoyalux iD LS FF"],
  "ID FF": ["Hoyalux iD FF"],
  "ID LS FF": ["Hoyalux iD LS FF"],
  "IDENTIFY": ["Hoyalux iD MyStyle V+", "iD MyStyle"],
  "INDENTIFY": ["Hoyalux iD MyStyle V+", "iD MyStyle"],
  "IDENTIFY V+": ["Hoyalux iD MyStyle V+"],
  "INDENTIFY V+": ["Hoyalux iD MyStyle V+"],
  "ID MYSTYLE": ["Hoyalux iD MyStyle V+", "iD MyStyle"],
  "ID MYSTYLE V+": ["Hoyalux iD MyStyle V+"],
  "MYSTYLE": ["Hoyalux iD MyStyle V+", "iD MyStyle", "MyStyle"],
  "MYSTYLE V+": ["Hoyalux iD MyStyle V+"],
  "WORKSMART": ["WorkSmart", "Worksmart Room", "Worksmart"],
  "WORKSMART ROOM": ["Worksmart Room"],
  "WORK SMART": ["WorkSmart", "Worksmart Room"],
  "WORK SMART ROOM": ["Worksmart Room"],
  "SPORTIVE": ["Hoyalux Sportive FF"],
  "SYNC III": ["Sync III"],
  "SYNC 3": ["Sync III"],
  "SYNC": ["Sync III", "Sync"],
  "BALANSIS": ["Balansis"],
  "AMPLITUDE": ["Amplitude"],
  "SUMMIT": ["Summit"],
  "LIFESTYLE": ["Lifestyle"],
  "TRUEFORM": ["TrueForm"],
  "ARRAY": ["Array"],
  "PRECISION": ["Precision"],
  "NULUX": ["Nulux"],
  "HILUX": ["Hilux"],
  "ARGOS": ["Argos"],
};

/** Priority-ordered design names for substring matching (longer/more specific first) */
const PRIORITY_DESENHOS = [
  "Worksmart Room",
  "WorkSmart",
  "Hoyalux iD MyStyle V+",
  "Hoyalux iD LS FF",
  "Hoyalux iD FF",
  "Hoyalux D+ FF",
  "Hoyalux D FF",
  "Hoyalux Sportive FF",
  "Hoyalux",
  "Sync III",
  "Sync",
  "Argos",
  "iD MyStyle V+",
  "iD MyStyle",
  "iD FreeForm",
  "MyStyle",
  "Amplitude",
  "Summit",
  "Balansis",
  "Lifestyle",
  "TrueForm",
  "Array",
  "Precision",
  "Nulux",
  "Hilux",
];

/** Treatment mapping — ERP keywords → Hoya treatment names (ordered by specificity) */
const TREATMENT_ALIASES: [string[], string[]][] = [
  // Most specific first
  [["MEIRYO"], ["Meiryo", "MEIRYO"]],
  [["LONGBLUE", "LONG BLUE"], ["HV LL Bluecontrol", "Bluecontrol"]],
  [["NORISK BLUE", "NO RISK BLUE"], ["NoRisk", "Bluecontrol"]],
  [["BLUECONTROL", "BLUE CONTROL", "BLUE"], ["HV LL Bluecontrol", "Bluecontrol"]],
  [["LONGLIFE", "LONG LIFE", "LONG"], ["HV LongLife", "LongLife"]],
  [["NORISK", "NO RISK"], ["NoRisk"]],
  [["CLEANEXTRA", "CLEAN EXTRA"], ["CleanExtra"]],
  [["INC", "HARD"], ["HV HARD Anti-Risco", "HARD Anti-Risco", "Anti-Risco"]],
  [["SUN PRO"], ["Sun Pro", "Sensity"]],
  [["SENSITY DARK"], ["Sensity Dark"]],
  [["SENSITY 2"], ["Sensity 2"]],
  [["SENSITY"], ["Sensity"]],
];

/** Known suppliers by keyword in ERP description */
const SUPPLIER_KEYWORDS: [string, string][] = [
  ["HOYA", "HOYA"],
  ["ZEISS", "ZEISS"],
  ["ESSILOR", "ESSILOR"],
  ["VARILUX", "ESSILOR"],
  ["CRIZAL", "ESSILOR"],
  ["DMAX", "PROPRIA"],
  ["DNZ", "PROPRIA"],
];

/** Photochromic/photosensitive keywords */
const PHOTO_KEYWORDS = [
  { keywords: ["SUN PRO"], tipo: "Sun Pro", isFoto: true },
  { keywords: ["SENSITY DARK"], tipo: "Dark", isFoto: true },
  { keywords: ["SENSITY 2", "SENSITY2"], tipo: "2", isFoto: true },
  { keywords: ["SENSITY ORIGINAL"], tipo: "Original", isFoto: true },
  { keywords: ["SENSITY"], tipo: "Original", isFoto: true },
  { keywords: ["TRANSITIONS", "FOTOSSENSIVEL", "FOTOSSENSÍVEL", "PHOTO"], tipo: "Original", isFoto: true },
];

/** Color keywords */
const COLOR_MAP: Record<string, string> = {
  "CZ": "CZ", "CINZA": "CZ", "GREY": "CZ", "GRAY": "CZ",
  "MR": "MR", "MARROM": "MR", "BROWN": "MR",
  "VD": "VD", "VERDE": "VD", "GREEN": "VD",
};

// Noise words to strip from descriptions for matching
const NOISE_WORDS = new Set([
  "LENTE", "LENTES", "PAR", "DE", "COM", "PARA", "EM", "DO", "DA", "DAS", "DOS",
  "E", "OU", "O", "A", "OS", "AS", "UM", "UMA", "NO", "NA", "AO", "POR",
  "CADA", "GRAU", "RECEITA", "RX", "COMPLETA", "COMPLETO",
]);

// ============================================
// ERP DESCRIPTION PARSER (v2)
// ============================================

/**
 * Build a comprehensive list of known designs by merging the priority list
 * with all unique designs extracted from the catalog.
 */
export function buildDesenhosFromCatalog(catalogo: { desenho: string }[]): string[] {
  const catalogDesigns = [...new Set(catalogo.map(p => p.desenho).filter(Boolean))];
  const priorityUpper = new Set(PRIORITY_DESENHOS.map(d => d.toUpperCase()));
  const extras = catalogDesigns.filter(d => !priorityUpper.has(d.toUpperCase()));
  extras.sort((a, b) => b.length - a.length);
  return [...PRIORITY_DESENHOS, ...extras];
}

/** Normalize an ERP description for matching */
function normalizeDescription(desc: string): string {
  let s = desc.toUpperCase().trim();
  // Normalize common shorthand
  s = s.replace(/\bHOYA\s+D\+/g, "HOYALUX D+");
  s = s.replace(/\bHOYA\s+D\s+FF\b/g, "HOYALUX D FF");
  s = s.replace(/\bINDENTIFY\b/g, "IDENTIFY");
  s = s.replace(/\bID\s*MYSTYLE\b/g, "ID MYSTYLE");
  s = s.replace(/\bWORK\s*SMART\b/g, "WORKSMART");
  s = s.replace(/\bSYNC\s*3\b/g, "SYNC III");
  s = s.replace(/\bSUN\s*PRO\b/g, "SUN PRO");
  return s;
}

/** Extract meaningful tokens from a description */
function extractTokens(normalized: string): string[] {
  return normalized
    .split(/[\s\-\/\(\)\[\],;:\.]+/)
    .filter(t => t.length > 0 && !NOISE_WORDS.has(t));
}

export function parseErpDescription(desc: string, knownDesenhos?: string[]): ParsedLensDescription {
  const normalized = normalizeDescription(desc);
  const rawTokens = extractTokens(normalized);
  const desenhosList = knownDesenhos ?? PRIORITY_DESENHOS;

  // Tipo de lente
  const isProgressiva = rawTokens.some(t => ["PR", "PROG", "PROGRESSIVA", "PROGRESSIVO", "MULTIFOCAL"].includes(t));
  const isMonofocal = rawTokens.some(t => ["MONO", "MONOFOCAL", "VS", "SV", "VISAO SIMPLES"].includes(t));
  const tipoLente = isProgressiva ? "progressiva" : isMonofocal ? "monofocal" : "unknown";

  // Fornecedor
  let fornecedor: string | null = null;
  for (const [kw, sup] of SUPPLIER_KEYWORDS) {
    if (normalized.includes(kw)) { fornecedor = sup; break; }
  }

  // Material index
  let materialIndex: string | null = null;
  for (const [erpIdx, hoyaValues] of Object.entries(MATERIAL_MAP)) {
    if (normalized.includes(erpIdx)) { materialIndex = hoyaValues[0]; break; }
  }
  if (!materialIndex && (normalized.includes("TRIVEX") || normalized.includes("TVX"))) {
    materialIndex = "TVX";
  }
  if (!materialIndex && (normalized.includes("POLI"))) {
    materialIndex = "POLI";
  }

  // Desenho — try alias map first (most specific), then substring
  let desenho: string | null = null;

  // 1. Check aliases (from longest key to shortest for specificity)
  const aliasKeys = Object.keys(DESIGN_ALIASES).sort((a, b) => b.length - a.length);
  for (const aliasKey of aliasKeys) {
    if (normalized.includes(aliasKey)) {
      // Find first alias that exists in the catalog
      const candidates = DESIGN_ALIASES[aliasKey];
      const found = candidates.find(c => 
        desenhosList.some(d => d.toUpperCase() === c.toUpperCase())
      );
      desenho = found ?? candidates[0];
      break;
    }
  }

  // 2. Fallback: substring match against known designs
  if (!desenho) {
    for (const d of desenhosList) {
      if (normalized.includes(d.toUpperCase())) {
        desenho = d;
        break;
      }
    }
  }

  // Fotossensível / Photochromic
  let isFotossensivel = false;
  let fotossensivelTipo: string | null = null;
  let fotossensivelCor: string | null = null;
  for (const ph of PHOTO_KEYWORDS) {
    if (ph.keywords.some(kw => normalized.includes(kw))) {
      isFotossensivel = ph.isFoto;
      fotossensivelTipo = ph.tipo;
      break;
    }
  }
  // Color detection after photochromic keyword
  if (isFotossensivel) {
    for (const [kw, cor] of Object.entries(COLOR_MAP)) {
      if (rawTokens.includes(kw)) { fotossensivelCor = cor; break; }
    }
  }

  // Treatment — scan aliases in order (most specific first)
  let tratamento: string | null = null;
  let isBlue = false;
  let isINC = false;
  for (const [keywords, hoyaNames] of TREATMENT_ALIASES) {
    if (keywords.some(kw => normalized.includes(kw))) {
      tratamento = hoyaNames[0];
      if (hoyaNames.some(n => n.toLowerCase().includes("blue"))) isBlue = true;
      if (hoyaNames.some(n => n.toLowerCase().includes("anti-risco") || n.toLowerCase().includes("hard"))) isINC = true;
      break;
    }
  }
  // Also check individual token for BLUE
  if (!isBlue && rawTokens.includes("BLUE")) {
    isBlue = true;
    if (!tratamento) tratamento = "HV LL Bluecontrol";
  }

  return {
    tipoLente, desenho, materialIndex, tratamento,
    isFotossensivel, fotossensivelTipo, fotossensivelCor,
    isBlue, isINC, fornecedor,
    rawDescription: desc,
    tokens: rawTokens,
  };
}

// ============================================
// SCORING ENGINE (v2 — multi-signal)
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

/** Normalize a string for fuzzy comparison */
function norm(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Check if a product field contains any of the candidate strings */
function fieldContainsAny(field: string | number | null | undefined, candidates: string[]): boolean {
  if (field == null) return false;
  const f = String(field).toUpperCase();
  return candidates.some(c => f.includes(c.toUpperCase()));
}

/** Token overlap score — how many description tokens appear in the product name/desenho */
function tokenOverlapScore(tokens: string[], produto: HoyaProduto): number {
  const productText = [
    produto.nome, produto.desenho, String(produto.material), produto.tratamento,
    produto.fotossensivel ? String(produto.fotossensivel) : "",
  ].join(" ").toUpperCase();

  let hits = 0;
  for (const t of tokens) {
    if (NOISE_WORDS.has(t)) continue;
    if (t.length < 2) continue;
    if (productText.includes(t)) hits++;
  }
  return hits;
}

function calcScore(
  parsed: ParsedLensDescription,
  produto: HoyaProduto
): { score: number; details: string[] } {
  let score = 0;
  const details: string[] = [];

  // === Drawing match (highest weight) ===
  if (parsed.desenho) {
    const parsedNorm = norm(parsed.desenho);
    const prodNorm = norm(produto.desenho);
    if (parsedNorm === prodNorm) {
      score += 40;
      details.push(`Desenho exato "${produto.desenho}" ✓ (+40)`);
    } else if (prodNorm.includes(parsedNorm) || parsedNorm.includes(prodNorm)) {
      score += 30;
      details.push(`Desenho parcial "${produto.desenho}" ~ (+30)`);
    }
  }

  // === Material match ===
  if (parsed.materialIndex) {
    const parsedEntry = Object.entries(MATERIAL_MAP).find(([, vals]) => vals.some(v => v.toUpperCase() === parsed.materialIndex!.toUpperCase()));
    const acceptableValues = parsedEntry ? parsedEntry[1] : [parsed.materialIndex];
    if (acceptableValues.some(v => norm(String(produto.material)) === norm(v))) {
      score += 25;
      details.push(`Material "${produto.material}" ✓ (+25)`);
    }
  }

  // === Treatment match ===
  if (parsed.tratamento) {
    const tratNorm = norm(parsed.tratamento);
    const prodTrat = norm(produto.tratamento ?? "");
    if (tratNorm === prodTrat || prodTrat.includes(tratNorm) || tratNorm.includes(prodTrat)) {
      score += 20;
      details.push(`Tratamento "${produto.tratamento}" ✓ (+20)`);
    } else {
      // Check all aliases for the parsed treatment
      for (const [, hoyaNames] of TREATMENT_ALIASES) {
        const matchesParsed = hoyaNames.some(n => norm(n) === tratNorm || norm(n).includes(tratNorm));
        if (matchesParsed) {
          const matchesProd = hoyaNames.some(n => {
            const nn = norm(n);
            return prodTrat.includes(nn) || nn.includes(prodTrat);
          });
          if (matchesProd) {
            score += 15;
            details.push(`Tratamento alias "${produto.tratamento}" ~ (+15)`);
            break;
          }
        }
      }
      // Also check if product treatment contains a known variation of parsed.tratamento
      if (produto.tratamento && parsed.tokens.some(t => norm(produto.tratamento!).includes(norm(t)) && t.length >= 4)) {
        score += 10;
        details.push(`Tratamento token overlap "${produto.tratamento}" ~ (+10)`);
      }
    }
  }

  // === Photochromic match ===
  if (parsed.isFotossensivel) {
    if (produto.codigoFotossensivel != null && produto.fotossensivel) {
      score += 15;
      details.push(`Fotossensível ✓ (+15)`);
      if (parsed.fotossensivelTipo) {
        const fotoStr = String(produto.fotossensivel).toUpperCase();
        if (fotoStr.includes(parsed.fotossensivelTipo.toUpperCase())) {
          score += 5;
          details.push(`Tipo "${parsed.fotossensivelTipo}" ✓ (+5)`);
        }
      }
    }
  } else {
    if (produto.codigoFotossensivel == null) {
      score += 5;
      details.push(`Não-fotossensível ✓ (+5)`);
    }
  }

  // === COR/Bluecontrol variant ===
  if (parsed.isBlue) {
    const prodNome = produto.nome.toUpperCase();
    const prodTrat = (produto.tratamento ?? "").toUpperCase();
    if (prodNome.includes("COR") || prodTrat.includes("BLUE")) {
      score += 5;
      details.push(`Bluecontrol/COR ✓ (+5)`);
    }
  }

  // === Tipo lente ===
  if (parsed.tipoLente === "progressiva" && produto.tipoLente === "Visao Progressiva") {
    score += 5;
    details.push(`Tipo Progressiva ✓ (+5)`);
  } else if (parsed.tipoLente === "monofocal" && produto.tipoLente === "Visao Simples") {
    score += 5;
    details.push(`Tipo Monofocal ✓ (+5)`);
  }

  // === Token overlap bonus (fuzzy affinity) ===
  const overlap = tokenOverlapScore(parsed.tokens, produto);
  if (overlap >= 3) {
    const bonus = Math.min(overlap * 2, 10);
    score += bonus;
    details.push(`Token overlap (${overlap} hits) (+${bonus})`);
  }

  return { score, details };
}

// ============================================
// MATCHING ENGINE (v2)
// ============================================

export function matchProducts(
  catalogo: HoyaProduto[],
  descricaoErp: string,
  prescricao?: PrescricaoFiltro
): MatchResult {
  const allDesenhos = buildDesenhosFromCatalog(catalogo);
  const parsed = parseErpDescription(descricaoErp, allDesenhos);

  // Step 1: Filter by prescription compatibility
  let compativeis = prescricao
    ? catalogo.filter(p => isGrauCompativel(p, prescricao))
    : [...catalogo];

  // Step 2: Filter by tipo lente (soft — only if results exist)
  if (parsed.tipoLente === "progressiva") {
    const filtered = compativeis.filter(p => p.tipoLente === "Visao Progressiva");
    if (filtered.length > 0) compativeis = filtered;
  } else if (parsed.tipoLente === "monofocal") {
    const filtered = compativeis.filter(p => p.tipoLente === "Visao Simples");
    if (filtered.length > 0) compativeis = filtered;
  }

  // Step 3: Score each product
  const scored = compativeis.map(p => {
    const { score, details } = calcScore(parsed, p);
    return { produto: p, score, details };
  }).sort((a, b) => b.score - a.score);

  // Step 4: Filter out zero-score products
  const meaningful = scored.filter(s => s.score > 0);
  const results = meaningful.length > 0 ? meaningful : scored.slice(0, 50);

  // Step 5: Group by desenho + material (unique families)
  const groupMap = new Map<string, MatchGroup>();

  for (const { produto, score, details } of results) {
    const key = `${produto.codigoDesenho}_${produto.codigoMaterial}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        desenho: produto.desenho,
        material: String(produto.material),
        codigoDesenho: produto.codigoDesenho,
        codigoMaterial: produto.codigoMaterial,
        alturasDisponiveis: [],
        tratamentosDisponiveis: [],
        fotossensiveisDisponiveis: [],
        produtos: [],
        score,
        scoreDetails: details,
      });
    }
    const group = groupMap.get(key)!;
    group.produtos.push(produto);

    if (score > group.score) {
      group.score = score;
      group.scoreDetails = details;
    }

    // Unique heights
    if (produto.altura != null && produto.codigoAltura != null) {
      if (!group.alturasDisponiveis.some(a => a.codigoAltura === produto.codigoAltura)) {
        group.alturasDisponiveis.push({ altura: produto.altura, codigoAltura: produto.codigoAltura });
      }
    }

    // Unique treatments
    if (!group.tratamentosDisponiveis.some(t => t.codigoTratamento === produto.codigoTratamento)) {
      group.tratamentosDisponiveis.push({
        tratamento: produto.tratamento,
        codigoTratamento: produto.codigoTratamento,
        temCor: false,
      });
    }

    // Unique photochromic options
    if (produto.codigoFotossensivel != null && produto.fotossensivel) {
      if (!group.fotossensiveisDisponiveis.some(f => f.codigoFotossensivel === produto.codigoFotossensivel)) {
        group.fotossensiveisDisponiveis.push({
          nome: String(produto.fotossensivel),
          codigoFotossensivel: produto.codigoFotossensivel,
        });
      }
    }
  }

  // Sort groups by score descending
  const groups = Array.from(groupMap.values()).sort((a, b) => b.score - a.score);

  // Sort sub-items within groups
  groups.forEach(g => {
    g.alturasDisponiveis.sort((a, b) => a.altura - b.altura);
    g.tratamentosDisponiveis.sort((a, b) => a.tratamento.localeCompare(b.tratamento));
  });

  const bestGroup = groups.length > 0 ? groups[0] : null;
  let bestProduct: HoyaProduto | null = null;
  if (bestGroup && results.length > 0) {
    bestProduct = results.find(s => {
      const key = `${s.produto.codigoDesenho}_${s.produto.codigoMaterial}`;
      return key === `${bestGroup.codigoDesenho}_${bestGroup.codigoMaterial}`;
    })?.produto ?? null;
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
