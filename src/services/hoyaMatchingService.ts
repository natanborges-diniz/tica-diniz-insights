// src/services/hoyaMatchingService.ts
// Intelligent matching between ERP lens descriptions and Hoya catalog products

import { HoyaProduto } from "./hoyaService";

// ============================================
// TYPES
// ============================================

export interface ParsedLensDescription {
  tipoLente: "progressiva" | "monofocal" | "unknown";
  desenho: string | null;
  materialIndex: string | null; // "150", "160", "167", "TVX"
  tratamento: string | null;
  isFotossensivel: boolean;
  fotossensivelTipo: string | null; // "Original", "2"
  fotossensivelCor: string | null; // "CZ" (cinza), "MR" (marrom)
  isBlue: boolean; // COR/Bluecontrol variant
  isINC: boolean; // HARD Anti-Risco
  fornecedor: string | null; // "HOYA", "ZEISS", "ESSILOR", "PROPRIA"
  rawDescription: string;
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
// ERP DESCRIPTION PARSER
// ============================================

/** Map ERP material index to Hoya material field */
const MATERIAL_MAP: Record<string, string[]> = {
  "1.50": ["150"],
  "1.53": ["TVX", "153", "Trivex"],
  "1.56": ["156"],
  "1.59": ["POLI", "159", "Policarbonato"],
  "1.60": ["160"],
  "1.67": ["167"],
  "1.74": ["174"],
};

/** Priority-ordered design names for substring matching (longer/more specific first) */
const PRIORITY_DESENHOS = [
  "Hoyalux D+ FF",
  "Hoyalux D FF",
  "Hoyalux iD FF",
  "Hoyalux iD LS FF",
  "Hoyalux iD MyStyle V+",
  "Hoyalux Sportive FF",
  "Hoyalux",
  "Sync III",
  "Sync",
  "Argos",
  "MyStyle",
  "iD FreeForm",
  "iD MyStyle",
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

/**
 * Build a comprehensive list of known designs by merging the priority list
 * with all unique designs extracted from the catalog.
 * Catalog designs not in the priority list are appended at the end.
 */
export function buildDesenhosFromCatalog(catalogo: { desenho: string }[]): string[] {
  const catalogDesigns = [...new Set(catalogo.map(p => p.desenho).filter(Boolean))];
  // Keep priority list first (order matters for substring matching)
  const priorityUpper = new Set(PRIORITY_DESENHOS.map(d => d.toUpperCase()));
  const extras = catalogDesigns.filter(d => !priorityUpper.has(d.toUpperCase()));
  // Sort extras by length descending (longer names first to avoid partial matches)
  extras.sort((a, b) => b.length - a.length);
  return [...PRIORITY_DESENHOS, ...extras];
}

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

/** Treatment mapping from ERP suffix to Hoya treatment */
const TREATMENT_MAP: Record<string, string[]> = {
  LONG: ["HV LongLife", "LongLife"],
  LONGBLUE: ["HV LL Bluecontrol", "Bluecontrol"],
  INC: ["HV HARD Anti-Risco", "HARD Anti-Risco"],
  NORISK: ["NoRisk"],
  CLEANEXTRA: ["CleanExtra"],
  BLUECONTROL: ["Bluecontrol", "HV LL Bluecontrol"],
};

export function parseErpDescription(desc: string, knownDesenhos?: string[]): ParsedLensDescription {
  const upper = desc.toUpperCase().trim();
  const tokens = upper.split(/\s+/);
  const desenhosList = knownDesenhos ?? PRIORITY_DESENHOS;

  // Tipo de lente
  const isProgressiva = tokens.some(t => ["PR", "PROG", "PROGRESSIVA", "PROGRESSIVO"].includes(t));
  const isMonofocal = tokens.some(t => ["MONO", "MONOFOCAL", "VS", "SV"].includes(t));
  const tipoLente = isProgressiva ? "progressiva" : isMonofocal ? "monofocal" : "unknown";

  // Fornecedor
  let fornecedor: string | null = null;
  for (const [kw, sup] of SUPPLIER_KEYWORDS) {
    if (upper.includes(kw)) {
      fornecedor = sup;
      break;
    }
  }

  // Material index
  let materialIndex: string | null = null;
  for (const [erpIdx, hoyaValues] of Object.entries(MATERIAL_MAP)) {
    if (upper.includes(erpIdx)) {
      materialIndex = hoyaValues[0]; // primary match value
      break;
    }
  }
  // Also check for TRIVEX keyword directly
  if (!materialIndex && (upper.includes("TRIVEX") || upper.includes("TVX"))) {
    materialIndex = "TVX";
  }

  // Normalize ERP shorthand: "HOYA D+" → "HOYALUX D+" for matching
  let normalizedUpper = upper;
  // "HOYA D+" without "LUX" means "HOYALUX D+"
  if (/\bHOYA\s+D\+/.test(normalizedUpper) && !normalizedUpper.includes("HOYALUX")) {
    normalizedUpper = normalizedUpper.replace(/\bHOYA\s+D\+/, "HOYALUX D+");
  }

  // Desenho (match known names case-insensitively)
  let desenho: string | null = null;
  for (const d of desenhosList) {
    if (normalizedUpper.includes(d.toUpperCase())) {
      desenho = d;
      break;
    }
  }

  // Fotossensível (Sensity)
  const hasSensity = upper.includes("SENSITY");
  let fotossensivelTipo: string | null = null;
  let fotossensivelCor: string | null = null;
  if (hasSensity) {
    if (upper.includes("SENSITY 2") || upper.includes("SENSITY2")) {
      fotossensivelTipo = "2";
    } else if (upper.includes("SENSITY ORIGINAL")) {
      fotossensivelTipo = "Original";
    } else {
      fotossensivelTipo = "Original"; // default
    }
    // Cor
    const sensityIdx = upper.indexOf("SENSITY");
    const afterSensity = upper.substring(sensityIdx);
    if (afterSensity.includes(" CZ") || afterSensity.includes(" CINZA")) {
      fotossensivelCor = "CZ";
    } else if (afterSensity.includes(" MR") || afterSensity.includes(" MARROM")) {
      fotossensivelCor = "MR";
    } else if (afterSensity.includes(" VD") || afterSensity.includes(" VERDE")) {
      fotossensivelCor = "VD";
    }
  }

  // Treatment
  let tratamento: string | null = null;
  let isBlue = false;
  let isINC = false;

  // Check combined suffixes first
  if (upper.includes("LONGBLUE") || (upper.includes("LONG") && upper.includes("BLUE"))) {
    tratamento = "HV LL Bluecontrol";
    isBlue = true;
  } else if (tokens.some(t => t === "INC" || t.endsWith("INC"))) {
    tratamento = "HV HARD Anti-Risco";
    isINC = true;
  } else if ((upper.includes("NORISK") || upper.includes("NO RISK")) && (upper.includes("BLUE") || upper.includes("BLUECONTROL"))) {
    // NORISK BLUE = NoRisk com Bluecontrol
    tratamento = "NoRisk";
    isBlue = true;
  } else if (upper.includes("NORISK") || upper.includes("NO RISK")) {
    tratamento = "NoRisk";
  } else if (upper.includes("CLEANEXTRA") || upper.includes("CLEAN EXTRA")) {
    tratamento = "CleanExtra";
  } else if (upper.includes("BLUECONTROL") || upper.includes("BLUE CONTROL") || tokens.some(t => t === "BLUE")) {
    tratamento = "HV LL Bluecontrol";
    isBlue = true;
  } else if (tokens.some(t => t === "LONG")) {
    tratamento = "HV LongLife";
  }

  return {
    tipoLente,
    desenho,
    materialIndex,
    tratamento,
    isFotossensivel: hasSensity,
    fotossensivelTipo,
    fotossensivelCor,
    isBlue,
    isINC,
    fornecedor,
    rawDescription: desc,
  };
}

// ============================================
// MATCHING ENGINE
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
  const esf = Math.max(
    Math.abs(prescricao.esfericoOd ?? 0),
    Math.abs(prescricao.esfericoOe ?? 0)
  );
  const cil = Math.min(
    prescricao.cilindricoOd ?? 0,
    prescricao.cilindricoOe ?? 0
  ); // cilindrico is usually negative
  const adic = Math.max(
    prescricao.adicaoOd ?? 0,
    prescricao.adicaoOe ?? 0
  );

  // Check spherical range
  const esfOd = prescricao.esfericoOd ?? 0;
  const esfOe = prescricao.esfericoOe ?? 0;
  if (esfOd < produto.esfericoMinimo || esfOd > produto.esfericoMaximo) return false;
  if (esfOe < produto.esfericoMinimo || esfOe > produto.esfericoMaximo) return false;

  // Check cylindrical range
  const cilOd = prescricao.cilindricoOd ?? 0;
  const cilOe = prescricao.cilindricoOe ?? 0;
  if (cilOd < produto.cilindricoMinimo || cilOd > produto.cilindricoMaximo) return false;
  if (cilOe < produto.cilindricoMinimo || cilOe > produto.cilindricoMaximo) return false;

  // Check addition range (for progressive)
  if (produto.adicaoMinima > 0 || produto.adicaoMaxima > 0) {
    const adicOd = prescricao.adicaoOd ?? 0;
    const adicOe = prescricao.adicaoOe ?? 0;
    if (adicOd > 0 && (adicOd < produto.adicaoMinima || adicOd > produto.adicaoMaxima)) return false;
    if (adicOe > 0 && (adicOe < produto.adicaoMinima || adicOe > produto.adicaoMaxima)) return false;
  }

  return true;
}

function calcScore(
  parsed: ParsedLensDescription,
  produto: HoyaProduto
): { score: number; details: string[] } {
  let score = 0;
  const details: string[] = [];

  // Drawing match (highest weight)
  if (parsed.desenho && produto.desenho.toUpperCase().includes(parsed.desenho.toUpperCase())) {
    score += 35;
    details.push(`Desenho "${produto.desenho}" ✓ (+35)`);
  }

  // Material match — check if product material matches any of the mapped values
  if (parsed.materialIndex) {
    const parsedEntry = Object.entries(MATERIAL_MAP).find(([, vals]) => vals.includes(parsed.materialIndex!));
    const acceptableValues = parsedEntry ? parsedEntry[1] : [parsed.materialIndex];
    
    if (acceptableValues.some(v => String(produto.material).toUpperCase() === v.toUpperCase())) {
      score += 25;
      details.push(`Material "${produto.material}" ✓ (+25)`);
    }
  }

  // Treatment match
  if (parsed.tratamento) {
    const tratLower = parsed.tratamento.toLowerCase();
    const prodTrat = (produto.tratamento ?? "").toLowerCase();
    if (prodTrat.includes(tratLower) ||
        tratLower.includes(prodTrat)) {
      score += 20;
      details.push(`Tratamento "${produto.tratamento}" ✓ (+20)`);
    } else {
      // Partial treatment matching
      for (const [, hoyaNames] of Object.entries(TREATMENT_MAP)) {
        if (hoyaNames.some(n => n.toLowerCase() === tratLower)) {
          if (hoyaNames.some(n => (produto.tratamento ?? "").toLowerCase().includes(n.toLowerCase()))) {
            score += 15;
            details.push(`Tratamento parcial "${produto.tratamento}" ~ (+15)`);
            break;
          }
        }
      }
    }
  }

  // Photochromic match
  if (parsed.isFotossensivel) {
    if (produto.codigoFotossensivel != null) {
      score += 10;
      details.push(`Fotossensível ✓ (+10)`);
      // Check tipo
      if (parsed.fotossensivelTipo && produto.fotossensivel) {
        const fotoStr = String(produto.fotossensivel).toLowerCase();
        if (fotoStr.includes(parsed.fotossensivelTipo.toLowerCase())) {
          score += 5;
          details.push(`Tipo Sensity "${parsed.fotossensivelTipo}" ✓ (+5)`);
        }
      }
    }
  } else {
    // Non-photochromic should match non-photochromic products
    if (produto.codigoFotossensivel == null) {
      score += 5;
      details.push(`Não-fotossensível ✓ (+5)`);
    }
  }

  // COR variant matching
  if (parsed.isBlue) {
    if (produto.nome.toUpperCase().includes("COR") ||
        (produto.tratamento ?? "").toLowerCase().includes("bluecontrol")) {
      score += 5;
      details.push(`Bluecontrol/COR ✓ (+5)`);
    }
  }

  // Tipo lente match
  if (parsed.tipoLente === "progressiva" && produto.tipoLente === "Visao Progressiva") {
    score += 5;
    details.push(`Tipo Progressiva ✓ (+5)`);
  } else if (parsed.tipoLente === "monofocal" && produto.tipoLente === "Visao Simples") {
    score += 5;
    details.push(`Tipo Monofocal ✓ (+5)`);
  }

  return { score, details };
}

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

  // Step 2: Filter by tipo lente
  if (parsed.tipoLente === "progressiva") {
    const progressivas = compativeis.filter(p => p.tipoLente === "Visao Progressiva");
    if (progressivas.length > 0) compativeis = progressivas;
  } else if (parsed.tipoLente === "monofocal") {
    const monofocais = compativeis.filter(p => p.tipoLente === "Visao Simples");
    if (monofocais.length > 0) compativeis = monofocais;
  }

  // Step 3: Score each product
  const scored = compativeis.map(p => {
    const { score, details } = calcScore(parsed, p);
    return { produto: p, score, details };
  }).sort((a, b) => b.score - a.score);

  // Step 4: Group by desenho + material (unique families)
  const groupMap = new Map<string, MatchGroup>();

  for (const { produto, score, details } of scored) {
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

    // Update max score for the group
    if (score > group.score) {
      group.score = score;
      group.scoreDetails = details;
    }

    // Add unique heights
    if (produto.altura != null && produto.codigoAltura != null) {
      if (!group.alturasDisponiveis.some(a => a.codigoAltura === produto.codigoAltura)) {
        group.alturasDisponiveis.push({
          altura: produto.altura,
          codigoAltura: produto.codigoAltura,
        });
      }
    }

    // Add unique treatments
    if (!group.tratamentosDisponiveis.some(t =>
      t.codigoTratamento === produto.codigoTratamento
    )) {
      group.tratamentosDisponiveis.push({
        tratamento: produto.tratamento,
        codigoTratamento: produto.codigoTratamento,
        temCor: false,
      });
    }

    // Add unique photochromic options
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
  const groups = Array.from(groupMap.values())
    .sort((a, b) => b.score - a.score);

  // Sort alturas within groups
  groups.forEach(g => {
    g.alturasDisponiveis.sort((a, b) => a.altura - b.altura);
    g.tratamentosDisponiveis.sort((a, b) => a.tratamento.localeCompare(b.tratamento));
  });

  const bestGroup = groups.length > 0 ? groups[0] : null;
  let bestProduct: HoyaProduto | null = null;
  if (bestGroup && scored.length > 0) {
    // Best product within the best group
    bestProduct = scored.find(s => {
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
    // COR matching: products with COR in name
    const hasCor = p.nome.toUpperCase().includes(" COR");
    if (isCor !== hasCor) return false;
    return true;
  }) ?? null;
}
