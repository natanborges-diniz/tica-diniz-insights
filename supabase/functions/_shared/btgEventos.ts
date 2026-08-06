// E5 — Processamento de eventos BTG compartilhado entre btg-webhook (latência)
// e btg-poll-status (consistência). SPEC_P1_CONCILIACAO_3VIAS.md §5.3.
//
// A baixa via evento NÃO substitui a fase 1 do motor conciliar-extrato: quando a
// linha correspondente do extrato chegar, ela casa por referência forte com o
// pagamento já PAGO — os três lados fecham.

import { ratearValorPago } from "./rateio.ts";
import { lerRecusaBtg } from "./btgRecusa.ts";

declare const Deno: { env: { get(key: string): string | undefined } };

// ─── Vocabulário de status BTG (tolerante — pendência #1 da spec §9) ──
// "INVALIDATED" é o que o BTG usa quando recusa item do lote (boleto com valor
// alterado, conta inválida). Faltava aqui, e o item recusado ficava eternamente
// PENDENTE — nem baixava, nem aparecia como recusa.
const FAILED_WORDS = [
  "REJECTED", "REFUSED", "FAILED", "CANCELLED", "CANCELED", "ERROR", "RETURNED",
  "INVALIDATED", "DENIED", "REPROVED", "REVERSED", "UNPAID", "NOT_AUTHORIZED",
];
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
  // Grupos reais do painel BTG: payments.*, transfers.*, automatic-pix.*,
  // bank-slips.*, collections.*, instant-collections.*, authorized-direct-debits.*
  const t = eventType.toUpperCase().replace(/[_\-.]/g, " ");
  if (/DDA|DIRECT DEBIT/.test(t)) return "DDA";
  if (/COLLECTION|BOLETO|BANK SLIP|CHARGE|COBRANCA|INVOICE|RECEIVABLE/.test(t)) return "COBRANCA";
  if (/PAYMENT|\bPIX\b|TRANSFER|\bTED\b|BATCH/.test(t)) return "PAGAMENTO";
  if (payload.paymentId || payload.batchId) return "PAGAMENTO";
  if (payload.collectionId || payload.boletoId) return "COBRANCA";
  return "DESCONHECIDO";
}

// ─── Identificadores do pagamento ────────────────────────────
/**
 * Tudo que serve para dizer "este pagamento é aquele movimento do extrato".
 *
 * Guardar isso na baixa é o que permite a conciliação casar por identidade em
 * vez de adivinhar por valor e data. Antes a baixa via webhook não gravava nada
 * disso — o banco dizia exatamente qual boleto tinha sido pago, a informação
 * era descartada, e a conciliação reconstruía o vínculo no chute.
 *
 * O id do lançamento entra na lista porque é o que enviamos como
 * `tags.externalId`: se o banco devolver, casa direto.
 */
export function referenciasDoPagamento(
  pay: Record<string, unknown> | null | undefined,
  lancamentoId?: string | null,
): string[] {
  const brutas = [
    lancamentoId,
    pay?.paymentId, pay?.id, pay?.endToEndId, pay?.e2eId,
    pay?.authenticationCode, pay?.transactionId, pay?.externalId,
    (pay?.tags as Record<string, unknown> | undefined)?.externalId,
  ];
  const vistos = new Set<string>();
  for (const v of brutas) {
    const s = String(v ?? "").trim().toUpperCase();
    if (s.length >= 8 && s.length <= 120) vistos.add(s);
  }
  return [...vistos];
}

/**
 * Por que o banco recusou.
 *
 * Guardávamos só o status cru ("REJECTED", "FAILED"), que não diz nada ao
 * operador: horário-limite? saldo? conta inválida? Sem isso ele tinha de abrir o
 * app do BTG para descobrir, e quem não abre repete o mesmo erro no reenvio.
 *
 * O nome do campo varia conforme o endpoint, então varremos os candidatos em vez
 * de fixar um — o que vier, serve.
 */
export function motivoRecusa(pay: Record<string, unknown> | null | undefined): string | null {
  return lerRecusaBtg(pay)?.motivo ?? null;
}


// ─── Efeitos ─────────────────────────────────────────────────
/**
 * Baixa de lançamento por retorno do BTG — único caminho, webhook ou polling.
 *
 * Havia duas cópias desta função: a do polling gravava paymentId e código de
 * autenticação e rateava o pagamento unificado entre os componentes; a do
 * webhook não fazia nem uma coisa nem outra. Como o webhook chega primeiro, o
 * caminho pior é que costumava vencer — baixa sem identificador e componentes
 * pendurados. Agora é uma só.
 */
// deno-lint-ignore no-explicit-any
export async function baixarLancamentoBtg(
  db: any,
  lanc: Record<string, unknown>,
  args: {
    valorPago: number;
    dataPagamento: string;
    statusBtg: string;
    origem: string;
    pay?: Record<string, unknown> | null;
    /** Rateia a baixa entre os componentes do pagamento unificado. */
    ratear?: (filhos: Array<{ id: string; valor: number }>, total: number) => Array<{ id: string; valor: number }>;
  },
) {
  const dados = (lanc.dados_extras || {}) as Record<string, unknown>;
  const pay = args.pay ?? null;
  const paymentId = pay?.paymentId ?? pay?.id ?? dados.btg_payment_id ?? null;

  await db.from("lancamentos_financeiros").update({
    status: "BAIXADO",
    valor_pago: args.valorPago,
    data_pagamento: args.dataPagamento,
    data_baixa: args.dataPagamento,
    baixado_em: new Date().toISOString(),
    dados_extras: {
      ...dados,
      btg_payment_id: paymentId ? String(paymentId) : null,
      // Prova do pagamento do lado do banco — string curta, vale guardar.
      btg_authentication_code: pay?.authenticationCode ?? dados.btg_authentication_code ?? null,
      btg_end_to_end_id: pay?.endToEndId ?? pay?.e2eId ?? dados.btg_end_to_end_id ?? null,
      // Âncora da conciliação por identidade (conciliacaoMotor F0).
      btg_referencias: referenciasDoPagamento(pay, String(lanc.id)),
      btg_payment_status: args.statusBtg,
      baixa_automatica: args.origem,
    },
  }).eq("id", lanc.id);

  // Pagamento unificado: os componentes são baixados junto, rateando o valor
  // efetivamente pago. Sem isso eles ficariam pendurados para sempre e o DRE
  // por rubrica não fecharia com o caixa.
  if (!args.ratear) return;
  const { data: filhos } = await db
    .from("lancamentos_financeiros")
    .select("id, valor")
    .eq("lancamento_pai_id", lanc.id)
    .neq("status", "BAIXADO");
  if (!filhos || filhos.length === 0) return;

  const rateado = args.ratear(
    filhos.map((f: Record<string, unknown>) => ({ id: String(f.id), valor: Number(f.valor) })),
    args.valorPago,
  );
  for (const parte of rateado) {
    await db.from("lancamentos_financeiros").update({
      status: "BAIXADO",
      valor_pago: parte.valor,
      data_pagamento: args.dataPagamento,
      data_baixa: args.dataPagamento,
      baixado_em: new Date().toISOString(),
    }).eq("id", parte.id);
  }
}

// deno-lint-ignore no-explicit-any
export async function rejeitarLancamentoBtg(
  db: any,
  lanc: Record<string, unknown>,
  statusBtg: string,
  pay?: Record<string, unknown> | null,
) {
  const dados = (lanc.dados_extras || {}) as Record<string, unknown>;
  const recusa = lerRecusaBtg(pay);
  const motivo = recusa?.motivo ?? null;
  await db.from("lancamentos_financeiros").update({
    status: "AUTORIZADO",
    requer_validacao: true,
    observacao: motivo
      ? `Recusado pelo BTG: ${motivo}${recusa?.como_resolver ? ` — ${recusa.como_resolver}` : " — corrija e monte um novo borderô"}`
      : `Pagamento rejeitado pelo BTG (status: ${statusBtg}) — revisar dados e reenviar`,
    dados_extras: {
      ...dados,
      btg_payment_status: statusBtg,
      btg_motivo_recusa: motivo,
      btg_recusa_codigo: recusa?.codigo ?? null,
      btg_recusa_resolver: recusa?.como_resolver ?? null,
      // Payload cru da recusa: quando o código for novo, é daqui que sai a
      // tradução seguinte sem precisar reproduzir o erro.
      btg_recusa_bruta: (pay?.errors ?? null) as unknown,
    },
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
  /** Lojas que tiveram baixa/rejeição — o chamador usa para disparar a conciliação. */
  empresas?: number[];
}

// deno-lint-ignore no-explicit-any
export async function processarEvento(db: any, eventType: string, rawPayload: Record<string, unknown>): Promise<ResultadoEvento> {
  const hoje = new Date().toISOString().slice(0, 10);
  // Formato BTG: {webhookId, event, data:{...}} — os campos úteis vêm em `data`.
  // Achatamos data por cima do envelope; se `status` não vier, o nome do evento
  // resolve (ex.: "payments.failed" → FALHA via normStatus).
  const data = (rawPayload.data && typeof rawPayload.data === "object")
    ? (rawPayload.data as Record<string, unknown>)
    : {};
  const payload: Record<string, unknown> = { ...rawPayload, ...data };
  if (payload.status == null) payload.status = eventType;
  const tipo = classificarEvento(eventType, payload);

  if (tipo === "PAGAMENTO") {
    const paymentId = String(payload.paymentId ?? payload.id ?? "");
    if (!paymentId) return { processed: true, detail: "evento de pagamento sem id — ignorado" };

    const st = normStatus(payload.status);
    if (st === "PENDENTE") return { processed: true, detail: `status intermediário (${payload.status}) — sem efeito` };

    // Correlação do evento com o lançamento.
    //
    // Por btg_payment_id sozinho não bastava: o 201 da iniciação devolve
    // batchId/contractGuid, nunca um paymentId, então no momento em que o
    // webhook chega a maioria dos lançamentos ainda não tem esse campo — e o
    // evento morria como "sem correlato local". O externalId que enviamos em
    // `tags` é o id do lançamento e volta no retorno; é a âncora primária.
    const externalId = String(
      payload.externalId
        ?? (payload.tags as Record<string, unknown> | undefined)?.externalId
        ?? "",
    ).trim();

    const { data: porPaymentId } = await db
      .from("lancamentos_financeiros")
      .select("*")
      .eq("dados_extras->>btg_payment_id", paymentId)
      .not("status", "in", '("BAIXADO","CANCELADO")');

    let lancs = porPaymentId || [];
    if (lancs.length === 0 && /^[0-9a-f-]{36}$/i.test(externalId)) {
      const { data: porExternal } = await db
        .from("lancamentos_financeiros")
        .select("*")
        .eq("id", externalId)
        .not("status", "in", '("BAIXADO","CANCELADO")');
      lancs = porExternal || [];
    }

    // Registro em btg_pagamentos, quando existir
    const { data: pags } = await db
      .from("btg_pagamentos")
      .select("id, valor, status")
      .eq("btg_payment_id", paymentId);

    if ((!lancs || lancs.length === 0) && (!pags || pags.length === 0)) {
      return { processed: true, detail: `pagamento ${paymentId} sem correlato local — extrato fecha via motor` };
    }

    const borderos = new Set<string>();
    const empresas = new Set<number>();
    if (st === "PAGO") {
      for (const p of (pags || [])) {
        await db.from("btg_pagamentos").update({ status: "PAGO" }).eq("id", p.id);
      }
      for (const lanc of lancs) {
        await baixarLancamentoBtg(db, lanc, {
          valorPago: extractAmount(payload) || Number(lanc.valor),
          dataPagamento: extractDate(payload, hoje),
          statusBtg: String(payload.status),
          origem: "btg-webhook",
          pay: payload,
          ratear: ratearValorPago,
        });
        if (lanc.bordero_id) borderos.add(String(lanc.bordero_id));
        if (lanc.cod_empresa != null) empresas.add(Number(lanc.cod_empresa));
      }
    } else {
      for (const p of (pags || [])) {
        await db.from("btg_pagamentos").update({ status: "REJEITADO" }).eq("id", p.id);
      }
      for (const lanc of lancs) {
        await rejeitarLancamentoBtg(db, lanc, String(payload.status), payload);
        if (lanc.bordero_id) borderos.add(String(lanc.bordero_id));
      }
    }
    for (const b of borderos) await fecharBorderoSeCompleto(db, b);
    return {
      processed: true,
      detail: `pagamento ${paymentId}: ${st} — ${lancs.length} lançamento(s)`,
      empresas: [...empresas],
    };
  }

  if (tipo === "COBRANCA") {
    const receivableId = String(payload.collectionId ?? payload.instantCollectionId ?? payload.boletoId ?? payload.id ?? "");
    if (!receivableId) return { processed: true, detail: "evento de cobrança sem id — ignorado" };

    const st = normStatus(payload.status);

    // ── Pix dinâmico (instant-collections.*) criado pelo pix-charges? ──
    // Cobre eventos da família instant-collections e qualquer collection cujo id/txid
    // corresponda a um payment_link PIX_BTG. Delegamos a confirmação ao pix-charges,
    // que centraliza baixa do ledger + notificação ao Atrium/Connect & Flow.
    const pixRefs = [receivableId, payload.txid, payload.txId, payload.transactionId]
      .map((v) => String(v ?? "").trim())
      .filter((v) => v.length > 0);
    if (pixRefs.length > 0) {
      const orFilter = [...new Set(pixRefs)]
        .map((r) => `dados_extras->>txid.eq.${r},dados_extras->>btg_collection_id.eq.${r}`)
        .join(",");
      const { data: pixLink } = await db
        .from("payment_links")
        .select("id, status")
        .eq("adquirente", "PIX_BTG")
        .or(orFilter)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pixLink) {
        if (st !== "PAGO") {
          return { processed: true, detail: `pix ${pixLink.id}: status ${payload.status} — sem efeito` };
        }
        const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/pix-charges-v2`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "confirmar_pagamento",
            link_id: pixLink.id,
            btg_payload: payload,
          }),
        });
        if (!res.ok) throw new Error(`pix-charges confirmar_pagamento falhou: ${res.status}`);
        return { processed: true, detail: `pix ${pixLink.id}: PAGO — delegado ao pix-charges` };
      }
    }

    if (st !== "PAGO") return { processed: true, detail: `cobrança ${receivableId}: status ${payload.status} — sem efeito` };

    const empresasCobranca = new Set<number>();
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
        await baixarLancamentoBtg(db, lanc, {
          valorPago, dataPagamento: dataPag, statusBtg: String(payload.status),
          origem: "btg-webhook", pay: payload, ratear: ratearValorPago,
        });
        if (lanc.cod_empresa != null) empresasCobranca.add(Number(lanc.cod_empresa));
      }
    }
    return {
      processed: true,
      detail: `cobrança ${receivableId}: PAGO — ${cobs.length} registro(s)`,
      empresas: [...empresasCobranca],
    };
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
