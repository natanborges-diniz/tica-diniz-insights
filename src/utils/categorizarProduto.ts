// src/utils/categorizarProduto.ts
// FONTE ÚNICA DE VERDADE para categorização de produtos por tipo ERP
//
// Categorias: ARMACOES | LENTES | ACESSORIOS | OUTROS
// Subcategorias: AR_RX | AR_SOLAR | LENTES | ACESSORIOS | OUTROS
// Baseado nos prefixos do ERP Firebird:
//   AR = Armações, LG = Lentes de Grau, GC = Grau de Contato,
//   LC = Lentes de Contato, AC = Acessórios, SOL = Solar, OC = Óculos Solar

export type CategoriaProduto = 'ARMACOES' | 'LENTES' | 'ACESSORIOS' | 'OUTROS';
export type SubcategoriaProduto = 'AR_RX' | 'AR_SOLAR' | 'LENTES' | 'LENTES_GRAU' | 'LENTES_CONTATO' | 'ACESSORIOS' | 'OUTROS';

/**
 * Categoriza um produto com base no campo "tipo" retornado pelo ERP.
 * Aceita também descrição como fallback (para /estoque/completo que pode não ter tipo).
 */
export function categorizarProduto(tipo: string | null | undefined): CategoriaProduto {
  const t = (tipo || '').toUpperCase().trim();
  if (!t) return 'OUTROS';

  // SOLAR: SOL, OC — ANTES de armações para não ser capturado pelo AR genérico
  if (
    t === 'SOL' || t === 'OC' ||
    t.startsWith('SOL ') || t.startsWith('SOL-') ||
    t.startsWith('OC ') || t.startsWith('OC-') ||
    t.includes('SOLAR') || t.includes('OCULOS SOL')
  ) {
    return 'ARMACOES'; // Categoria macro continua ARMACOES
  }

  // ARMAÇÕES: AR, ARM, ou contém ARMAC/ARMAÇÃO/ARMA
  if (
    t === 'AR' || t === 'ARM' ||
    t.startsWith('AR ') || t.startsWith('AR-') ||
    t.startsWith('ARM ') || t.startsWith('ARM-') ||
    t.includes('ARMAC') || t.includes('ARMAÇÃO') || t.includes('ARMA')
  ) {
    return 'ARMACOES';
  }

  // LENTES: LG, GC, LC
  if (
    t === 'LG' || t === 'GC' || t === 'LC' ||
    t.startsWith('LG ') || t.startsWith('LG-') ||
    t.startsWith('GC ') || t.startsWith('GC-') ||
    t.startsWith('LC ') || t.startsWith('LC-') ||
    t.includes('LENT') || t.includes('GRAU') || t.includes('CONTATO')
  ) {
    return 'LENTES';
  }

  // ACESSÓRIOS: AC
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
