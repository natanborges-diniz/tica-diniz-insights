// supabase/functions/_shared/btgExtrato.ts
// Helpers compartilhados de normalização/dedup do extrato BTG.
// Usados por btg-extrato (import manual) e btg-poll-status (import diário via cron).

// ─── Normalize BTG statement movements ──────────────────────
export function flattenStatements(data: unknown): Array<Record<string, unknown>> {
  if (!data || typeof data !== "object") return [];
  const d = data as Record<string, unknown>;

  // Direct array
  if (Array.isArray(d)) return d;

  // BTG v2: { data: { dailyMovements: [{ date, movements: [...] }] } }
  const inner = d.data as Record<string, unknown> | undefined;
  if (inner?.dailyMovements && Array.isArray(inner.dailyMovements)) {
    const items: Record<string, unknown>[] = [];
    for (const day of inner.dailyMovements as Array<Record<string, unknown>>) {
      const dayDate = day.date ? String(day.date).substring(0, 10) : null;
      if (Array.isArray(day.movements)) {
        for (const mov of day.movements as Array<Record<string, unknown>>) {
          items.push({ ...mov, _dayDate: dayDate });
        }
      }
    }
    return items;
  }

  // Fallback keys
  for (const key of ["entries", "transactions", "lancamentos", "items", "statement"]) {
    if (Array.isArray(d[key])) return d[key] as Record<string, unknown>[];
  }
  if (Array.isArray(d.data)) return d.data as Record<string, unknown>[];

  return [];
}

// ─── Normalize a single movement to our schema ─────────────
export function normalizeMovement(l: Record<string, unknown>, codEmpresa: number) {
  // BTG v2 fields: dateHour, description, amount, type ("credit"/"debit"), _dayDate (injected)
  const date = l._dayDate || l.dateHour || l.date || l.bookingDate || l.transactionDate || l.data || l.dataLancamento || null;
  const desc = l.description || l.remittanceInformation || l.descricao || l.detail || "";
  const rawAmount = l.amount || l.transactionAmount || l.valor || 0;
  const amount = typeof rawAmount === "object" && rawAmount !== null
    ? Number((rawAmount as Record<string, unknown>).amount || 0)
    : Number(rawAmount);
  const balanceAfter = l.balance_after || l.balanceAfterTransaction || l.saldo_apos || null;
  const rawType = l.type || l.creditDebitIndicator || l.tipo || "";
  const txnId = l.transactionId || l.entryId || l.transactionIdentification || l.id || null;

  const isCredit = String(rawType).toLowerCase() === "credit" ||
    String(rawType).toUpperCase().includes("CRED") ||
    String(rawType).toUpperCase().includes("CRDT") ||
    String(rawType).toUpperCase() === "C" ||
    (!rawType && amount > 0);

  return {
    cod_empresa: codEmpresa,
    data_lancamento: date ? String(date).substring(0, 10) : new Date().toISOString().substring(0, 10),
    descricao: String(desc),
    valor: Math.abs(amount),
    tipo: isCredit ? "CREDITO" : "DEBITO",
    saldo_apos: balanceAfter != null ? Number(balanceAfter) : null,
    conciliado: false,
    status_conciliacao: "PENDENTE",
    transaction_id: txnId != null ? String(txnId) : null,
    dados_extras: l,
  };
}

// ─── Dedup helpers ───────────────────────────────────────────
export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// dedupe_key = sha256(cod_empresa|YYYY-MM-DD|valor 2 casas|tipo|descricao|n), onde n é o
// índice de ocorrência da mesma combinação no dia. DEVE espelhar exatamente o backfill SQL
// da migration 20260703120000 (E1 — SPEC_P1_CONCILIACAO_3VIAS.md).
export async function assignDedupeKeys(rows: Array<Record<string, unknown>>): Promise<void> {
  const counters = new Map<string, number>();
  for (const row of rows) {
    const base = `${row.cod_empresa}|${row.data_lancamento}|${Number(row.valor).toFixed(2)}|${row.tipo}|${row.descricao ?? ""}`;
    const n = counters.get(base) ?? 0;
    counters.set(base, n + 1);
    row.dedupe_key = await sha256Hex(`${base}|${n}`);
  }
}
