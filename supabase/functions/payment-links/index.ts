import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-service-key",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_SERVICE_SECRET = Deno.env.get("INTERNAL_SERVICE_SECRET") || "";

// Published app domain for generating payment URLs
const APP_DOMAIN = "https://lens-data-vision.lovable.app";

/** Authenticate via JWT or X-Service-Key */
async function authenticate(req: Request): Promise<{ userId: string | null; isService: boolean }> {
  const serviceKey = req.headers.get("x-service-key");
  if (serviceKey && INTERNAL_SERVICE_SECRET && serviceKey === INTERNAL_SERVICE_SECRET) {
    return { userId: null, isService: true };
  }

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
    const body = await req.json();
    const { action, ...params } = body;

    if (!action) throw new Error("action é obrigatório");

    // Public actions that don't require auth
    const publicActions = ["detalhe_publico", "processar_pagamento"];
    let auth = { userId: null as string | null, isService: false };

    if (!publicActions.includes(action)) {
      auth = await authenticate(req);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let result: unknown;

    switch (action) {
      case "criar": {
        const { cod_empresa, valor, descricao, parcelas_max, cliente_nome, cliente_documento, cliente_telefone, origem, origem_ref } = params;
        if (!cod_empresa || !valor || !descricao) throw new Error("cod_empresa, valor e descricao são obrigatórios");

        // Validate that the store has a valid PV configured
        const { data: adqConfig } = await admin
          .from("adquirentes_config")
          .select("merchant_id, merchant_id_production, ambiente, ativo")
          .eq("cod_empresa", cod_empresa)
          .eq("adquirente", "REDE")
          .eq("ativo", true)
          .single();

        if (!adqConfig) {
          throw new Error(`Loja ${cod_empresa} não possui configuração de adquirente ativa.`);
        }

        const activePv = adqConfig.ambiente === "production"
          ? (adqConfig.merchant_id_production || adqConfig.merchant_id)
          : adqConfig.merchant_id;

        if (!activePv || activePv === "PENDENTE") {
          throw new Error(`Loja ${cod_empresa} ainda não possui PV de filiação configurado. Atualize em Adquirentes.`);
        }

        const linkOrigem = origem || (auth.isService ? "CHATBOT" : "MANUAL");
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        // Save payment link with system-generated URL (no Rede call needed at creation)
        const linkRecord = {
          cod_empresa,
          adquirente: "REDE",
          valor,
          descricao,
          parcelas_max: parcelas_max || 1,
          expira_em: expiresAt,
          status: "ATIVO",
          cliente_nome: cliente_nome || null,
          cliente_documento: cliente_documento || null,
          cliente_telefone: cliente_telefone || null,
          origem: linkOrigem,
          origem_ref: origem_ref || null,
          dados_extras: {},
        };

        const { data: inserted, error: insertError } = await admin
          .from("payment_links")
          .insert(linkRecord)
          .select()
          .single();

        if (insertError) throw new Error("Erro ao salvar link: " + insertError.message);

        // Set the URL to our own checkout page
        const payUrl = `${APP_DOMAIN}/pay/${inserted.id}`;
        await admin.from("payment_links").update({ url_pagamento: payUrl }).eq("id", inserted.id);

        // Create ledger entry
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
          url_pagamento: payUrl,
          status: "ATIVO",
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

      case "detalhe_publico": {
        // Public: returns only safe fields, no auth required
        const { link_id } = params;
        if (!link_id) throw new Error("link_id é obrigatório");

        const { data, error } = await admin
          .from("payment_links")
          .select("id, valor, descricao, parcelas_max, status, expira_em, cliente_nome, adquirente")
          .eq("id", link_id)
          .single();

        if (error) throw new Error("Link não encontrado");

        // Check expiration
        if (data.status === "ATIVO" && data.expira_em && new Date(data.expira_em) < new Date()) {
          await admin.from("payment_links").update({ status: "EXPIRADO" }).eq("id", link_id);
          data.status = "EXPIRADO";
        }

        result = data;
        break;
      }

      case "processar_pagamento": {
        // Public: process card payment for a link
        const { link_id, cardNumber, cardholderName, expirationMonth, expirationYear, securityCode, installments } = params;
        if (!link_id) throw new Error("link_id é obrigatório");
        if (!cardNumber || !cardholderName || !expirationMonth || !expirationYear || !securityCode) {
          throw new Error("Dados do cartão são obrigatórios");
        }

        // Fetch link
        const { data: link, error: fetchErr } = await admin
          .from("payment_links")
          .select("*")
          .eq("id", link_id)
          .single();

        if (fetchErr || !link) throw new Error("Link não encontrado");
        if (link.status !== "ATIVO") throw new Error(`Link com status ${link.status} não pode ser processado`);

        // Check expiration
        if (link.expira_em && new Date(link.expira_em) < new Date()) {
          await admin.from("payment_links").update({ status: "EXPIRADO" }).eq("id", link_id);
          throw new Error("Link expirado");
        }

        // Call rede-proxy to process payment
        const reference = `PL-${link.cod_empresa}-${link_id.slice(0, 8)}`;
        const redeRes = await fetch(`${SUPABASE_URL}/functions/v1/rede-proxy`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            action: "criar_transacao",
            cod_empresa: link.cod_empresa,
            amount: link.valor,
            reference,
            installments: installments || link.parcelas_max || 1,
            kind: "credit",
            capture: true,
            cardNumber,
            cardholderName,
            expirationMonth,
            expirationYear,
            securityCode,
          }),
        });

        const redeData = await redeRes.json();

        if (redeData.error) {
          console.error("[payment-links] Rede payment error:", redeData.error);
          throw new Error("Erro ao processar pagamento: " + redeData.error);
        }

        // Check if transaction was approved
        const returnCode = redeData.returnCode;
        const isApproved = returnCode === "00" || returnCode === 0;

        if (!isApproved) {
          const returnMsg = redeData.returnMessage || "Transação não aprovada";
          throw new Error(`Pagamento recusado: ${returnMsg} (código ${returnCode})`);
        }

        // Update link status
        await admin.from("payment_links").update({
          status: "PAGO",
          tid: redeData.tid || null,
          pago_em: new Date().toISOString(),
          dados_extras: { rede_response: redeData },
        }).eq("id", link_id);

        // Update ledger
        await admin.from("lancamentos_financeiros").update({
          status: "BAIXADO",
          data_pagamento: new Date().toISOString().slice(0, 10),
          valor_pago: link.valor,
        })
          .eq("origem", "LINK_PAGAMENTO")
          .eq("origem_id", link_id);

        // Notify Connect & Flow about payment confirmation
        if (link.origem === "CHATBOT") {
          try {
            await fetch("https://kvggebtnqmxydtwaumqz.supabase.co/functions/v1/payment-webhook", {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-service-key": INTERNAL_SERVICE_SECRET },
              body: JSON.stringify({
                payment_link_id: link_id,
                status: "PAGO",
                tid: redeData.tid,
                nsu: redeData.nsu,
                authorization: redeData.authorizationCode,
                date: redeData.date,
                time: redeData.time,
                valor: link.valor,
                installments: redeData.installments,
                cardBin: redeData.cardBin,
                last4: redeData.last4,
                origem_ref: link.origem_ref,
              }),
            });
          } catch (e) { console.warn("[payment-links] CF webhook notify error:", e); }
        }

        result = {
          success: true,
          status: "PAGO",
          tid: redeData.tid,
          nsu: redeData.nsu,
          authorization: redeData.authorizationCode,
          date: redeData.date,
          time: redeData.time,
          installments: redeData.installments,
          cardBin: redeData.cardBin,
          last4: redeData.last4,
          amount: redeData.amount,
          returnMessage: redeData.returnMessage,
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
          .single();

        if (fetchErr || !link) throw new Error("Link não encontrado");
        if (link.status !== "ATIVO" && link.status !== "PENDENTE") {
          throw new Error(`Não é possível cancelar link com status ${link.status}`);
        }

        await admin.from("payment_links").update({ status: "CANCELADO" }).eq("id", link_id);

        // Cancel ledger entry
        await admin.from("lancamentos_financeiros")
          .update({ status: "CANCELADO" })
          .eq("origem", "LINK_PAGAMENTO")
          .eq("origem_id", link_id);

        result = { success: true, status: "CANCELADO" };
        break;
      }

      case "webhook_callback": {
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

        await admin.from("payment_links").update({
          status: newStatus,
          pago_em: newStatus === "PAGO" ? new Date().toISOString() : null,
          webhook_payload: params,
        }).eq("id", link.id);

        if (newStatus === "PAGO") {
          await admin.from("lancamentos_financeiros").update({
            status: "BAIXADO",
            data_pagamento: new Date().toISOString().slice(0, 10),
            valor_pago: (amount || 0) / 100,
          })
            .eq("origem", "LINK_PAGAMENTO")
            .eq("origem_id", link.id);
        }

        result = { received: true, processed: true, new_status: newStatus };
        break;
      }

      default:
        throw new Error(`Action '${action}' não suportada`);
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
