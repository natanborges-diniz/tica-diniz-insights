import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-service-key",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_SERVICE_SECRET = Deno.env.get("INTERNAL_SERVICE_SECRET") || "";

/** Authenticate via JWT or X-Service-Key */
async function authenticate(req: Request): Promise<{ userId: string | null; isService: boolean }> {
  // Check service key first (for Connect & Flow)
  const serviceKey = req.headers.get("x-service-key");
  if (serviceKey && INTERNAL_SERVICE_SECRET && serviceKey === INTERNAL_SERVICE_SECRET) {
    return { userId: null, isService: true };
  }

  // Fall back to JWT
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) throw new Error("Autenticação necessária (JWT ou X-Service-Key)");

  const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || "", {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Token inválido");

  return { userId: user.id, isService: false };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authenticate(req);
    const body = await req.json();
    const { action, ...params } = body;

    if (!action) throw new Error("action é obrigatório");

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let result: unknown;

    switch (action) {
      case "criar": {
        const { cod_empresa, valor, descricao, parcelas_max, cliente_nome, cliente_documento, cliente_telefone, origem, origem_ref } = params;
        if (!cod_empresa || !valor || !descricao) throw new Error("cod_empresa, valor e descricao são obrigatórios");

        const linkOrigem = origem || (auth.isService ? "CHATBOT" : "MANUAL");
        const reference = `PL-${cod_empresa}-${Date.now()}`;

        // Call rede-proxy to create transaction
        let redeResult: Record<string, unknown> | null = null;
        try {
          const redeRes = await fetch(`${SUPABASE_URL}/functions/v1/rede-proxy`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
              action: "criar_transacao",
              cod_empresa,
              amount: valor,
              reference,
              installments: parcelas_max || 1,
              kind: "credit",
              capture: true,
            }),
          });
          const redeData = await redeRes.json();
          if (redeData.error) {
            console.warn("[payment-links] Rede error (will save link without TID):", redeData.error);
          } else {
            redeResult = redeData as Record<string, unknown>;
          }
        } catch (e) {
          console.warn("[payment-links] Rede proxy call failed:", (e as Error).message);
        }

        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h

        // Save payment link
        const linkRecord = {
          cod_empresa,
          adquirente: "REDE",
          valor,
          descricao,
          parcelas_max: parcelas_max || 1,
          expira_em: expiresAt,
          url_pagamento: redeResult?.returnUrl || redeResult?.authorization?.returnUrl || null,
          tid: redeResult?.tid || null,
          status: redeResult?.tid ? "ATIVO" : "PENDENTE",
          cliente_nome: cliente_nome || null,
          cliente_documento: cliente_documento || null,
          cliente_telefone: cliente_telefone || null,
          origem: linkOrigem,
          origem_ref: origem_ref || null,
          dados_extras: redeResult ? { rede_response: redeResult } : {},
        };

        const { data: inserted, error: insertError } = await admin
          .from("payment_links")
          .insert(linkRecord)
          .select()
          .single();

        if (insertError) throw new Error("Erro ao salvar link: " + insertError.message);

        // Create ledger entry (lancamento RECEBER)
        try {
          await admin.from("lancamentos_financeiros").insert({
            cod_empresa,
            tipo: "RECEBER",
            descricao: `Link Pagamento: ${descricao}`,
            valor,
            data_vencimento: expiresAt.slice(0, 10),
            status: "PREVISTO",
            origem: "LINK_PAGAMENTO",
            origem_id: inserted.id,
            pessoa_nome: cliente_nome || null,
            pessoa_documento: cliente_documento || null,
            forma_pagamento: "CARTAO",
            adquirente: "REDE",
          });
        } catch (e) {
          console.warn("[payment-links] Ledger insert warning:", (e as Error).message);
        }

        result = {
          id: inserted.id,
          url_pagamento: inserted.url_pagamento,
          tid: inserted.tid,
          status: inserted.status,
          expira_em: expiresAt,
          valor,
          descricao,
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

      case "cancelar": {
        const { link_id } = params;
        if (!link_id) throw new Error("link_id é obrigatório");

        const { data: link, error: fetchErr } = await admin
          .from("payment_links")
          .select("*")
          .eq("id", link_id)
          .single();

        if (fetchErr || !link) throw new Error("Link não encontrado");
        if (link.status !== "ATIVO" && link.status !== "PENDENTE") {
          throw new Error(`Não é possível cancelar link com status ${link.status}`);
        }

        const { error: updateErr } = await admin
          .from("payment_links")
          .update({ status: "CANCELADO" })
          .eq("id", link_id);

        if (updateErr) throw new Error(updateErr.message);

        // Also cancel ledger entry
        if (link.lancamento_id) {
          await admin
            .from("lancamentos_financeiros")
            .update({ status: "CANCELADO" })
            .eq("id", link.lancamento_id);
        }

        result = { success: true, status: "CANCELADO" };
        break;
      }

      case "webhook_callback": {
        // Public endpoint for Rede webhook notifications
        const { tid, status: txStatus, amount } = params;
        console.log("[payment-links] webhook:", { tid, txStatus, amount });

        if (!tid) throw new Error("tid é obrigatório no webhook");

        const { data: link, error: findErr } = await admin
          .from("payment_links")
          .select("*")
          .eq("tid", tid)
          .single();

        if (findErr || !link) {
          console.warn("[payment-links] Link not found for TID:", tid);
          result = { received: true, processed: false };
          break;
        }

        const newStatus = (txStatus === "Approved" || txStatus === "approved") ? "PAGO" : link.status;

        const { error: upErr } = await admin
          .from("payment_links")
          .update({
            status: newStatus,
            pago_em: newStatus === "PAGO" ? new Date().toISOString() : null,
            webhook_payload: params,
          })
          .eq("id", link.id);

        if (upErr) console.error("[payment-links] webhook update error:", upErr);

        // Update ledger if paid
        if (newStatus === "PAGO") {
          await admin
            .from("lancamentos_financeiros")
            .update({
              status: "BAIXADO",
              data_pagamento: new Date().toISOString().slice(0, 10),
              valor_pago: (amount || 0) / 100, // Rede sends in cents
            })
            .eq("origem", "LINK_PAGAMENTO")
            .eq("origem_id", link.id);
        }

        result = { received: true, processed: true, new_status: newStatus };
        break;
      }

      default:
        throw new Error(`Action '${action}' não suportada. Use: criar, listar, detalhe, cancelar, webhook_callback`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[payment-links] Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
