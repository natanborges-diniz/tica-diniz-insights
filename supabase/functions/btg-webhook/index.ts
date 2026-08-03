// E5 — Webhook de retorno automático BTG (SPEC_P1_CONCILIACAO_3VIAS.md §5.1/§5.4)
// verify_jwt=false (o BTG não manda JWT Supabase).
//
// DESCOBERTA (doc BTG, resolve pendência §5.4): o BTG NÃO assina com HMAC —
// ele envia o "webhook secret" cadastrado no painel do aplicativo como
// `Authorization: Bearer <secret>`, e o payload tem formato
// {webhookId, event, data} com header x-correlation-id estável entre retries.
// Fonte: developers.empresas.btgpactual.com/docs/utilize-webhooks-para-receber-atualizações-sobre-produtos-conectados
//
// Autenticação aceita (qualquer uma vale):
//   1. `Authorization: Bearer <BTG_WEBHOOK_TOKEN>` — caminho oficial BTG
//   2. Token estático na URL (?t=<BTG_WEBHOOK_TOKEN>) — fallback
//   3. HMAC-SHA256 com BTG_WEBHOOK_SECRET — mantido caso o BTG adote assinatura
//
// Fluxo: valida → INSERT idempotente em btg_webhook_events → 200 imediato →
// processamento best-effort; se falhar, o evento fica processed=false e o
// btg-poll-status reprocessa (cron de segurança, spec §5.2).
//
// Registro da URL no portal BTG é passo manual de setup:
//   https://<projeto>.supabase.co/functions/v1/btg-webhook?t=<token>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { processarEvento } from "../_shared/btgEventos.ts";
import { conciliarAgora } from "../_shared/conciliacaoAuto.ts";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// ─── Assinatura HMAC ─────────────────────────────────────────
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256(secret: string, body: string): Promise<{ hex: string; base64: string }> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  const hex = Array.from(sig).map((b) => b.toString(16).padStart(2, "0")).join("");
  const base64 = btoa(String.fromCharCode(...sig));
  return { hex, base64 };
}

async function validarHmac(req: Request, rawBody: string): Promise<boolean> {
  const secret = Deno.env.get("BTG_WEBHOOK_SECRET");
  if (!secret) return false;

  const header =
    req.headers.get("x-btg-signature") ??
    req.headers.get("x-signature") ??
    req.headers.get("x-hub-signature-256");
  if (!header) return false;

  const recebida = header.replace(/^(sha256=|hmac-sha256=)/i, "").trim();
  const { hex, base64 } = await hmacSha256(secret, rawBody);
  return timingSafeEqual(recebida.toLowerCase(), hex) || timingSafeEqual(recebida, base64);
}

// O BTG preenche `Authorization: Bearer <webhook secret do painel>` — cadastre
// o mesmo valor de BTG_WEBHOOK_TOKEN no campo de secret do webhook no painel.
function validarToken(req: Request, url: URL): boolean {
  const tokenEsperado = Deno.env.get("BTG_WEBHOOK_TOKEN");
  if (!tokenEsperado) return false;

  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (bearer && timingSafeEqual(bearer, tokenEsperado)) return true;

  const t = url.searchParams.get("t") ?? "";
  return t.length > 0 && timingSafeEqual(t, tokenEsperado);
}

// ─── MAIN ────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // 1. Autenticidade — falhou: 401, não grava nada (spec §5.1)
    const url = new URL(req.url);
    if (!Deno.env.get("BTG_WEBHOOK_TOKEN") && !Deno.env.get("BTG_WEBHOOK_SECRET")) {
      console.error("[btg-webhook] BTG_WEBHOOK_TOKEN/SECRET não configurados — rejeitando (fail closed)");
      return json({ error: "Webhook não configurado" }, 401);
    }

    const rawBody = await req.text();
    if (!validarToken(req, url) && !(await validarHmac(req, rawBody))) {
      console.warn("[btg-webhook] Autenticação inválida (Bearer/token/HMAC)");
      return json({ error: "Unauthorized" }, 401);
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    // Formato BTG: {webhookId, event, data} — `event` é o tipo; dados ficam em `data`.
    const eventType = String(payload.event ?? payload.eventType ?? payload.type ?? "desconhecido");

    // Idempotência: payload->>'id' tem unique parcial. webhookId NÃO serve (é o id
    // da assinatura, igual em todo evento) — usamos transactionId/id do data ou o
    // x-correlation-id (estável entre retentativas do BTG).
    if (payload.id == null) {
      const data = (payload.data ?? {}) as Record<string, unknown>;
      const dedupId = data.transactionId ?? data.id ?? req.headers.get("x-correlation-id");
      if (dedupId) payload.id = String(dedupId);
    }

    const db = getServiceClient();

    // 2. INSERT idempotente (unique parcial em payload->>'id')
    const { data: inserted, error: insertError } = await db
      .from("btg_webhook_events")
      .insert({ event_type: eventType, payload, processed: false })
      .select("id")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        return json({ success: true, duplicate: true }); // duplicata → 200 e sai
      }
      console.error("[btg-webhook] Erro ao gravar evento:", insertError.message);
      return json({ error: "Erro ao gravar evento" }, 500);
    }

    // 3. 200 imediato + 4. processamento best-effort em background
    const eventId = inserted.id;
    const processamento = (async () => {
      try {
        const r = await processarEvento(db, eventType, payload);
        await db.from("btg_webhook_events").update({
          processed: r.processed,
          processed_at: r.processed ? new Date().toISOString() : null,
          erro: r.processed ? null : r.detail,
          tentativas: 1,
        }).eq("id", eventId);

        // O webhook é o gatilho natural da conciliação: é o instante em que o
        // banco confirma o pagamento. A baixa acabou de gravar paymentId e
        // endToEndId no lançamento, então o motor casa a linha do extrato por
        // identidade — sem depender de valor e data baterem.
        if (r.empresas?.length) {
          const c = await conciliarAgora(r.empresas);
          console.log(`[btg-webhook] evento ${eventId}: ${r.detail} · conciliados ${c.conciliados}`);
        } else {
          console.log(`[btg-webhook] evento ${eventId}: ${r.detail}`);
        }
      } catch (e) {
        // fica processed=false — btg-poll-status reprocessa em ≤ 30 min
        console.error(`[btg-webhook] processamento do evento ${eventId} falhou:`, e);
        await db.from("btg_webhook_events").update({ erro: String(e), tentativas: 1 }).eq("id", eventId);
      }
    })();

    // deno-lint-ignore no-explicit-any
    const runtime = (globalThis as any).EdgeRuntime;
    if (runtime?.waitUntil) runtime.waitUntil(processamento);
    else await processamento;

    return json({ success: true, event_id: eventId });
  } catch (e) {
    console.error("[btg-webhook] Unhandled error:", e);
    return json({ error: "Erro interno" }, 500);
  }
});
