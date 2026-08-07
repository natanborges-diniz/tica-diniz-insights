// Crediário Loja — regras puras (SPEC_CREDIARIO_LOJA.md).
// A loja só DISPARA a emissão: valores, número de parcelas e vencimentos saem
// daqui, derivados exclusivamente da liberação aprovada pelo financeiro.
// Testado em src/lib/financeiro/__tests__/crediario.test.ts.

export interface ParcelaBoleto {
  numero: number;      // 1..N
  valor: number;       // 2 casas
  vencimento: string;  // yyyy-MM-dd
}

export interface LiberacaoParcelas {
  valor_total: number;
  parcelas: number;
  valor_parcela: number;
  primeiro_vencimento: string; // yyyy-MM-dd
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Soma um nº de meses preservando o dia (clamp no fim do mês curto). */
export function somarMeses(data: string, meses: number): string {
  const [y, m, d] = data.split("-").map(Number);
  const alvo = new Date(Date.UTC(y, m - 1 + meses, 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimoDia));
  return alvo.toISOString().slice(0, 10);
}

/**
 * Gera o carnê exatamente como aprovado: N parcelas mensais a partir do
 * primeiro vencimento, no valor aprovado — a última ajusta os centavos para a
 * soma bater com o total (nunca mais que alguns centavos de diferença).
 *
 * Lança erro se a liberação for inconsistente (defesa contra dado corrompido:
 * a loja não digita nada, mas a liberação pode ter sido mal cadastrada).
 */
export function gerarParcelasBoleto(lib: LiberacaoParcelas): ParcelaBoleto[] {
  const { valor_total, parcelas, valor_parcela, primeiro_vencimento } = lib;

  if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > 36) {
    throw new Error(`Número de parcelas inválido: ${parcelas} (esperado 1–36)`);
  }
  if (!(valor_total > 0) || !(valor_parcela > 0)) {
    throw new Error("Valores da liberação precisam ser positivos");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(primeiro_vencimento)) {
    throw new Error(`Primeiro vencimento inválido: ${primeiro_vencimento}`);
  }
  // Coerência: parcelas × valor_parcela deve ficar a menos de 1 real do total
  // (folga para arredondamento de centavos aprovado pelo financeiro).
  const esperado = round2(parcelas * valor_parcela);
  if (Math.abs(esperado - valor_total) >= 1) {
    throw new Error(
      `Liberação inconsistente: ${parcelas}× ${valor_parcela.toFixed(2)} = ${esperado.toFixed(2)}, ` +
      `mas o total aprovado é ${valor_total.toFixed(2)}`,
    );
  }

  const lista: ParcelaBoleto[] = [];
  for (let i = 1; i <= parcelas; i++) {
    const ultima = i === parcelas;
    const valor = ultima
      ? round2(valor_total - round2(valor_parcela * (parcelas - 1)))
      : round2(valor_parcela);
    lista.push({ numero: i, valor, vencimento: somarMeses(primeiro_vencimento, i - 1) });
  }
  return lista;
}

/** CPF: só dígitos, exige 11. */
export function sanitizarCpf(cpf: unknown): string {
  const d = String(cpf ?? "").replace(/\D/g, "");
  if (d.length !== 11) throw new Error(`CPF inválido (${d.length} dígitos)`);
  return d;
}

/** Liberação disparável? (fonte única da trava de status/validade) */
export function podeDisparar(
  lib: { status: string; validade?: string | null },
  hoje: string,
): { ok: boolean; motivo?: string } {
  if (lib.status !== "LIBERADO") {
    return { ok: false, motivo: `Liberação em status ${lib.status} — só LIBERADO pode disparar boletos` };
  }
  if (lib.validade && String(lib.validade) < hoje) {
    return { ok: false, motivo: `Liberação expirou em ${lib.validade} — peça nova consulta ao financeiro` };
  }
  return { ok: true };
}
