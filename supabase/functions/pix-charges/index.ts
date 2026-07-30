// supabase/functions/pix-charges/index.ts
// Cobrança Pix dinâmica (BTG Empresas — instant collections) espelhando payment-links.
// Reusa a tabela payment_links com adquirente='PIX_BTG' (coluna qr_code_pix guarda o copia-e-cola).
//
// Actions:
//   criar               (JWT ou x-service-key)  — cria cob no BTG, devolve QR + copia-e-cola
//   listar / detalhe    (JWT ou x-service-key)
//   detalhe_publico     (público)               — página /pix/:id; faz verificação on-demand no BTG
//   cancelar            (JWT ou x-service-key)
//   confirmar_pagamento (interno)               — chamado por btg-webhook/btgEventos e poll
//   verificar           (interno)               — consulta status no BTG e aplica efeitos
//
// Confirmação notifica o Atrium/Connect & Flow (payment-webhook) com metodo:'pix',
// mesmo padrão de retry/auditoria do payment-links.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderSVG } from "https://esm.sh/uqr@0.1.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-service-key",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_SERVICE_SECRET = Deno.env.get("INTERNAL_SERVICE_SECRET") || "";

// Published app domain for generating payment URLs (mesmo do payment-links)
const APP_DOMAIN = "https://lens-data-vision.lovable.app";
// Atrium / Connect & Flow (mesmo endpoint notificado pelo payment-links)
const ATRIUM_WEBHOOK_URL = Deno.env.get("ATRIUM_WEBHOOK_URL") ||
  "https://kvggebtnqmxydtwaumqz.supabase.co/functions/v1/payment-webhook";

const NOTIFIABLE_ORIGENS = ["CHATBOT", "ATRIUM_INFOCO"];

/** Authenticate via JWT, X-Service-Key ou service-role bearer (chamadas internas) */
async function authenticate(req: Request): Promise<{ userId: string | null; isService: boolean }> {
  const serviceKey = req.headers.get("x-service-key");
  if (serviceKey && INTERNAL_SERVICE_SECRET && serviceKey === INTERNAL_SERVICE_SECRET) {
    return { userId: null, isService: true };
  }

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) throw new Error("Autenticação necessária (JWT ou X-Service-Key)");

  // Chamadas internas (btgEventos / btg-poll-status) usam o service role key como bearer
  if (token === SUPABASE_SERVICE_ROLE_KEY) return { userId: null, isService: true };

  const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || "", {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Token inválido");

  return { userId: user.id, isService: false };
}

// ─── BTG helpers (padrão btg-cobrancas) ──────────────────────
// deno-lint-ignore no-explicit-any
async function getBtgConfig(admin: any) {
  const { data } = await admin
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

// deno-lint-ignore no-explicit-any
async function getBtgToken(admin: any, codEmpresa: number): Promise<string> {
  const { data } = await admin.from("btg_tokens").select("access_token, expires_at").eq("cod_empresa", codEmpresa).single();
  if (!data) throw new Error(`Empresa ${codEmpresa} não autenticada no BTG.`);
  if (new Date(data.expires_at) < new Date()) throw new Error(`Token BTG expirado para empresa ${codEmpresa}.`);
  return data.access_token;
}

// deno-lint-ignore no-explicit-any
async function getContaBtg(admin: any, codEmpresa: number): Promise<{ cnpj: string; accountId: string; chavePix: string | null }> {
  const { data: conta } = await admin
    .from("btg_contas_bancarias")
    .select("cnpj, account_id, chave_pix")
    .eq("cod_empresa", codEmpresa)
    .eq("ativa", true)
    .single();
  let cnpj = conta?.cnpj ? String(conta.cnpj).replace(/\D/g, "") : "";
  if (!cnpj) {
    const { data: emp } = await admin.from("empresa").select("cnpj").eq("cod_empresa", codEmpresa).single();
    cnpj = emp?.cnpj ? String(emp.cnpj).replace(/\D/g, "") : "";
  }
  if (!cnpj) throw new Error(`CNPJ não encontrado para empresa ${codEmpresa}`);
  if (!conta?.account_id) throw new Error(`Account ID BTG não configurado para empresa ${codEmpresa}.`);
  return { cnpj, accountId: conta.account_id, chavePix: conta.chave_pix || null };
}

// ─── QR helpers ──────────────────────────────────────────────
function qrSvgDataUrl(emv: string): string {
  const svg = renderSVG(emv, { border: 1 });
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

// ─── Extração defensiva de campos BTG ────────────────────────
function pick(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj?.[k];
    if (v != null && String(v).trim() !== "") return String(v);
  }
  return null;
}

function extractEmv(d: Record<string, unknown>): string | null {
  const direct = pick(d, ["emv", "qrCode", "pixCopiaECola", "brcode", "brCode", "qrCodePayload", "payload", "copyPaste"]);
  if (direct && direct.startsWith("000201")) return direct;
  // Alguns retornos aninham em detail/qrCode
  const detail = (d.detail ?? d.qrCodeDetail ?? {}) as Record<string, unknown>;
  const nested = pick(detail, ["emv", "qrCode", "payload", "brcode"]);
  if (nested && nested.startsWith("000201")) return nested;
  return direct || nested;
}

function extractPagador(d: Record<string, unknown>): { nome: string | null; documento: string | null } {
  const payer = (d.payer ?? d.debtor ?? d.pagador ?? {}) as Record<string, unknown>;
  return {
    nome: pick(payer, ["name", "nome"]) || pick(d, ["payerName", "debtorName"]),
    documento: pick(payer, ["document", "taxId", "documento", "cpf", "cnpj"]) || pick(d, ["payerDocument", "payerTaxId"]),
  };
}

// ─── Notificação ao Atrium (padrão payment-links cf_notify) ──
// deno-lint-ignore no-explicit-any
async function notifyAtrium(admin: any, link: Record<string, unknown>, status: string, extra: Record<string, unknown>) {
  if (!NOTIFIABLE_ORIGENS.includes(String(link.origem))) return;

  const dados = (link.dados_extras || {}) as Record<string, unknown>;
  const webhookPayload = {
    payment_link_id: link.id,
    metodo: "pix",
    status,
    txid: dados.txid || null,
    valor: link.valor,
    nome_cliente: link.cliente_nome || null,
    descricao: link.descricao || null,
    origem_ref: link.origem_ref,
    origem: link.origem,
    ...extra,
  };

  const delays = [0, 2000, 5000];
  let webhookOk = false;
  let lastError = "";
  let lastStatus = 0;

  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt] > 0) await new Promise((r) => setTimeout(r, delays[attempt]));
    try {
      const resp = await fetch(ATRIUM_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-service-key": INTERNAL_SERVICE_SECRET },
        body: JSON.stringify(webhookPayload),
      });
      lastStatus = resp.status;
      if (resp.ok) {
        webhookOk = true;
        console.log(`[pix-charges] CF webhook OK (attempt ${attempt + 1}) link=${link.id} status=${status}`);
        break;
      } else {
        lastError = await resp.text().catch(() => "");
        console.warn(`[pix-charges] CF webhook attempt ${attempt + 1} failed: ${resp.status} ${lastError}`);
      }
    } catch (e) {
      lastError = (e as Error).message;
      console.warn(`[pix-charges] CF webhook attempt ${attempt + 1} error: ${lastError}`);
    }
  }

  try {
    await admin.from("payment_links").update({
      webhook_payload: {
        ...((link.webhook_payload as Record<string, unknown>) || {}),
        cf_notify: {
          ok: webhookOk,
          attempts: delays.length,
          last_status: lastStatus,
          last_error: webhookOk ? null : lastError,
          notified_at: new Date().toISOString(),
          status_notificado: status,
          url: ATRIUM_WEBHOOK_URL,
        },
      },
    }).eq("id", link.id);
  } catch (e) {
    console.warn("[pix-charges] Audit log update error:", (e as Error).message);
  }

  if (!webhookOk) {
    console.error(`[pix-charges] CF webhook FAILED after ${delays.length} attempts. link=${link.id} status=${status}`);
  }
}

// ─── Efeitos: confirmar / expirar (idempotentes) ─────────────
// deno-lint-ignore no-explicit-any
async function confirmarPagamento(admin: any, link: Record<string, unknown>, btgPayload: Record<string, unknown>) {
  if (link.status === "PAGO") return { already: true };

  const dados = (link.dados_extras || {}) as Record<string, unknown>;
  const e2e = pick(btgPayload, ["endToEndId", "e2eId", "endToEnd", "end_to_end_id"]);
  const pagador = extractPagador(btgPayload);
  const dateTime = pick(btgPayload, ["paidAt", "paymentDate", "settledAt", "executedAt", "date", "updatedAt"]) || new Date().toISOString();
  const txid = pick(btgPayload, ["txid", "txId", "transactionId"]) || (dados.txid as string) || null;

  await admin.from("payment_links").update({
    status: "PAGO",
    pago_em: new Date().toISOString(),
    tid: txid,
    dados_extras: {
      ...dados,
      txid,
      end_to_end_id: e2e,
      pagador_nome: pagador.nome,
      pagador_documento: pagador.documento,
      btg_payment_payload: btgPayload,
    },
  }).eq("id", link.id);

  await admin.from("lancamentos_financeiros").update({
    status: "BAIXADO",
    data_pagamento: new Date().toISOString().slice(0, 10),
    valor_pago: link.valor,
  })
    .eq("origem", "LINK_PAGAMENTO")
    .eq("origem_id", link.id);

  await notifyAtrium(admin, { ...link, dados_extras: { ...dados, txid } }, "PAGO", {
    end_to_end_id: e2e,
    pagador_nome: pagador.nome,
    pagador_documento: pagador.documento,
    dateTime,
  });

  return { already: false, txid, end_to_end_id: e2e };
}

// deno-lint-ignore no-explicit-any
async function marcarExpirado(admin: any, link: Record<string, unknown>) {
  if (link.status !== "ATIVO") return;
  await admin.from("payment_links").update({ status: "EXPIRADO" }).eq("id", link.id);
  await admin.from("lancamentos_financeiros")
    .update({ status: "CANCELADO" })
    .eq("origem", "LINK_PAGAMENTO")
    .eq("origem_id", link.id);
  await notifyAtrium(admin, link, "EXPIRADO", {});
}

// Consulta o status da cobrança no BTG e aplica efeitos. Retorna o status final local.
// deno-lint-ignore no-explicit-any
async function verificarNoBtg(admin: any, link: Record<string, unknown>): Promise<string> {
  if (link.status !== "ATIVO") return String(link.status);

  if (link.expira_em && new Date(String(link.expira_em)) < new Date()) {
    await marcarExpirado(admin, link);
    return "EXPIRADO";
  }

  const { apiBase, isSandbox } = await getBtgConfig(admin);
  if (isSandbox) return "ATIVO"; // sem API real de consulta em sandbox

  const dados = (link.dados_extras || {}) as Record<string, unknown>;
  const collectionId = (dados.btg_collection_id as string) || (dados.txid as string);
  if (!collectionId) return "ATIVO";

  try {
    const codEmpresa = Number(link.cod_empresa);
    const token = await getBtgToken(admin, codEmpresa);
    const { cnpj } = await getContaBtg(admin, codEmpresa);
    const res = await fetch(`${apiBase}/${cnpj}/banking/instant-collections/${collectionId}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) {
      console.warn(`[pix-charges] verificar BTG ${res.status} link=${link.id}`);
      return "ATIVO";
    }
    const body = await res.json();
    const raw = (body?.data ?? body) as Record<string, unknown>;
    const st = String(raw.status ?? "").toUpperCase();
    const PAID_WORDS = ["PAID", "COMPLETED", "EXECUTED", "SETTLED", "PROCESSED", "LIQUIDATED", "DONE"];
    const FAILED_WORDS = ["REJECTED", "REFUSED", "FAILED", "CANCELLED", "CANCELED", "ERROR", "EXPIRED"];
    if (PAID_WORDS.some((w) => st.includes(w))) {
      await confirmarPagamento(admin, link, raw);
      return "PAGO";
    }
    if (FAILED_WORDS.some((w) => st.includes(w))) {
      await marcarExpirado(admin, link);
      return "EXPIRADO";
    }
  } catch (e) {
    console.warn(`[pix-charges] verificar falhou link=${link.id}: ${(e as Error).message}`);
  }
  return "ATIVO";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, ...params } = body;

    if (!action) throw new Error("action é obrigatório");

    const publicActions = ["detalhe_publico"];
    let auth = { userId: null as string | null, isService: false };

    if (!publicActions.includes(action)) {
      auth = await authenticate(req);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let result: unknown;

    switch (action) {
      case "criar": {
        const { cod_empresa, valor, descricao, cliente_nome, cliente_documento, cliente_telefone, expiracao_segundos, origem, origem_ref } = params;
        if (!cod_empresa || !valor || !descricao) throw new Error("cod_empresa, valor e descricao são obrigatórios");

        const codEmpresaNum = Number(cod_empresa);
        const valorNum = Number(String(valor).replace(",", "."));
        if (!Number.isFinite(valorNum) || valorNum <= 0) throw new Error("valor inválido");

        const expiracaoSeg = Number(expiracao_segundos) > 0 ? Number(expiracao_segundos) : 24 * 60 * 60;
        const expiresAt = new Date(Date.now() + expiracaoSeg * 1000).toISOString();
        const linkOrigem = origem || (auth.isService ? "CHATBOT" : "MANUAL");

        const { apiBase, isSandbox } = await getBtgConfig(admin);

        // ── Cria a cobrança no BTG (instant collection / Pix dinâmico) ──
        let btgCollectionId = "";
        let txid = "";
        let emv = "";
        let btgRaw: Record<string, unknown> = {};

        if (isSandbox) {
          btgCollectionId = `sandbox-pix-${Date.now()}`;
          txid = btgCollectionId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 35);
          emv = `00020126580014br.gov.bcb.pix0136sandbox-${crypto.randomUUID()}5204000053039865406${valorNum.toFixed(2)}5802BR5913OTICAS DINIZ6009SAO PAULO62070503***6304ABCD`;
        } else {
          const token = await getBtgToken(admin, codEmpresaNum);
          const { cnpj, accountId, chavePix } = await getContaBtg(admin, codEmpresaNum);

          const btgPayload: Record<string, unknown> = {
            amount: Number(valorNum.toFixed(2)),
            account: { accountId },
            description: String(descricao).slice(0, 140),
            expiration: expiracaoSeg,
          };
          if (chavePix) btgPayload.key = chavePix;
          if (cliente_nome) {
            const doc = String(cliente_documento || "").replace(/\D/g, "");
            btgPayload.payer = {
              name: String(cliente_nome),
              ...(doc ? { document: doc, personType: doc.length > 11 ? "J" : "F" } : {}),
            };
          }

          console.log("[pix-charges] BTG payload:", JSON.stringify(btgPayload).slice(0, 500));

          const btgRes = await fetch(`${apiBase}/${cnpj}/banking/instant-collections`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(btgPayload),
          });
          const btgText = await btgRes.text();
          try { btgRaw = JSON.parse(btgText); } catch { /* non-JSON */ }
          const d = (btgRaw?.data ?? btgRaw) as Record<string, unknown>;

          if (!btgRes.ok) {
            console.error("[pix-charges] BTG API error:", btgRes.status, btgText.slice(0, 500));
            throw new Error(`BTG rejeitou a cobrança Pix (${btgRes.status}): ${btgText.slice(0, 200)}`);
          }

          btgCollectionId = pick(d, ["instantCollectionId", "collectionId", "id"]) || "";
          txid = pick(d, ["txid", "txId", "transactionId"]) || btgCollectionId;
          emv = extractEmv(d) || "";

          if (!emv) {
            console.error("[pix-charges] BTG sem EMV no retorno:", btgText.slice(0, 500));
            throw new Error("BTG não retornou o código Pix (EMV). Verifique o contrato da API instant-collections.");
          }
        }

        // ── Persiste em payment_links (adquirente PIX_BTG) ──
        const { data: inserted, error: insertError } = await admin
          .from("payment_links")
          .insert({
            cod_empresa: codEmpresaNum,
            adquirente: "PIX_BTG",
            valor: valorNum,
            descricao,
            parcelas_max: 1,
            expira_em: expiresAt,
            status: "ATIVO",
            qr_code_pix: emv,
            cliente_nome: cliente_nome || null,
            cliente_documento: cliente_documento || null,
            cliente_telefone: cliente_telefone || null,
            origem: linkOrigem,
            origem_ref: origem_ref || null,
            dados_extras: {
              metodo: "pix",
              txid,
              btg_collection_id: btgCollectionId,
              btg_create_response: btgRaw,
              sandbox: isSandbox,
            },
          })
          .select()
          .single();

        if (insertError) throw new Error("Erro ao salvar cobrança Pix: " + insertError.message);

        const payUrl = `${APP_DOMAIN}/pix/${inserted.id}`;
        await admin.from("payment_links").update({ url_pagamento: payUrl }).eq("id", inserted.id);

        // Ledger (mesmo padrão do link cartão)
        try {
          await admin.from("lancamentos_financeiros").insert({
            cod_empresa: codEmpresaNum,
            tipo: "RECEBER",
            descricao: `Pix (QR Code): ${descricao}`,
            valor: valorNum,
            data_vencimento: expiresAt.slice(0, 10),
            status: "PREVISTO",
            origem: "LINK_PAGAMENTO",
            origem_id: inserted.id,
            pessoa_nome: cliente_nome || null,
            pessoa_documento: cliente_documento || null,
            forma_pagamento: "PIX",
            adquirente: "PIX_BTG",
          });
        } catch (e) {
          console.warn("[pix-charges] Ledger insert warning:", (e as Error).message);
        }

        result = {
          id: inserted.id,
          txid,
          pix_copia_cola: emv,
          qr_code_base64: qrSvgDataUrl(emv),
          url_pagamento: payUrl,
          status: "ATIVO",
          expira_em: expiresAt,
          valor: valorNum,
          descricao,
          sandbox: isSandbox,
        };
        break;
      }

      case "listar": {
        const { cod_empresa, status: filterStatus, limit = 100, offset = 0 } = params;
        if (!cod_empresa) throw new Error("cod_empresa é obrigatório");

        let query = admin
          .from("payment_links")
          .select("*")
          .eq("cod_empresa", cod_empresa)
          .eq("adquirente", "PIX_BTG")
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);

        if (filterStatus && filterStatus !== "todos") {
          query = query.eq("status", filterStatus);
        }

        const { data, error } = await query;
        if (error) throw new Error(error.message);
        result = data;
        break;
      }

      case "detalhe": {
        const { link_id } = params;
        if (!link_id) throw new Error("link_id é obrigatório");

        const { data, error } = await admin
          .from("payment_links")
          .select("*")
          .eq("id", link_id)
          .single();

        if (error) throw new Error(error.message);
        result = data;
        break;
      }

      case "detalhe_publico": {
        // Público: campos seguros + verificação on-demand no BTG (dá confirmação
        // quase em tempo real enquanto a página /pix/:id faz polling).
        const { link_id } = params;
        if (!link_id) throw new Error("link_id é obrigatório");

        const { data, error } = await admin
          .from("payment_links")
          .select("id, cod_empresa, valor, descricao, status, expira_em, pago_em, cliente_nome, adquirente, qr_code_pix, origem, origem_ref, dados_extras, webhook_payload")
          .eq("id", link_id)
          .eq("adquirente", "PIX_BTG")
          .single();

        if (error || !data) throw new Error("Cobrança Pix não encontrada");

        const statusAtual = await verificarNoBtg(admin, data);

        result = {
          id: data.id,
          valor: data.valor,
          descricao: data.descricao,
          status: statusAtual,
          expira_em: data.expira_em,
          pago_em: statusAtual === "PAGO" ? (data.pago_em || new Date().toISOString()) : null,
          cliente_nome: data.cliente_nome,
          pix_copia_cola: data.qr_code_pix,
          qr_code_base64: data.qr_code_pix ? qrSvgDataUrl(String(data.qr_code_pix)) : null,
        };
        break;
      }

      case "cancelar": {
        const { link_id } = params;
        if (!link_id) throw new Error("link_id é obrigatório");

        const { data: link, error: fetchErr } = await admin
          .from("payment_links")
          .select("*")
          .eq("id", link_id)
          .eq("adquirente", "PIX_BTG")
          .single();

        if (fetchErr || !link) throw new Error("Cobrança Pix não encontrada");
        if (link.status !== "ATIVO" && link.status !== "PENDENTE") {
          throw new Error(`Não é possível cancelar cobrança com status ${link.status}`);
        }

        await admin.from("payment_links").update({ status: "CANCELADO" }).eq("id", link_id);
        await admin.from("lancamentos_financeiros")
          .update({ status: "CANCELADO" })
          .eq("origem", "LINK_PAGAMENTO")
          .eq("origem_id", link_id);

        await notifyAtrium(admin, link, "CANCELADO", {});

        result = { success: true, status: "CANCELADO" };
        break;
      }

      case "confirmar_pagamento": {
        // Interno: btg-webhook (via btgEventos) ou poll delegam a confirmação aqui.
        if (!auth.isService) throw new Error("Ação interna");
        const { link_id, txid: txidIn, collection_id, btg_payload } = params;

        let link: Record<string, unknown> | null = null;
        if (link_id) {
          const { data } = await admin.from("payment_links").select("*").eq("id", link_id).eq("adquirente", "PIX_BTG").maybeSingle();
          link = data;
        }
        if (!link && (txidIn || collection_id)) {
          const ref = String(txidIn || collection_id);
          const { data } = await admin
            .from("payment_links")
            .select("*")
            .eq("adquirente", "PIX_BTG")
            .or(`dados_extras->>txid.eq.${ref},dados_extras->>btg_collection_id.eq.${ref}`)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          link = data;
        }
        if (!link) {
          result = { processed: false, reason: "pix_charge_not_found" };
          break;
        }

        const r = await confirmarPagamento(admin, link, (btg_payload || {}) as Record<string, unknown>);
        result = { processed: true, ...r };
        break;
      }

      case "verificar": {
        // Interno: usado pelo btg-poll-status como rede de segurança.
        if (!auth.isService) throw new Error("Ação interna");
        const { link_id } = params;
        if (!link_id) throw new Error("link_id é obrigatório");

        const { data: link } = await admin.from("payment_links").select("*").eq("id", link_id).eq("adquirente", "PIX_BTG").maybeSingle();
        if (!link) {
          result = { processed: false, reason: "pix_charge_not_found" };
          break;
        }
        const statusFinal = await verificarNoBtg(admin, link);
        result = { processed: true, status: statusFinal };
        break;
      }

      default:
        throw new Error(`Action '${action}' não suportada`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[pix-charges] Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
