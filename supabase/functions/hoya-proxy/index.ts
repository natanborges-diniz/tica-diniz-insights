// supabase/functions/hoya-proxy/index.ts
// Proxy seguro para API Hoya Lab — todas as chamadas passam por aqui
// A x-api-key fica armazenada como secret no Supabase

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Toggle between homologação and produção
const HOYA_BASE_URL = Deno.env.get("HOYA_BASE_URL") || "https://hoyalab.com.br/api/customer";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const HOYA_API_KEY = Deno.env.get("HOYA_API_KEY");
    if (!HOYA_API_KEY) {
      console.error("[hoya-proxy] HOYA_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "HOYA_API_KEY não configurada. Configure nas secrets do projeto." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { action, ...params } = body;

    console.log("[hoya-proxy] Action:", action, "Params keys:", Object.keys(params));

    let url: string;
    let method = "GET";
    let fetchBody: string | undefined;

    switch (action) {
      // ===== PRODUTOS =====
      case "listar-produtos":
        url = `${HOYA_BASE_URL}/produto`;
        break;

      case "consultar-produto":
        url = `${HOYA_BASE_URL}/produto/${params.codigoProduto}`;
        break;

      case "consultar-produto-sku":
        url = `${HOYA_BASE_URL}/produto/sku/${params.sku}`;
        break;

      // ===== PEDIDO =====
      case "criar-pedido":
        url = `${HOYA_BASE_URL}/pedido`;
        method = "POST";
        fetchBody = JSON.stringify(params.pedido);
        break;

      case "consultar-pedido":
        url = `${HOYA_BASE_URL}/pedido/tracking/${params.numeroPedido}`;
        break;

      case "consultar-pedidos":
        url = `${HOYA_BASE_URL}/pedido/consultar`;
        method = "POST";
        fetchBody = JSON.stringify(params.filtros || {});
        break;

      // ===== AUXILIARES =====
      case "tipos-armacao":
        url = `${HOYA_BASE_URL}/tipoarmacao`;
        break;

      case "desenhos":
        url = `${HOYA_BASE_URL}/desenho`;
        break;

      case "materiais":
        url = `${HOYA_BASE_URL}/material`;
        break;

      case "tratamentos":
        url = `${HOYA_BASE_URL}/tratamento`;
        break;

      case "alturas":
        url = `${HOYA_BASE_URL}/altura`;
        break;

      case "fotossensiveis":
        url = `${HOYA_BASE_URL}/fotossensivel`;
        break;

      case "coloracoes":
        url = `${HOYA_BASE_URL}/coloracao`;
        method = "POST";
        fetchBody = JSON.stringify(params.filtros || {});
        break;

      default:
        return new Response(
          JSON.stringify({ error: `Ação desconhecida: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    console.log("[hoya-proxy] Calling Hoya:", method, url);

    const hoyaHeaders: Record<string, string> = {
      "x-api-key": HOYA_API_KEY,
      "Content-Type": "application/json",
    };

    const hoyaResp = await fetch(url, {
      method,
      headers: hoyaHeaders,
      body: method !== "GET" ? fetchBody : undefined,
    });

    const respText = await hoyaResp.text();
    console.log("[hoya-proxy] Hoya response status:", hoyaResp.status, "length:", respText.length);

    // Try to parse as JSON
    let respData: unknown;
    try {
      respData = JSON.parse(respText);
    } catch {
      respData = { rawResponse: respText };
    }

    // If creating an order, also save to pedidos_fornecedor
    if (action === "criar-pedido" && hoyaResp.ok && respData) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const respObj = respData as Record<string, unknown>;
        const numeroPedido = respObj.numeroPedido ? String(respObj.numeroPedido) : null;

        await supabase.from("pedidos_fornecedor").insert({
          cod_os: params.codOs || 0,
          cod_empresa: params.codEmpresa || 0,
          fornecedor: "HOYA",
          numero_pedido: numeroPedido,
          status: (respObj.status as string) || "Enviado",
          payload: params.pedido,
          response: respData,
        });

        console.log("[hoya-proxy] Order saved to pedidos_fornecedor, numeroPedido:", numeroPedido);
      } catch (dbErr) {
        console.error("[hoya-proxy] Failed to save order to DB:", dbErr);
      }
    }

    return new Response(JSON.stringify(respData), {
      status: hoyaResp.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[hoya-proxy] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
