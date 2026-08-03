// src/lib/metas/lojas.ts
// Regra 13/18 (DINIZ SUPER — CLAUDE.md do firebird-bridge): as empresas 13 e
// 18 são a MESMA loja no ERP. Toda leitura de realizado/histórico da loja 13
// deve somar também a 18 (e vice-versa). O bridge já aplica essa regra nas
// queries; este helper aplica no que é lido do cache Supabase.

const EQUIVALENTES: Record<number, number[]> = {
  13: [13, 18],
  18: [13, 18],
};

/** Códigos equivalentes da loja (inclui a própria). */
export function lojasEquivalentes(codEmpresa: number): number[] {
  return EQUIVALENTES[codEmpresa] ?? [codEmpresa];
}

/** Param de empresa para leituras (ex.: '13,18'). */
export function lojasEquivalentesParam(codEmpresa: number): string {
  return lojasEquivalentes(codEmpresa).join(',');
}

// ---------------------------------------------------------------------------
// Loja lógica (Natan, 2026-08-03): 13 (DINIZ SUPER, antiga) e 18 (DINIZ SUPER
// SHOPPING, atual) são a MESMA operação — houve só a criação de uma nova loja
// no sistema. Em TODA visão: somar a movimentação das duas e exibir sempre o
// nome atual (SUPER SHOPPING). O cod lógico é 18 (a ativa).
// ---------------------------------------------------------------------------

export const LOJA_1318_COD_LOGICO = 18;
export const LOJA_1318_NOME = 'DINIZ SUPER SHOPPING';

/** Normaliza o código para o lógico (13 → 18). */
export function codLojaLogico(codEmpresa: number): number {
  return codEmpresa === 13 ? LOJA_1318_COD_LOGICO : codEmpresa;
}

/** Nome de exibição da loja lógica. */
export function nomeLojaLogico(codEmpresa: number, nomeOriginal: string): string {
  return codEmpresa === 13 || codEmpresa === 18 ? LOJA_1318_NOME : nomeOriginal;
}

/**
 * Colapsa um catálogo de lojas nas unidades lógicas: 13 some, 18 vira
 * "DINIZ SUPER SHOPPING" com cods [13, 18]. Demais lojas ficam como estão.
 */
export function unificarCatalogoLojas<T extends { codEmpresa: number; nome: string }>(
  catalogo: T[]
): Array<T & { cods: number[] }> {
  const resultado: Array<T & { cods: number[] }> = [];
  let par1318: T | null = null;
  for (const item of catalogo) {
    if (item.codEmpresa === 13 || item.codEmpresa === 18) {
      if (!par1318 || item.codEmpresa === 18) par1318 = item; // prefere a 18
      continue;
    }
    resultado.push({ ...item, cods: [item.codEmpresa] });
  }
  if (par1318) {
    resultado.push({
      ...par1318,
      codEmpresa: LOJA_1318_COD_LOGICO,
      nome: LOJA_1318_NOME,
      cods: [13, 18],
    });
  }
  return resultado;
}
