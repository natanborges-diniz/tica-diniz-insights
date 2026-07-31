// Agendamento de pagamentos do borderô — regras puras (testadas em
// src/lib/financeiro/__tests__/agendamento.test.ts).
//
// Prática da casa: os pagamentos da semana são todos executados na SEGUNDA.
// O borderô carrega uma `data_pagamento` (default: próxima segunda) e cada
// item é agendado para ela — exceto quando o vencimento cai ANTES, caso em
// que agenda no vencimento para não pagar juros. Datas sempre "yyyy-MM-dd"
// comparadas como string (sem Date/fuso no meio).

/** Data local de São Paulo (UTC-3) em yyyy-MM-dd — toISOString puro vira
 * "amanhã" entre 21h e meia-noite BRT. */
export function hojeBrt(agora: Date = new Date()): string {
  return new Date(agora.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Próxima segunda-feira (a própria data, se já for segunda). */
export function proximaSegunda(hoje: string): string {
  const [y, m, d] = hoje.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const delta = (8 - dt.getUTCDay()) % 7; // seg=1 → 0; dom=0 → 1; ter=2 → 6...
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

/** "Borderô Semana dd/MM/yyyy", com sufixo " — N" a partir do segundo da mesma data. */
export function descricaoBordero(dataPagamento: string, jaExistentes: number): string {
  const [y, m, d] = dataPagamento.split("-");
  const base = `Borderô Semana ${d}/${m}/${y}`;
  return jaExistentes > 0 ? `${base} — ${jaExistentes + 1}` : base;
}

/**
 * Data de agendamento de um item (null = pagar imediatamente).
 * - Com data_pagamento no borderô: paga nela; vencimento antes dela → paga no
 *   vencimento (sem juros); data no passado/hoje → imediato.
 * - Sem data_pagamento (legado): vencimento futuro → agenda; senão imediato.
 */
export function dataAgendamento(
  vencimento: string | null,
  dataPagamento: string | null,
  hoje: string,
): string | null {
  const venc = vencimento || null;
  const alvo = dataPagamento
    ? (venc && venc < dataPagamento ? venc : dataPagamento)
    : venc;
  return alvo && alvo > hoje ? alvo : null;
}
