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

// ─── Modo de agendamento do borderô ──────────────────────────

export type ModoDataBordero = "DATA_UNICA" | "VENCIMENTO";

export interface DataPagamentoArgs {
  /** Modo do borderô. Default DATA_UNICA (prática da casa). */
  modo?: ModoDataBordero | null;
  /** Data escolhida item a item — vence sobre o modo. */
  override?: string | null;
  /**
   * Vencimento do título. Deve vir do DDA quando houver: o registro na CIP é o
   * que vale para o fornecedor, não o vencimento importado do ERP.
   */
  vencimento?: string | null;
  /** `borderos.data_pagamento` — a data única planejada. */
  dataPagamentoBordero?: string | null;
  /** Hoje em BRT (yyyy-MM-dd). */
  hoje: string;
}

/**
 * Data de pagamento de UM item do borderô, cobrindo os três cenários:
 *
 *   1. tudo numa data única        → modo DATA_UNICA + data_pagamento
 *   2. cada um no seu vencimento   → modo VENCIMENTO
 *   3. alguns diferentes           → override no próprio lançamento
 *
 * Diferente de `dataAgendamento`, nunca devolve null: a API do BTG exige
 * `paymentDate` em todo item. Data no passado vira hoje — o banco recusa
 * `past-payment-date`, e um título vencido deve ser pago assim que possível.
 */
export function dataPagamentoItem(args: DataPagamentoArgs): string {
  const { override, vencimento, dataPagamentoBordero, hoje } = args;
  const modo: ModoDataBordero = args.modo === "VENCIMENTO" ? "VENCIMENTO" : "DATA_UNICA";

  let alvo: string | null;

  if (override) {
    alvo = override;
  } else if (modo === "VENCIMENTO") {
    // Cada título no seu vencimento; sem vencimento conhecido, cai na data do
    // borderô (e, na falta dela, em hoje).
    alvo = vencimento || dataPagamentoBordero || hoje;
  } else {
    // Data única: paga na data do borderô, exceto se o título vence antes —
    // aí antecipa para o vencimento, para não pagar juros.
    alvo = dataPagamentoBordero
      ? (vencimento && vencimento < dataPagamentoBordero ? vencimento : dataPagamentoBordero)
      : (vencimento || hoje);
  }

  // Vencido ou hoje → paga hoje.
  return alvo && alvo > hoje ? alvo : hoje;
}
