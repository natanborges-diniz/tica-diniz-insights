// src/services/zeissMatchingService.ts
// Matching engine for Zeiss products: DE/PARA lookup + text similarity scoring
// Zeiss catalog is flat: { cod, cat, nome, descr } — simpler than Hoya's hierarchical structure

import { ZeissProduto } from "./zeissService";
import { supabase } from "@/integrations/supabase/client";

// ============================================
// TYPES
// ============================================

export interface ZeissMatchCandidate {
  produto: ZeissProduto;
  score: number;
  scoreDetails: string[];
  source: "depara" | "match";
}

export interface ZeissMatchResult {
  candidates: ZeissMatchCandidate[];
  bestMatch: ZeissMatchCandidate | null;
  source: "depara" | "match" | "none";
  erpDescription: string;
}

// ============================================
// CONSTANTS
// ============================================

const NOISE_WORDS = new Set([
  "LENTE", "LENTES", "PAR", "DE", "COM", "PARA", "EM", "DO", "DA", "DAS", "DOS",
  "E", "OU", "O", "A", "OS", "AS", "UM", "UMA", "NO", "NA", "AO", "POR",
  "CADA", "GRAU", "RECEITA", "RX", "COMPLETA", "COMPLETO",
  "LG", "LP", "VS", "EST", "PREMIUM", "RES", "SURF", "PRONTA",
]);

/** Known Zeiss design keywords that might appear in ERP descriptions */
const ZEISS_DESIGN_KEYWORDS = [
  "SMARTLIFE", "SMART LIFE",
  "INDIVIDUAL", "INDIVIDUAL 2",
  "DRIVESAFE", "DRIVE SAFE",
  "OFFICELENS", "OFFICE LENS", "OFFICE",
  "ENERGIZEME", "ENERGIZE ME", "ENERGIZE",
  "PRECISION PURE", "PRECISION SUPERB", "PRECISION PLUS",
  "PROGRESSIVE", "PROGRESSIVA",
  "SINGLE VISION", "VISAO SIMPLES", "MONOFOCAL",
  "BIFOCAL",
  "DURAVISION", "DURA VISION",
  "BLUEGUARD", "BLUE GUARD",
  "BLUEPROTECT", "BLUE PROTECT",
  "PHOTOFUSION", "PHOTO FUSION",
  "TRANSITIONS",
  "CLARLET", "PERFALIT",
  "AS", "ASPH",
];

/** Material index keywords */
const MATERIAL_ALIASES: Record<string, string[]> = {
  "1.50": ["150", "1.50", "CR39", "CR-39"],
  "1.53": ["153", "1.53", "TRIVEX", "TVX"],
  "1.56": ["156", "1.56"],
  "1.59": ["159", "1.59", "POLI", "POLICARBONATO", "PC"],
  "1.60": ["160", "1.60"],
  "1.67": ["167", "1.67"],
  "1.74": ["174", "1.74"],
};

// ============================================
// UTILS
// ============================================

function normalize(s: string): string {
  return s
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9\s.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTokens(normalized: string): string[] {
  return normalized.split(/\s+/).filter(t => t.length > 0 && !NOISE_WORDS.has(t));
}

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

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function findMaterialIndex(s: string): string | null {
  const upper = s.toUpperCase();
  for (const [idx, aliases] of Object.entries(MATERIAL_ALIASES)) {
    if (upper === idx) return idx;
    if (aliases.some(a => a.toUpperCase() === upper)) return idx;
  }
  return null;
}

// ============================================
// PARSE ERP DESCRIPTION
// ============================================

interface ParsedErpDesc {
  tokens: string[];
  materialIndex: string | null;
  normalized: string;
  designKeywords: string[];
}

function parseErpDescription(desc: string): ParsedErpDesc {
  const normalized = normalize(desc);
  // Separate stuck-together tokens like "SMARTLIFE1.60" → "SMARTLIFE 1.60"
  const expanded = normalized
    .replace(/([A-Z])(\d+\.\d+)/g, "$1 $2")
    .replace(/(\d+\.\d+)([A-Z])/g, "$1 $2");
  const tokens = extractTokens(expanded);

  // Find material index
  let materialIndex: string | null = null;
  for (const token of tokens) {
    const found = findMaterialIndex(token);
    if (found) { materialIndex = found; break; }
  }
  if (!materialIndex) {
    const idxMatch = expanded.match(/\b1\.(50|53|56|59|60|67|74)\b/);
    if (idxMatch) materialIndex = `1.${idxMatch[1]}`;
  }

  // Find design keywords present in description
  const designKeywords: string[] = [];
  for (const kw of ZEISS_DESIGN_KEYWORDS) {
    if (expanded.includes(kw.toUpperCase())) {
      designKeywords.push(kw);
    }
  }

  return { tokens, materialIndex, normalized: expanded, designKeywords };
}

// ============================================
// SCORING
// ============================================

function scoreProduto(parsed: ParsedErpDesc, produto: ZeissProduto): { score: number; details: string[] } {
  let score = 0;
  const details: string[] = [];

  const prodNome = normalize(produto.nome || "");
  const prodDescr = normalize(produto.descr || "");
  const prodCat = normalize(produto.cat || "");
  const prodFull = `${prodNome} ${prodDescr} ${prodCat}`;

  // 1. Token overlap scoring (max 40)
  const prodTokens = new Set(extractTokens(prodFull));
  let tokenMatches = 0;
  const meaningfulTokens = parsed.tokens.filter(t => !findMaterialIndex(t));
  for (const token of meaningfulTokens) {
    if (prodTokens.has(token)) {
      tokenMatches++;
    } else {
      // Partial match: check if product contains the token as substring
      if (prodFull.includes(token) && token.length >= 3) {
        tokenMatches += 0.5;
      }
    }
  }
  if (meaningfulTokens.length > 0) {
    const ratio = tokenMatches / meaningfulTokens.length;
    const pts = Math.round(ratio * 40);
    score += pts;
    if (pts > 0) details.push(`Token overlap ${tokenMatches}/${meaningfulTokens.length} (+${pts})`);
  }

  // 2. Material index match (max 25, penalty -15 for mismatch)
  if (parsed.materialIndex) {
    const materialInProd = prodFull.includes(parsed.materialIndex.replace(".", "")) ||
      prodFull.includes(parsed.materialIndex);
    if (materialInProd) {
      score += 25;
      details.push(`Material ${parsed.materialIndex} ✓ (+25)`);
    } else {
      // Check if product has a DIFFERENT material
      let prodHasMaterial = false;
      for (const [idx] of Object.entries(MATERIAL_ALIASES)) {
        if (idx !== parsed.materialIndex && (prodFull.includes(idx) || prodFull.includes(idx.replace(".", "")))) {
          prodHasMaterial = true;
          break;
        }
      }
      if (prodHasMaterial) {
        score -= 15;
        details.push(`Material divergente (-15)`);
      }
    }
  }

  // 3. Design keyword match (max 20)
  if (parsed.designKeywords.length > 0) {
    let designMatches = 0;
    for (const kw of parsed.designKeywords) {
      if (prodFull.includes(kw.toUpperCase())) {
        designMatches++;
      }
    }
    if (designMatches > 0) {
      const pts = Math.min(20, designMatches * 10);
      score += pts;
      details.push(`Design keywords ${designMatches}/${parsed.designKeywords.length} (+${pts})`);
    }
  }

  // 4. Full string similarity bonus (max 15)
  const sim = similarity(
    parsed.tokens.join(""),
    extractTokens(prodNome).join("")
  );
  if (sim > 0.4) {
    const pts = Math.round(sim * 15);
    score += pts;
    if (pts >= 3) details.push(`Similaridade ${(sim * 100).toFixed(0)}% (+${pts})`);
  }

  // 5. Category match bonus (max 10)
  const isProgDesc = parsed.normalized.includes("PROGRESS") || parsed.normalized.includes("MULTIFOCAL");
  const isProgProd = prodCat.includes("PROGRESS") || prodNome.includes("PROGRESS");
  const isMonoDesc = parsed.normalized.includes("MONOFOCAL") || parsed.normalized.includes("VISAO SIMPLES");
  const isMonoProd = prodCat.includes("MONOFOCAL") || prodCat.includes("SINGLE") || prodCat.includes("SIMPLES");
  if ((isProgDesc && isProgProd) || (isMonoDesc && isMonoProd)) {
    score += 10;
    details.push(`Categoria compatível (+10)`);
  } else if ((isProgDesc && isMonoProd) || (isMonoDesc && isProgProd)) {
    score -= 10;
    details.push(`Categoria incompatível (-10)`);
  }

  return { score: Math.max(0, score), details };
}

// ============================================
// DE/PARA LOOKUP
// ============================================

async function lookupDepara(descricao: string, produtos: ZeissProduto[]): Promise<ZeissMatchCandidate | null> {
  const { data: depara } = await supabase
    .from("fornecedor_produto_depara")
    .select("*")
    .eq("fornecedor", "ZEISS")
    .eq("descricao_local", descricao)
    .maybeSingle();

  if (!depara) return null;

  let match: ZeissProduto | undefined;

  // Match by sku_fornecedor (cod)
  if (depara.sku_fornecedor) {
    match = produtos.find(p => p.cod === depara.sku_fornecedor);
  }

  // Fallback by nome
  if (!match && depara.nome_fornecedor) {
    const nomeLower = depara.nome_fornecedor.toLowerCase();
    match = produtos.find(p => p.nome?.toLowerCase() === nomeLower);
    if (!match) {
      match = produtos.find(p =>
        p.nome?.toLowerCase().includes(nomeLower) || nomeLower.includes(p.nome?.toLowerCase() || "")
      );
    }
  }

  if (!match) return null;

  return {
    produto: match,
    score: 100,
    scoreDetails: ["DE/PARA automático ✓ (+100)"],
    source: "depara",
  };
}

// ============================================
// SAVE DE/PARA
// ============================================

export async function saveZeissDepara(descricaoLocal: string, produto: ZeissProduto): Promise<void> {
  const { error } = await supabase
    .from("fornecedor_produto_depara")
    .upsert(
      {
        fornecedor: "ZEISS",
        descricao_local: descricaoLocal,
        sku_fornecedor: produto.cod,
        nome_fornecedor: produto.nome,
      },
      { onConflict: "fornecedor,descricao_local" }
    );

  if (error) {
    console.warn("[zeissMatching] Error saving DE/PARA:", error.message);
  }
}

// ============================================
// MAIN MATCHING FUNCTION
// ============================================

export async function matchZeissProducts(
  produtos: ZeissProduto[],
  erpDescription: string
): Promise<ZeissMatchResult> {
  if (!erpDescription?.trim() || produtos.length === 0) {
    return { candidates: [], bestMatch: null, source: "none", erpDescription: erpDescription || "" };
  }

  // 1. Try DE/PARA first
  const deparaMatch = await lookupDepara(erpDescription, produtos);
  if (deparaMatch) {
    return {
      candidates: [deparaMatch],
      bestMatch: deparaMatch,
      source: "depara",
      erpDescription,
    };
  }

  // 2. Score all products
  const parsed = parseErpDescription(erpDescription);
  const candidates: ZeissMatchCandidate[] = [];

  for (const produto of produtos) {
    const { score, details } = scoreProduto(parsed, produto);
    if (score >= 10) {
      candidates.push({ produto, score, scoreDetails: details, source: "match" });
    }
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  // Take top 10
  const topCandidates = candidates.slice(0, 10);
  const bestMatch = topCandidates.length > 0 && topCandidates[0].score >= 20
    ? topCandidates[0]
    : null;

  return {
    candidates: topCandidates,
    bestMatch,
    source: bestMatch ? "match" : "none",
    erpDescription,
  };
}

// ============================================
// SCORE LABEL HELPER
// ============================================

export function zeissScoreLabel(score: number): { text: string; color: string } {
  if (score >= 60) return { text: "Alta", color: "text-emerald-600 bg-emerald-500/15 border-emerald-300" };
  if (score >= 35) return { text: "Média", color: "text-amber-600 bg-amber-500/15 border-amber-300" };
  return { text: "Baixa", color: "text-red-600 bg-red-500/15 border-red-300" };
}
