// src/lib/vendas/formaPagamento.ts
// Regra ÚNICA de classificação de forma de pagamento para "venda válida".
// Fase 0 (F3/F4 do plano REVISAO_VENDAS_METAS.md):
//   - Todos os hooks de vendas (useVendasDashboard, useInteligenciaVendas,
//     useComparativoAnual) DEVEM usar estas funções — nunca comparar strings
//     de forma de pagamento inline.
//   - "Venda válida" = não é devolução e não é crédito (forma tipo 6).
//   - Créditos NUNCA somam em faturamento válido, meta ou comissão.
//
// Fórmula única do ticket médio (F4):
//   ticketMedio = totalVendidoSemCreditos / qtdTransacoesSemCreditos
// onde qtdTransacoesSemCreditos exclui transações de devolução E de crédito.

/** Normaliza o rótulo da forma de pagamento: upper + trim. */
export function normalizarForma(forma: string | null | undefined): string {
  return (forma ?? '').toUpperCase().trim();
}

/**
 * Forma de pagamento "Créditos" (tipo 6 no Firebird).
 * O bridge/cache pode devolver 'CREDITO' ou 'CREDITOS' — ambos contam.
 */
export function isCredito(forma: string | null | undefined): boolean {
  const f = normalizarForma(forma);
  return f === 'CREDITO' || f === 'CREDITOS';
}

/** Linha de devolução (valor negativo agregado como 'DEVOLUCAO'). */
export function isDevolucao(forma: string | null | undefined): boolean {
  return normalizarForma(forma) === 'DEVOLUCAO';
}

/** Venda válida = não é devolução nem crédito. */
export function isVendaValida(forma: string | null | undefined): boolean {
  return !isDevolucao(forma) && !isCredito(forma);
}

/**
 * Fórmula única do ticket médio (F4):
 * totalVendidoSemCreditos / qtdTransacoesSemCreditos.
 * Retorna 0 quando não há transações válidas.
 */
export function calcularTicketMedio(
  totalVendidoSemCreditos: number,
  qtdTransacoesSemCreditos: number
): number {
  return qtdTransacoesSemCreditos > 0
    ? totalVendidoSemCreditos / qtdTransacoesSemCreditos
    : 0;
}
