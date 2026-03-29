// src/services/haytekMatchingService.ts
// Matching engine for Haytek products: DE/PARA lookup + attribute scoring

import { HaytekProduto } from "./haytekService";
import { supabase } from "@/integrations/supabase/client";

// ============================================
// TYPES
// ============================================

export interface HaytekMatchCandidate {
  produto: HaytekProduto;
  score: number;
  scoreDetails: string[];
  source: "depara" | "match";
}

export interface HaytekMatchResult {
  candidates: HaytekMatchCandidate[];
  bestMatch: HaytekMatchCandidate | null;
  source: "depara" | "match" | "none";
  erpDescription: string;
}

// ============================================
// CONSTANTS
// ============================================

const NOISE_WORDS = new Set([
  "LENTE", "LENTES", "PAR", "DE", "COM", "PARA", "EM", "DO", "DA", "DAS", "DOS",
  "E", "OU", "O", "A", "OS", "AS", "UM", "UMA", "NO", "NA", "AO", "POR",
  "CADA", "GRAU", "RECEITA", "RX", "COMPLETA", "COMPLETO", "PRONTA",
]);

const MATERIAL_ALIASES: Record<string, string[]> = {
  "1.50": ["150", "1.50", "CR39", "CR-39"],
  "1.56": ["156", "1.56"],
  "1.59": ["159", "1.59", "POLI", "POLICARBONATO", "PC"],
  "1.60": ["160", "1.60"],
  "1.67": ["167", "1.67"],
  "1.74": ["174", "1.74"],
};

const DESIGN_KEYWORDS = [
  "PROGRESSIVO", "PROGRESSIVA", "MULTIFOCAL",
  "OCUPACIONAL", "OFFICE",
  "VISAO SIMPLES", "MONOFOCAL", "SINGLE",
  "DMAX", "INFINITY", "PREMIUM", "SPORT",
  "FILTRO AZUL", "BLUE", "DIGITAL",
];

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

function findMaterialIndex(s: string): string | null {
  const upper = s.toUpperCase();
  for (const [idx, aliases] of Object.entries(MATERIAL_ALIASES)) {
    if (upper === idx) return idx;
    if (aliases.some(a => a.toUpperCase() === upper)) return idx;
  }
  return null;
}

// ============================================
// SCORING
// ============================================

function scoreProduto(erpTokens: string[], erpNormalized: string, erpMaterial: string | null, produto: HaytekProduto): { score: number; details: string[] } {
  let score = 0;
  const details: string[] = [];

  const prodFull = normalize(`${produto.nome_comercial || ""} ${produto.design || ""} ${produto.linha || ""} ${produto.material || ""}`);
  const prodTokens = new Set(extractTokens(prodFull));

  // 1. Token overlap (max 40)
  const meaningful = erpTokens.filter(t => !findMaterialIndex(t));
  let tokenMatches = 0;
  for (const token of meaningful) {
    if (prodTokens.has(token)) tokenMatches++;
    else if (prodFull.includes(token) && token.length >= 3) tokenMatches += 0.5;
  }
  if (meaningful.length > 0) {
    const ratio = tokenMatches / meaningful.length;
    const pts = Math.round(ratio * 40);
    score += pts;
    if (pts > 0) details.push(`Token overlap ${tokenMatches}/${meaningful.length} (+${pts})`);
  }

  // 2. Material match (max 25, penalty -15)
  if (erpMaterial) {
    const materialInProd = prodFull.includes(erpMaterial.replace(".", "")) || prodFull.includes(erpMaterial);
    if (materialInProd) {
      score += 25;
      details.push(`Material ${erpMaterial} ✓ (+25)`);
    } else {
      let prodHasMaterial = false;
      for (const [idx] of Object.entries(MATERIAL_ALIASES)) {
        if (idx !== erpMaterial && (prodFull.includes(idx) || prodFull.includes(idx.replace(".", "")))) {
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
  let designMatches = 0;
  for (const kw of DESIGN_KEYWORDS) {
    if (erpNormalized.includes(kw.toUpperCase()) && prodFull.includes(kw.toUpperCase())) {
      designMatches++;
    }
  }
  if (designMatches > 0) {
    const pts = Math.min(20, designMatches * 10);
    score += pts;
    details.push(`Design keywords ${designMatches} (+${pts})`);
  }

  // 4. Category match (max 10)
  const isProgDesc = erpNormalized.includes("PROGRESS") || erpNormalized.includes("MULTIFOCAL");
  const isProgProd = prodFull.includes("PROGRESS") || prodFull.includes("MULTIFOCAL");
  const isMonoDesc = erpNormalized.includes("MONOFOCAL") || erpNormalized.includes("VISAO SIMPLES");
  const isMonoProd = prodFull.includes("VISAO SIMPLES") || prodFull.includes("MONOFOCAL") || prodFull.includes("SINGLE");
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

async function lookupDepara(descricao: string, produtos: HaytekProduto[]): Promise<HaytekMatchCandidate | null> {
  const { data: depara } = await supabase
    .from("fornecedor_produto_depara")
    .select("*")
    .eq("fornecedor", "HAYTEK")
    .eq("descricao_local", descricao)
    .maybeSingle();

  if (!depara) return null;

  let match: HaytekProduto | undefined;

  if (depara.sku_fornecedor) {
    match = produtos.find(p => p.product_id === depara.sku_fornecedor);
  }

  if (!match && depara.nome_fornecedor) {
    const nomeLower = depara.nome_fornecedor.toLowerCase();
    match = produtos.find(p => p.nome_comercial?.toLowerCase() === nomeLower);
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

export async function saveHaytekDepara(descricaoLocal: string, produto: HaytekProduto): Promise<void> {
  const { error } = await supabase
    .from("fornecedor_produto_depara")
    .upsert(
      {
        fornecedor: "HAYTEK",
        descricao_local: descricaoLocal,
        sku_fornecedor: produto.product_id,
        nome_fornecedor: produto.nome_comercial,
      },
      { onConflict: "fornecedor,descricao_local" }
    );

  if (error) {
    console.warn("[haytekMatching] Error saving DE/PARA:", error.message);
  }
}

// ============================================
// MAIN MATCHING FUNCTION
// ============================================

export async function matchHaytekProducts(
  produtos: HaytekProduto[],
  erpDescription: string
): Promise<HaytekMatchResult> {
  if (!erpDescription?.trim() || produtos.length === 0) {
    return { candidates: [], bestMatch: null, source: "none", erpDescription: erpDescription || "" };
  }

  // 1. Try DE/PARA first
  const deparaMatch = await lookupDepara(erpDescription, produtos);
  if (deparaMatch) {
    return { candidates: [deparaMatch], bestMatch: deparaMatch, source: "depara", erpDescription };
  }

  // 2. Score all products
  const normalized = normalize(erpDescription);
  const tokens = extractTokens(normalized);
  let materialIndex: string | null = null;
  for (const token of tokens) {
    const found = findMaterialIndex(token);
    if (found) { materialIndex = found; break; }
  }
  if (!materialIndex) {
    const idxMatch = normalized.match(/\b1\.(50|56|59|60|67|74)\b/);
    if (idxMatch) materialIndex = `1.${idxMatch[1]}`;
  }

  const candidates: HaytekMatchCandidate[] = [];
  for (const produto of produtos) {
    const { score, details } = scoreProduto(tokens, normalized, materialIndex, produto);
    if (score >= 10) {
      candidates.push({ produto, score, scoreDetails: details, source: "match" });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const topCandidates = candidates.slice(0, 10);
  const bestMatch = topCandidates.length > 0 && topCandidates[0].score >= 20
    ? topCandidates[0]
    : null;

  return { candidates: topCandidates, bestMatch, source: bestMatch ? "match" : "none", erpDescription };
}

export function haytekScoreLabel(score: number): { text: string; color: string } {
  if (score >= 60) return { text: "Alta", color: "text-emerald-600 bg-emerald-500/15 border-emerald-300" };
  if (score >= 35) return { text: "Média", color: "text-amber-600 bg-amber-500/15 border-amber-300" };
  return { text: "Baixa", color: "text-red-600 bg-red-500/15 border-red-300" };
}
