// E5 — Webhook de retorno automático BTG (SPEC_P1_CONCILIACAO_3VIAS.md §5.1/§5.4)
// verify_jwt=false (o BTG não manda JWT Supabase). Segurança em duas camadas:
//   1. Token estático na URL (?t=<BTG_WEBHOOK_TOKEN>) — defesa mínima obrigatória
//   2. HMAC-SHA256 do corpo bruto com BTG_WEBHOOK_SECRET, se configurado
//      (header e algoritmo exatos do BTG são pendência de descoberta — aceitamos
//       x-btg-signature | x-signature | x-hub-signature-256, hex ou base64)
//
// Fluxo: valida → INSERT idempotente em btg_webhook_events → 200 imediato →
// processamento best-effort; se falhar, o evento fica processed=false e o
// btg-poll-status reprocessa (cron de segurança, spec §5.2).
//
// Registro da URL no portal BTG é passo manual de setup:
//   https://<projeto>.supabase.co/functions/v1/btg-webhook?t=<token>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { processarEvento } from "../_shared/btgEventos.ts";

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

async function validarAssinatura(req: Request, rawBody: string): Promise<boolean> {
  const secret = Deno.env.get("BTG_WEBHOOK_SECRET");
  if (!secret) return true; // HMAC ainda não configurado — só o token protege

  const header =
    req.headers.get("x-btg-signature") ??
    req.headers.get("x-signature") ??
    req.headers.get("x-hub-signature-256");
  if (!header) return false;

  const recebida = header.replace(/^(sha256=|hmac-sha256=)/i, "").trim();
  const { hex, base64 } = await hmacSha256(secret, rawBody);
  return timingSafeEqual(recebida.toLowerCase(), hex) || timingSafeEqual(recebida, base64);
}

// ─── MAIN ────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // 1. Autenticidade — falhou: 401, não grava nada (spec §5.1)
    const url = new URL(req.url);
    const tokenEsperado = Deno.env.get("BTG_WEBHOOK_TOKEN");
    const secret = Deno.env.get("BTG_WEBHOOK_SECRET");
    if (!tokenEsperado && !secret) {
      console.error("[btg-webhook] BTG_WEBHOOK_TOKEN/SECRET não configurados — rejeitando (fail closed)");
      return json({ error: "Webhook não configurado" }, 401);
    }
    if (tokenEsperado) {
      const t = url.searchParams.get("t") ?? "";
      if (!timingSafeEqual(t, tokenEsperado)) return json({ error: "Unauthorized" }, 401);
    }

    const rawBody = await req.text();
    if (!(await validarAssinatura(req, rawBody))) {
      console.warn("[btg-webhook] Assinatura HMAC inválida");
      return json({ error: "Invalid signature" }, 401);
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const eventType = String(payload.eventType ?? payload.type ?? payload.event ?? "desconhecido");
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
        console.log(`[btg-webhook] evento ${eventId}: ${r.detail}`);
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
