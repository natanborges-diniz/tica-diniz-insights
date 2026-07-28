// E5 — Processamento de eventos BTG compartilhado entre btg-webhook (latência)
// e btg-poll-status (consistência). SPEC_P1_CONCILIACAO_3VIAS.md §5.3.
//
// A baixa via evento NÃO substitui a fase 1 do motor conciliar-extrato: quando a
// linha correspondente do extrato chegar, ela casa por referência forte com o
// pagamento já PAGO — os três lados fecham.

declare const Deno: { env: { get(key: string): string | undefined } };

// ─── Vocabulário de status BTG (tolerante — pendência #1 da spec §9) ──
const FAILED_WORDS = ["REJECTED", "REFUSED", "FAILED", "CANCELLED", "CANCELED", "ERROR", "RETURNED"];
const PAID_WORDS = ["PAID", "COMPLETED", "EXECUTED", "SETTLED", "PROCESSED", "LIQUIDATED", "DONE"];

export type NormStatus = "PAGO" | "FALHA" | "PENDENTE";

export function normStatus(raw: unknown): NormStatus {
  const u = String(raw ?? "").toUpperCase();
  if (FAILED_WORDS.some((w) => u.includes(w))) return "FALHA";
  if (PAID_WORDS.some((w) => u.includes(w))) return "PAGO";
  return "PENDENTE";
}

export function extractDate(obj: Record<string, unknown>, fallback: string): string {
  for (const k of ["executedAt", "paymentDate", "settlementDate", "settledAt", "paidAt", "date", "updatedAt"]) {
    if (obj[k]) return String(obj[k]).slice(0, 10);
  }
  return fallback;
}

export function extractAmount(obj: Record<string, unknown>): number | null {
  const raw = obj.amountPaid ?? obj.paidAmount ?? obj.amount ?? null;
  if (raw == null) return null;
  if (typeof raw === "object") return Number((raw as Record<string, unknown>).amount ?? 0) || null;
  return Number(raw) || null;
}

// ─── Classificação do evento ─────────────────────────────────
// O formato exato dos webhooks BTG é pendência de descoberta (spec §5.4) —
// classificamos por palavras-chave no event_type e por campos do payload.
export type TipoEvento = "PAGAMENTO" | "COBRANCA" | "DDA" | "DESCONHECIDO";

export function classificarEvento(eventType: string, payload: Record<string, unknown>): TipoEvento {
  // Normaliza separadores ("PIX_SENT" → "PIX SENT") para o \b funcionar;
  // \b evita falsos positivos por substring (ex.: "UPDATED" contém "TED").
  const t = eventType.toUpperCase().replace(/[_\-.]/g, " ");
  if (/PAYMENT|\bPIX\b|TRANSFER|\bTED\b|BATCH/.test(t)) return "PAGAMENTO";
  if (/COLLECTION|BOLETO|CHARGE|COBRANCA|INVOICE|RECEIVABLE/.test(t)) return "COBRANCA";
  if (/DDA/.test(t)) return "DDA";
  if (payload.paymentId || payload.batchId) return "PAGAMENTO";
  if (payload.collectionId || payload.boletoId) return "COBRANCA";
  return "DESCONHECIDO";
}

// ─── Efeitos ─────────────────────────────────────────────────
// deno-lint-ignore no-explicit-any
async function baixarLancamento(db: any, lanc: Record<string, unknown>, valorPago: number, dataPagamento: string, statusBtg: string, origem: string) {
  const dados = (lanc.dados_extras || {}) as Record<string, unknown>;
  await db.from("lancamentos_financeiros").update({
    status: "BAIXADO",
    valor_pago: valorPago,
    data_pagamento: dataPagamento,
    data_baixa: dataPagamento,
    baixado_em: new Date().toISOString(),
    dados_extras: { ...dados, btg_payment_status: statusBtg, baixa_automatica: origem },
  }).eq("id", lanc.id);
}

// deno-lint-ignore no-explicit-any
async function rejeitarLancamento(db: any, lanc: Record<string, unknown>, statusBtg: string) {
  const dados = (lanc.dados_extras || {}) as Record<string, unknown>;
  await db.from("lancamentos_financeiros").update({
    status: "AUTORIZADO",
    requer_validacao: true,
    observacao: `Pagamento rejeitado pelo BTG (status: ${statusBtg}) — revisar dados e reenviar`,
    dados_extras: { ...dados, btg_payment_status: statusBtg },
  }).eq("id", lanc.id);
}

// Se todos os lançamentos do borderô estão terminais, fecha o borderô.
// deno-lint-ignore no-explicit-any
async function fecharBorderoSeCompleto(db: any, borderoId: string) {
  const { data: pendentes } = await db
    .from("lancamentos_financeiros")
    .select("id")
    .eq("bordero_id", borderoId)
    .not("status", "in", '("BAIXADO","CANCELADO")')
    .limit(1);
  if (pendentes && pendentes.length > 0) return;

  const { data: rejeitados } = await db
    .from("lancamentos_financeiros")
    .select("id")
    .eq("bordero_id", borderoId)
    .eq("requer_validacao", true)
    .limit(1);
  await db.from("borderos")
    .update({ status: rejeitados && rejeitados.length > 0 ? "PROCESSADO_PARCIAL" : "PROCESSADO" })
    .eq("id", borderoId);
}

// ─── Processamento de um evento ──────────────────────────────
export interface ResultadoEvento {
  processed: boolean;
  detail: string;
}

// deno-lint-ignore no-explicit-any
export async function processarEvento(db: any, eventType: string, payload: Record<string, unknown>): Promise<ResultadoEvento> {
  const hoje = new Date().toISOString().slice(0, 10);
  const tipo = classificarEvento(eventType, payload);

  if (tipo === "PAGAMENTO") {
    const paymentId = String(payload.paymentId ?? payload.id ?? "");
    if (!paymentId) return { processed: true, detail: "evento de pagamento sem id — ignorado" };

    const st = normStatus(payload.status);
    if (st === "PENDENTE") return { processed: true, detail: `status intermediário (${payload.status}) — sem efeito` };

    // Lançamentos correlacionados pelo btg_payment_id salvo no envio do borderô (E2 §5.5)
    const { data: lancs } = await db
      .from("lancamentos_financeiros")
      .select("*")
      .eq("dados_extras->>btg_payment_id", paymentId)
      .not("status", "in", '("BAIXADO","CANCELADO")');

    // Registro em btg_pagamentos, quando existir
    const { data: pags } = await db
      .from("btg_pagamentos")
      .select("id, valor, status")
      .eq("btg_payment_id", paymentId);

    if ((!lancs || lancs.length === 0) && (!pags || pags.length === 0)) {
      return { processed: true, detail: `pagamento ${paymentId} sem correlato local — extrato fecha via motor` };
    }

    const borderos = new Set<string>();
    if (st === "PAGO") {
      for (const p of (pags || [])) {
        await db.from("btg_pagamentos").update({ status: "PAGO" }).eq("id", p.id);
      }
      for (const lanc of (lancs || [])) {
        await baixarLancamento(db, lanc, extractAmount(payload) || Number(lanc.valor), extractDate(payload, hoje), String(payload.status), "btg-webhook");
        if (lanc.bordero_id) borderos.add(String(lanc.bordero_id));
      }
    } else {
      for (const p of (pags || [])) {
        await db.from("btg_pagamentos").update({ status: "REJEITADO" }).eq("id", p.id);
      }
      for (const lanc of (lancs || [])) {
        await rejeitarLancamento(db, lanc, String(payload.status));
        if (lanc.bordero_id) borderos.add(String(lanc.bordero_id));
      }
    }
    for (const b of borderos) await fecharBorderoSeCompleto(db, b);
    return { processed: true, detail: `pagamento ${paymentId}: ${st} — ${(lancs || []).length} lançamento(s)` };
  }

  if (tipo === "COBRANCA") {
    const receivableId = String(payload.collectionId ?? payload.boletoId ?? payload.id ?? "");
    if (!receivableId) return { processed: true, detail: "evento de cobrança sem id — ignorado" };

    const st = normStatus(payload.status);
    if (st !== "PAGO") return { processed: true, detail: `cobrança ${receivableId}: status ${payload.status} — sem efeito` };

    const { data: cobs } = await db
      .from("btg_cobrancas")
      .select("*")
      .eq("btg_receivable_id", receivableId)
      .neq("status", "PAGO");
    if (!cobs || cobs.length === 0) {
      return { processed: true, detail: `cobrança ${receivableId} sem correlato local ou já paga` };
    }

    for (const cob of cobs) {
      const valorPago = extractAmount(payload) || Number(cob.valor);
      const dataPag = extractDate(payload, hoje);
      await db.from("btg_cobrancas").update({
        status: "PAGO",
        valor_pago: valorPago,
        data_pagamento: dataPag,
      }).eq("id", cob.id);

      const { data: lancs } = await db
        .from("lancamentos_financeiros")
        .select("*")
        .eq("btg_cobranca_id", cob.id)
        .not("status", "in", '("BAIXADO","CANCELADO")');
      for (const lanc of (lancs || [])) {
        await baixarLancamento(db, lanc, valorPago, dataPag, String(payload.status), "btg-webhook");
      }
    }
    return { processed: true, detail: `cobrança ${receivableId}: PAGO — ${cobs.length} registro(s)` };
  }

  if (tipo === "DDA") {
    // Mesmo fluxo do btg-dda importar (gera lançamento PREVISTO) — delega à function
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/btg-dda`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "importar", cod_empresa: payload.cod_empresa ?? undefined }),
    });
    if (!res.ok) throw new Error(`btg-dda importar falhou: ${res.status}`);
    return { processed: true, detail: "DDA delegado ao btg-dda importar" };
  }

  return { processed: true, detail: `evento '${eventType}' não tratado — mantido para auditoria` };
}

// ─── Reprocessamento (cron de segurança — spec §5.2) ─────────
// deno-lint-ignore no-explicit-any
export async function reprocessarEventosPendentes(db: any, minAgeMinutes = 10, limit = 50) {
  const corte = new Date(Date.now() - minAgeMinutes * 60000).toISOString();
  const resultado = { reprocessados: 0, falhas: 0, erros: [] as string[] };

  const { data: eventos } = await db
    .from("btg_webhook_events")
    .select("*")
    .eq("processed", false)
    .lt("created_at", corte)
    .lt("tentativas", 5)
    .order("created_at", { ascending: true })
    .limit(limit);

  for (const ev of (eventos || [])) {
    try {
      const r = await processarEvento(db, String(ev.event_type), (ev.payload || {}) as Record<string, unknown>);
      await db.from("btg_webhook_events").update({
        processed: r.processed,
        processed_at: r.processed ? new Date().toISOString() : null,
        erro: r.processed ? null : r.detail,
        tentativas: Number(ev.tentativas ?? 0) + 1,
      }).eq("id", ev.id);
      if (r.processed) resultado.reprocessados++;
    } catch (e) {
      resultado.falhas++;
      resultado.erros.push(`evento ${ev.id}: ${String(e)}`);
      await db.from("btg_webhook_events").update({
        erro: String(e),
        tentativas: Number(ev.tentativas ?? 0) + 1,
      }).eq("id", ev.id);
    }
  }

  return resultado;
}
