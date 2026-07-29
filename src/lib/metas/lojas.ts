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
