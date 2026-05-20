// src/utils/categorizarProduto.ts
// FONTE ÚNICA DE VERDADE para categorização de produtos por tipo ERP
//
// Categorias (Bridge B.4.1+):
//   ARMACOES      — AR (RX) + SOL/OC (Solar). Gestão ativa.
//   LENTES_GRAU   — LG. Oculto da UI (informativo apenas, sem aba).
//   LENTES_CONTATO — GC + LC. Informativo.
//   PRODUTOS      — AC (era ACESSORIOS no ERP). Informativo.
//   OUTROS        — sem correspondência ou sem movimentação em 360d. Informativo.
//
// Prefixos ERP: AR=Armações, SOL/OC=Solar, LG=Lentes de Grau,
//               GC=Grau de Contato, LC=Lentes de Contato, AC=Acessórios
//
// Compatibilidade: Bridge pré-B.4.1 ainda pode enviar tipos legados
//   (LENTES, ACESSORIOS). Mapeados para os novos tipos abaixo.

export type CategoriaProduto = 'ARMACOES' | 'LENTES_GRAU' | 'LENTES_CONTATO' | 'PRODUTOS' | 'OUTROS';
export type SubcategoriaProduto = 'AR_RX' | 'AR_SOLAR' | 'LENTES' | 'LENTES_GRAU' | 'LENTES_CONTATO' | 'ACESSORIOS' | 'OUTROS';

/**
 * Categoriza um produto com base no campo "tipo" retornado pelo Bridge.
 * Suporta tipos novos (B.4.1) e legados (pré-B.4.1) e prefixos ERP brutos.
 */
export function categorizarProduto(tipo: string | null | undefined): CategoriaProduto {
  const t = (tipo || '').toUpperCase().trim();
  if (!t) return 'OUTROS';

  // Bridge B.4.1 — mapeamento direto de tipo explícito
  if (t === 'ARMACOES') return 'ARMACOES';
  if (t === 'LENTES_GRAU') return 'LENTES_GRAU';
  if (t === 'LENTES_CONTATO') return 'LENTES_CONTATO';
  if (t === 'PRODUTOS') return 'PRODUTOS';
  if (t === 'OUTROS') return 'OUTROS';

  // Solar (SOL, OC) — antes de AR para não cair no match genérico de ARMA
  if (
    t === 'SOL' || t === 'OC' ||
    t.startsWith('SOL ') || t.startsWith('SOL-') ||
    t.startsWith('OC ') || t.startsWith('OC-') ||
    t.includes('SOLAR') || t.includes('OCULOS SOL')
  ) return 'ARMACOES';

  // Armações RX (AR, ARM)
  if (
    t === 'AR' || t === 'ARM' ||
    t.startsWith('AR ') || t.startsWith('AR-') ||
    t.startsWith('ARM ') || t.startsWith('ARM-') ||
    t.includes('ARMAC') || t.includes('ARMAÇÃO') || t.includes('ARMA')
  ) return 'ARMACOES';

  // Lentes de Grau (LG) — oculto da UI
  if (
    t === 'LG' ||
    t.startsWith('LG ') || t.startsWith('LG-') ||
    t.includes('GRAU')
  ) return 'LENTES_GRAU';

  // Lentes de Contato / Grau de Contato (LC, GC)
  if (
    t === 'LC' || t === 'GC' ||
    t.startsWith('LC ') || t.startsWith('LC-') ||
    t.startsWith('GC ') || t.startsWith('GC-') ||
    t.includes('CONTATO')
  ) return 'LENTES_CONTATO';

  // Bridge pré-B.4.1 tipo genérico 'LENTES' → fallback LENTES_CONTATO
  if (t === 'LENTES' || t.includes('LENT')) return 'LENTES_CONTATO';

  // Acessórios (AC) → PRODUTOS (vocabulário B.4.1)
  if (
    t === 'AC' ||
    t.startsWith('AC ') || t.startsWith('AC-') ||
    t.includes('ACESS') || t.includes('ACC')
  ) return 'PRODUTOS';

  // Bridge pré-B.4.1 tipo genérico 'ACESSORIOS' → PRODUTOS
  if (t === 'ACESSORIOS') return 'PRODUTOS';

  return 'OUTROS';
}

/**
 * Subcategoriza um produto separando AR RX de AR Solar/OC.
 */
export function subcategorizarProduto(tipo: string | null | undefined): SubcategoriaProduto {
  const t = (tipo || '').toUpperCase().trim();
  if (!t) return 'OUTROS';

  // SOLAR: SOL, OC
  if (
    t === 'SOL' || t === 'OC' ||
    t.startsWith('SOL ') || t.startsWith('SOL-') ||
    t.startsWith('OC ') || t.startsWith('OC-') ||
    t.includes('SOLAR') || t.includes('OCULOS SOL')
  ) {
    return 'AR_SOLAR';
  }

  // ARMAÇÕES RX: AR, ARM
  if (
    t === 'AR' || t === 'ARM' ||
    t.startsWith('AR ') || t.startsWith('AR-') ||
    t.startsWith('ARM ') || t.startsWith('ARM-') ||
    t.includes('ARMAC') || t.includes('ARMAÇÃO') || t.includes('ARMA')
  ) {
    return 'AR_RX';
  }

  // LENTES
  if (
    t === 'LG' || t === 'GC' || t === 'LC' ||
    t.startsWith('LG ') || t.startsWith('LG-') ||
    t.startsWith('GC ') || t.startsWith('GC-') ||
    t.startsWith('LC ') || t.startsWith('LC-') ||
    t.includes('LENT') || t.includes('GRAU') || t.includes('CONTATO')
  ) {
    return 'LENTES';
  }

  // ACESSÓRIOS
  if (
    t === 'AC' ||
    t.startsWith('AC ') || t.startsWith('AC-') ||
    t.includes('ACESS') || t.includes('ACC')
  ) {
    return 'ACESSORIOS';
  }

  return 'OUTROS';
}

/**
 * Extrai a categoria a partir do prefixo da descrição do produto.
 * Usado como fallback quando o campo "tipo" não está disponível.
 */
export function categorizarPorDescricao(descricao: string | null | undefined): CategoriaProduto {
  if (!descricao) return 'OUTROS';

  const desc = descricao.trim().toUpperCase();
  const primeiroEspaco = desc.indexOf(' ');
  const prefixo = primeiroEspaco > 0 ? desc.substring(0, primeiroEspaco) : desc.substring(0, 3);

  // Reutiliza a mesma lógica do categorizarProduto
  return categorizarProduto(prefixo);
}

/**
 * Extrai a subcategoria a partir do prefixo da descrição do produto.
 */
export function subcategorizarPorDescricao(descricao: string | null | undefined): SubcategoriaProduto {
  if (!descricao) return 'OUTROS';

  const desc = descricao.trim().toUpperCase();
  const primeiroEspaco = desc.indexOf(' ');
  const prefixo = primeiroEspaco > 0 ? desc.substring(0, primeiroEspaco) : desc.substring(0, 3);

  return subcategorizarProduto(prefixo);
}
