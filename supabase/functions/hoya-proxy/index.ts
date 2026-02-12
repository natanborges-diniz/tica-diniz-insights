// supabase/functions/hoya-proxy/index.ts
// Proxy seguro para API Hoya Lab
// E0.3: JWT obrigatório + role mínima: gestor

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authGuard, corsHeaders } from "../_shared/authGuard.ts";

const HOYA_BASE_URL = Deno.env.get("HOYA_BASE_URL") || "https://hoyalab.com.br/api/customer";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // E0.3: Auth guard — gestor ou admin
    await authGuard(req, { requiredRole: "gestor" });

    const HOYA_API_KEY = Deno.env.get("HOYA_API_KEY");
    if (!HOYA_API_KEY) {
      return new Response(
        JSON.stringify({ error: "HOYA_API_KEY não configurada." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { action, ...params } = body;

    console.log("[hoya-proxy] Action:", action);

    let url: string;
    let method = "GET";
    let fetchBody: string | undefined;

    switch (action) {
      case "listar-produtos": url = `${HOYA_BASE_URL}/produto`; break;
      case "consultar-produto": url = `${HOYA_BASE_URL}/produto/${params.codigoProduto}`; break;
      case "consultar-produto-sku": url = `${HOYA_BASE_URL}/produto/sku/${params.sku}`; break;
      case "criar-pedido":
        url = `${HOYA_BASE_URL}/pedido`; method = "POST";
        fetchBody = JSON.stringify(params.pedido); break;
      case "consultar-pedido": url = `${HOYA_BASE_URL}/pedido/tracking/${params.numeroPedido}`; break;
      case "consultar-pedidos":
        url = `${HOYA_BASE_URL}/pedido/consultar`; method = "POST";
        fetchBody = JSON.stringify(params.filtros || {}); break;
      case "tipos-armacao": url = `${HOYA_BASE_URL}/tipoarmacao`; break;
      case "desenhos": url = `${HOYA_BASE_URL}/desenho`; break;
      case "materiais": url = `${HOYA_BASE_URL}/material`; break;
      case "tratamentos": url = `${HOYA_BASE_URL}/tratamento`; break;
      case "alturas": url = `${HOYA_BASE_URL}/altura`; break;
      case "fotossensiveis": url = `${HOYA_BASE_URL}/fotossensivel`; break;
      case "coloracoes":
        url = `${HOYA_BASE_URL}/coloracao`; method = "POST";
        fetchBody = JSON.stringify(params.filtros || {}); break;
      default:
        return new Response(
          JSON.stringify({ error: `Ação desconhecida: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const hoyaResp = await fetch(url, {
      method,
      headers: { "x-api-key": HOYA_API_KEY, "Content-Type": "application/json" },
      body: method !== "GET" ? fetchBody : undefined,
    });

    const respText = await hoyaResp.text();
    let respData: unknown;
    try { respData = JSON.parse(respText); } catch { respData = { rawResponse: respText }; }

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
      } catch (dbErr) {
        console.error("[hoya-proxy] Failed to save order to DB:", dbErr);
      }
    }

    return new Response(JSON.stringify(respData), {
      status: hoyaResp.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[hoya-proxy] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
