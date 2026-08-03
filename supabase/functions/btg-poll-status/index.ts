// supabase/functions/btg-poll-status/index.ts
// E2 — Polling de retorno BTG (SPEC_P1_CONCILIACAO_3VIAS.md §5.2/§5.3)
// Chamada pelo pg_cron (verify_jwt=false), sem interação humana:
//   action=executar          → borderôs ENVIADO, btg_pagamentos e btg_cobrancas em aberto
//                              ganham baixa/rejeição automática com data e valor reais
//   action=importar_extratos → importa extrato D-3..D de todas as empresas com conta ativa
// Idempotente: só transiciona estados a partir do que o BTG responde; rodar 2x não repete efeito.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { flattenStatements, normalizeMovement, assignDedupeKeys } from "../_shared/btgExtrato.ts";
import { reprocessarEventosPendentes } from "../_shared/btgEventos.ts";
import { ratearValorPago } from "../_shared/rateio.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// ─── Config/auth BTG (mesmo padrão de btg-extrato) ──────────
async function getBtgConfig() {
  const db = getServiceClient();
  const { data } = await db
    .from("fornecedor_configuracao")
    .select("ambiente")
    .eq("fornecedor", "btg")
    .eq("ativo", true)
    .single();
  const isSandbox = data?.ambiente !== "production";
  return {
    apiBase: isSandbox
      ? "https://api.sandbox.empresas.btgpactual.com"
      : "https://api.empresas.btgpactual.com",
    isSandbox,
  };
}

async function getBtgToken(codEmpresa: number): Promise<string | null> {
  const db = getServiceClient();
  const { data } = await db
    .from("btg_tokens")
    .select("access_token, expires_at")
    .eq("cod_empresa", codEmpresa)
    .single();
  if (!data || new Date(data.expires_at) < new Date()) return null;
  return data.access_token;
}

async function getCnpj(codEmpresa: number): Promise<string | null> {
  const db = getServiceClient();
  const { data: conta } = await db
    .from("btg_contas_bancarias")
    .select("cnpj, account_id")
    .eq("cod_empresa", codEmpresa)
    .eq("ativa", true)
    .single();
  if (conta?.cnpj) return conta.cnpj.replace(/\D/g, "");
  const { data: emp } = await db.from("empresa").select("cnpj").eq("cod_empresa", codEmpresa).single();
  return emp?.cnpj ? emp.cnpj.replace(/\D/g, "") : null;
}

// ─── Vocabulário de status BTG (tolerante — pendência #1 da spec) ──
// Máquina de estados oficial (reference/pagamentos-1):
//   CREATED · SCHEDULED · ADJOURNED · CONFIRMED · PROCESSED · REVERTED ·
//   FAILED · CANCELED  (+ VALIDATED / INVALIDATED / RETAINED nos webhooks)
// Notas que mudam o comportamento:
//   - CONFIRMED = houve débito na conta (pode ser estornado depois → REVERTED,
//     que o polling seguinte trata como falha). Conta como pago.
//   - ADJOURNED = retentativa automática do sistema, NÃO é falha → pendente.
//   - RETAINED = retido na camada de fraude, exige ação no app → pendente.
//   - VALIDATED fica fora de PAID_WORDS de propósito: "INVALIDATED" contém
//     "VALIDATED" e casaria por engano.
const FAILED_WORDS = [
  "REJECTED", "REFUSED", "FAILED", "CANCELLED", "CANCELED",
  "ERROR", "RETURNED", "REVERTED", "INVALIDATED",
];
const PAID_WORDS = [
  "PAID", "COMPLETED", "EXECUTED", "SETTLED", "PROCESSED",
  "LIQUIDATED", "DONE", "CONFIRMED",
];

type NormStatus = "PAGO" | "FALHA" | "PENDENTE";

function normStatus(raw: unknown): NormStatus {
  const u = String(raw ?? "").toUpperCase();
  if (FAILED_WORDS.some((w) => u.includes(w))) return "FALHA";
  if (PAID_WORDS.some((w) => u.includes(w))) return "PAGO";
  return "PENDENTE";
}

function extractDate(obj: Record<string, unknown>, fallback: string): string {
  for (const k of ["executedAt", "paymentDate", "settlementDate", "settledAt", "paidAt", "date", "updatedAt"]) {
    if (obj[k]) return String(obj[k]).slice(0, 10);
  }
  return fallback;
}

function extractAmount(obj: Record<string, unknown>): number | null {
  const raw = obj.amountPaid ?? obj.paidAmount ?? obj.amount ?? null;
  if (raw == null) return null;
  if (typeof raw === "object") return Number((raw as Record<string, unknown>).amount ?? 0) || null;
  return Number(raw) || null;
}

// ─── Baixa de lançamento com dados reais ─────────────────────
// deno-lint-ignore no-explicit-any
async function baixarLancamento(db: any, lanc: Record<string, unknown>, valorPago: number, dataPagamento: string, statusBtg: string) {
  const dados = (lanc.dados_extras || {}) as Record<string, unknown>;
  await db.from("lancamentos_financeiros").update({
    status: "BAIXADO",
    valor_pago: valorPago,
    data_pagamento: dataPagamento,
    data_baixa: dataPagamento,
    baixado_em: new Date().toISOString(),
    dados_extras: { ...dados, btg_payment_status: statusBtg, baixa_automatica: "btg-poll-status" },
  }).eq("id", lanc.id);

  // Pagamento unificado: os componentes são baixados junto, rateando o valor
  // efetivamente pago. Sem isso eles ficariam pendurados para sempre e o DRE
  // por rubrica não fecharia com o caixa.
  const { data: filhos } = await db
    .from("lancamentos_financeiros")
    .select("id, valor")
    .eq("lancamento_pai_id", lanc.id)
    .neq("status", "BAIXADO");

  if (filhos && filhos.length > 0) {
    const rateado = ratearValorPago(
      filhos.map((f: Record<string, unknown>) => ({ id: String(f.id), valor: Number(f.valor) })),
      valorPago,
    );
    for (const parte of rateado) {
      await db.from("lancamentos_financeiros").update({
        status: "BAIXADO",
        valor_pago: parte.valor,
        data_pagamento: dataPagamento,
        data_baixa: dataPagamento,
        baixado_em: new Date().toISOString(),
      }).eq("id", parte.id);
    }
  }
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

// ─── 1. Borderôs ENVIADO → consulta batch e baixa por pagamento ──
// deno-lint-ignore no-explicit-any
async function pollBorderos(db: any, apiBase: string, isSandbox: boolean) {
  const hoje = new Date().toISOString().slice(0, 10);
  const resultado = { verificados: 0, baixados: 0, rejeitados: 0, processados: 0, parciais: 0, erros: [] as string[] };

  const { data: borderos } = await db
    .from("borderos")
    .select("*")
    .eq("status", "ENVIADO")
    .not("btg_batch_id", "is", null)
    .limit(50);

  for (const bordero of (borderos || [])) {
    try {
      resultado.verificados++;

      const { data: lancs } = await db
        .from("lancamentos_financeiros")
        .select("*")
        .eq("bordero_id", bordero.id)
        .eq("status", "PROCESSANDO");

      if (!lancs || lancs.length === 0) {
        // Nada em trânsito: fecha o borderô conforme o que restou
        const { data: restantes } = await db
          .from("lancamentos_financeiros")
          .select("status")
          .eq("bordero_id", bordero.id);
        const temRejeitado = (restantes || []).some((l: { status: string }) => l.status !== "BAIXADO" && l.status !== "CANCELADO");
        await db.from("borderos").update({ status: temRejeitado ? "PROCESSADO_PARCIAL" : "PROCESSADO" }).eq("id", bordero.id);
        continue;
      }

      // Dois índices: por paymentId (quando já conhecemos) e por
      // tags.externalId (= id do lançamento). O externalId é a âncora
      // primária: o 201 da iniciação devolve batchId/contractGuid, nunca um
      // paymentId, então é por ele que o pagamento volta a ser reconhecido.
      const paymentsById = new Map<string, Record<string, unknown>>();
      const paymentsByExternalId = new Map<string, Record<string, unknown>>();
      let batchStatus: NormStatus = "PENDENTE";

      if (isSandbox) {
        for (const l of lancs) {
          const simulado = { status: "PROCESSED", amount: l.valor, executedAt: hoje };
          const pid = ((l.dados_extras || {}) as Record<string, unknown>).btg_payment_id;
          if (pid) paymentsById.set(String(pid), simulado);
          paymentsByExternalId.set(String(l.id), simulado);
        }
        batchStatus = "PAGO";
      } else {
        const token = await getBtgToken(bordero.cod_empresa);
        const cnpj = await getCnpj(bordero.cod_empresa);
        if (!token || !cnpj) {
          resultado.erros.push(`bordero ${bordero.id}: token/cnpj indisponível (empresa ${bordero.cod_empresa})`);
          continue;
        }
        // GET /{companyId}/banking/payments?batchId=... — a consulta de lote
        // por /batch-payments/{id} não consta na referência de banking; a
        // listagem de pagamentos filtra por batchId e devolve tags.externalId.
        // pageSize e pageNumber são obrigatórios.
        const qs = new URLSearchParams({
          pageSize: "200",
          pageNumber: "1",
          batchId: String(bordero.btg_batch_id),
        });
        const res = await fetch(`${apiBase}/${cnpj}/banking/payments?${qs}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        if (!res.ok) {
          resultado.erros.push(`bordero ${bordero.id}: BTG ${res.status}`);
          continue;
        }
        const data = await res.json();
        const list = (Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;

        for (const p of list) {
          const pid = p.paymentId || p.id || p.transactionId;
          if (pid) paymentsById.set(String(pid), p);
          const ext = ((p.tags || {}) as Record<string, unknown>)?.externalId;
          if (ext) paymentsByExternalId.set(String(ext), p);
        }

        // Sem status agregado de lote: o borderô só é terminal-pago quando
        // todos os itens retornados são terminais-pagos.
        batchStatus = list.length > 0 && list.every((p) => normStatus(p.status) === "PAGO")
          ? "PAGO"
          : "PENDENTE";
      }

      let rejeitadosBordero = 0;
      let pendentesBordero = 0;

      for (const lanc of lancs) {
        const extras = (lanc.dados_extras || {}) as Record<string, unknown>;
        const pid = extras.btg_payment_id;
        // externalId primeiro (é o que enviamos e sempre volta); paymentId como
        // fallback para lançamentos anteriores a 03/08/2026.
        const pay = paymentsByExternalId.get(String(lanc.id))
          ?? (pid ? paymentsById.get(String(pid)) : undefined);
        // Legado sem correlação: só baixa se o lote inteiro é terminal-pago
        const st = pay ? normStatus(pay.status) : batchStatus;

        // Primeira vez que vemos o paymentId real: guarda para recibo/estorno.
        if (pay && !pid && (pay.paymentId || pay.id)) {
          await db.from("lancamentos_financeiros").update({
            dados_extras: { ...extras, btg_payment_id: String(pay.paymentId ?? pay.id) },
          }).eq("id", lanc.id);
        }

        if (st === "PAGO") {
          const valorPago = (pay && extractAmount(pay)) || Number(lanc.valor);
          const dataPag = pay ? extractDate(pay, hoje) : hoje;
          await baixarLancamento(db, lanc, valorPago, dataPag, String(pay?.status ?? "BATCH_PAGO"));
          resultado.baixados++;
        } else if (st === "FALHA") {
          await rejeitarLancamento(db, lanc, String(pay?.status ?? "BATCH_FALHA"));
          resultado.rejeitados++;
          rejeitadosBordero++;
        } else {
          pendentesBordero++;
        }
      }

      if (pendentesBordero === 0) {
        const novoStatus = rejeitadosBordero > 0 ? "PROCESSADO_PARCIAL" : "PROCESSADO";
        await db.from("borderos").update({ status: novoStatus }).eq("id", bordero.id);
        if (novoStatus === "PROCESSADO") resultado.processados++;
        else resultado.parciais++;
      }
    } catch (e) {
      resultado.erros.push(`bordero ${bordero.id}: ${String(e)}`);
    }
  }

  return resultado;
}

// ─── 2. btg_pagamentos avulsos em trânsito ───────────────────
// deno-lint-ignore no-explicit-any
async function pollPagamentos(db: any, apiBase: string, isSandbox: boolean) {
  const hoje = new Date().toISOString().slice(0, 10);
  const resultado = { verificados: 0, pagos: 0, rejeitados: 0, erros: [] as string[] };

  const { data: pagamentos } = await db
    .from("btg_pagamentos")
    .select("*")
    .in("status", ["ENVIADO_BTG", "AGUARDANDO_APROVACAO_BTG"])
    .not("btg_payment_id", "is", null)
    .limit(100);

  for (const pag of (pagamentos || [])) {
    try {
      resultado.verificados++;

      let raw: Record<string, unknown>;
      if (isSandbox) {
        raw = { status: "PAID", amount: pag.valor, executedAt: hoje };
      } else {
        const token = await getBtgToken(pag.cod_empresa);
        const cnpj = await getCnpj(pag.cod_empresa);
        if (!token || !cnpj) {
          resultado.erros.push(`pagamento ${pag.id}: token/cnpj indisponível`);
          continue;
        }
        const res = await fetch(`${apiBase}/${cnpj}/banking/payments/${pag.btg_payment_id}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        if (!res.ok) {
          resultado.erros.push(`pagamento ${pag.id}: BTG ${res.status}`);
          continue;
        }
        const data = await res.json();
        raw = (data?.data ?? data) as Record<string, unknown>;
      }

      const st = normStatus(raw.status);
      if (st === "PAGO") {
        await db.from("btg_pagamentos").update({ status: "PAGO" }).eq("id", pag.id);
        const { data: lancs } = await db
          .from("lancamentos_financeiros")
          .select("*")
          .eq("btg_pagamento_id", pag.id)
          .not("status", "in", '("BAIXADO","CANCELADO")');
        for (const lanc of (lancs || [])) {
          await baixarLancamento(db, lanc, extractAmount(raw) || Number(lanc.valor), extractDate(raw, hoje), String(raw.status));
        }
        resultado.pagos++;
      } else if (st === "FALHA") {
        await db.from("btg_pagamentos").update({ status: "REJEITADO" }).eq("id", pag.id);
        resultado.rejeitados++;
      }
    } catch (e) {
      resultado.erros.push(`pagamento ${pag.id}: ${String(e)}`);
    }
  }

  return resultado;
}

// ─── 3. btg_cobrancas em aberto → baixa de recebimento ───────
// deno-lint-ignore no-explicit-any
async function pollCobrancas(db: any, apiBase: string, isSandbox: boolean) {
  const hoje = new Date().toISOString().slice(0, 10);
  const resultado = { verificadas: 0, pagas: 0, vencidas: 0, erros: [] as string[], sandbox_skip: isSandbox };

  // Em sandbox não há API de consulta real — o import mock de btg-cobrancas cobre testes.
  if (isSandbox) return resultado;

  const { data: cobrancas } = await db
    .from("btg_cobrancas")
    .select("*")
    .in("status", ["EMITIDO", "CREATED", "REGISTERED", "VENCIDO", "OVERDUE"])
    .not("btg_receivable_id", "is", null)
    .limit(100);

  for (const cob of (cobrancas || [])) {
    try {
      resultado.verificadas++;
      const token = await getBtgToken(cob.cod_empresa);
      const cnpj = await getCnpj(cob.cod_empresa);
      if (!token || !cnpj) {
        resultado.erros.push(`cobranca ${cob.id}: token/cnpj indisponível`);
        continue;
      }
      const res = await fetch(`${apiBase}/${cnpj}/banking/collections/${cob.btg_receivable_id}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (!res.ok) {
        resultado.erros.push(`cobranca ${cob.id}: BTG ${res.status}`);
        continue;
      }
      const data = await res.json();
      const raw = (data?.data ?? data) as Record<string, unknown>;
      const st = normStatus(raw.status);

      if (st === "PAGO") {
        const valorPago = extractAmount(raw) || Number(cob.valor);
        const dataPag = extractDate(raw, hoje);
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
          await baixarLancamento(db, lanc, valorPago, dataPag, String(raw.status));
        }
        resultado.pagas++;
      } else if (String(raw.status ?? "").toUpperCase().includes("OVERDUE") && cob.status !== "VENCIDO") {
        await db.from("btg_cobrancas").update({ status: "VENCIDO" }).eq("id", cob.id);
        resultado.vencidas++;
      }
    } catch (e) {
      resultado.erros.push(`cobranca ${cob.id}: ${String(e)}`);
    }
  }

  return resultado;
}

// ─── 4. Import diário de extrato (janela D-3..D, dedup por dedupe_key) ──
// deno-lint-ignore no-explicit-any
async function importarExtratos(db: any, apiBase: string, isSandbox: boolean) {
  const resultado = { empresas: 0, importados: 0, duplicados: 0, erros: [] as string[], sandbox_skip: isSandbox };
  if (isSandbox) return resultado; // sandbox: import manual via btg-extrato cobre testes

  const hoje = new Date();
  const dataFim = hoje.toISOString().slice(0, 10);
  const inicio = new Date(hoje);
  inicio.setUTCDate(inicio.getUTCDate() - 3);
  const dataInicio = inicio.toISOString().slice(0, 10);

  const { data: contas } = await db
    .from("btg_contas_bancarias")
    .select("cod_empresa, account_id")
    .eq("ativa", true)
    .not("account_id", "is", null);

  for (const conta of (contas || [])) {
    try {
      resultado.empresas++;
      const token = await getBtgToken(conta.cod_empresa);
      const cnpj = await getCnpj(conta.cod_empresa);
      if (!token || !cnpj) {
        resultado.erros.push(`empresa ${conta.cod_empresa}: token/cnpj indisponível`);
        continue;
      }
      const res = await fetch(
        `${apiBase}/${cnpj}/banking/accounts/${conta.account_id}/statements?startDate=${dataInicio}&endDate=${dataFim}`,
        { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
      );
      if (!res.ok) {
        resultado.erros.push(`empresa ${conta.cod_empresa}: BTG ${res.status}`);
        continue;
      }
      const data = await res.json();
      const rows = flattenStatements(data)
        .map((l) => normalizeMovement(l, conta.cod_empresa))
        .filter((r) => r.data_lancamento && r.valor > 0);
      if (rows.length === 0) continue;

      await assignDedupeKeys(rows as Array<Record<string, unknown>>);
      const { data: inserted, error } = await db
        .from("btg_extrato")
        .upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true })
        .select("id");
      if (error) {
        resultado.erros.push(`empresa ${conta.cod_empresa}: ${error.message}`);
        continue;
      }
      resultado.importados += inserted?.length ?? 0;
      resultado.duplicados += rows.length - (inserted?.length ?? 0);
    } catch (e) {
      resultado.erros.push(`empresa ${conta.cod_empresa}: ${String(e)}`);
    }
  }

  return resultado;
}

// ─── 5. Cobranças Pix (payment_links PIX_BTG) — rede de segurança ──
// Expiração é aplicada mesmo em sandbox; a consulta ao BTG só ocorre em produção
// (dentro do pix-charges/verificar). A confirmação em si (baixa + notificação ao
// Atrium) é centralizada no pix-charges.
// deno-lint-ignore no-explicit-any
async function pollPixCharges(db: any) {
  const resultado = { verificadas: 0, pagas: 0, expiradas: 0, erros: [] as string[] };

  const { data: links } = await db
    .from("payment_links")
    .select("id")
    .eq("adquirente", "PIX_BTG")
    .eq("status", "ATIVO")
    .limit(100);

  for (const link of (links || [])) {
    try {
      resultado.verificadas++;
      const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/pix-charges-v2`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "verificar", link_id: link.id }),
      });
      if (!res.ok) {
        resultado.erros.push(`pix ${link.id}: pix-charges ${res.status}`);
        continue;
      }
      const data = await res.json();
      if (data?.status === "PAGO") resultado.pagas++;
      else if (data?.status === "EXPIRADO") resultado.expiradas++;
    } catch (e) {
      resultado.erros.push(`pix ${link.id}: ${String(e)}`);
    }
  }

  return resultado;
}

// ─── MAIN ────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    let action = url.searchParams.get("action") || "";
    if (req.method === "POST") {
      const body = await req.json().catch(() => null);
      if (!action && body?.action) action = String(body.action);
    }
    if (!action) action = "executar";

    const db = getServiceClient();
    const { apiBase, isSandbox } = await getBtgConfig();

    if (action === "importar_extratos") {
      const extratos = await importarExtratos(db, apiBase, isSandbox);
      console.log("[btg-poll-status] importar_extratos:", JSON.stringify(extratos));
      return json({ success: true, extratos });
    }

    if (action === "executar") {
      const borderos = await pollBorderos(db, apiBase, isSandbox);
      const pagamentos = await pollPagamentos(db, apiBase, isSandbox);
      const cobrancas = await pollCobrancas(db, apiBase, isSandbox);
      const pix = await pollPixCharges(db);
      // E5 — cron de segurança: reprocessa eventos de webhook parados >10 min (spec §5.2)
      const eventos = await reprocessarEventosPendentes(db, 10);
      console.log("[btg-poll-status] executar:", JSON.stringify({ borderos, pagamentos, cobrancas, pix, eventos }));
      return json({ success: true, borderos, pagamentos, cobrancas, pix, eventos });
    }

    return json({ error: `Ação desconhecida: '${action}'. Use: executar, importar_extratos` }, 400);
  } catch (e) {
    console.error("[btg-poll-status] Unhandled error:", e);
    return json({ error: "Erro interno", details: String(e) }, 500);
  }
});
