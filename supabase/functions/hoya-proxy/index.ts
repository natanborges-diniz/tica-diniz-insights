// supabase/functions/hoya-proxy/index.ts
// Proxy seguro para API Hoya Lab
// E0.3: JWT obrigatório + role mínima: gestor
// E4.1: Auditoria completa + validação de ambiente + requested_by

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authGuard, corsHeaders } from "../_shared/authGuard.ts";

const HOYA_BASE_URL = Deno.env.get("HOYA_BASE_URL") || "https://hoyalab.com.br/api/customer";

// Detect environment from base URL
function detectHoyaEnvironment(): string {
  const url = HOYA_BASE_URL.toLowerCase();
  if (url.includes("staging") || url.includes("homolog") || url.includes("sandbox") || url.includes("test")) {
    return "staging";
  }
  return "production";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // E0.3: Auth guard — gestor ou admin
    const user = await authGuard(req, { requiredRole: "gestor" });

    const HOYA_API_KEY = Deno.env.get("HOYA_API_KEY");
    if (!HOYA_API_KEY) {
      return new Response(
        JSON.stringify({ error: "HOYA_API_KEY não configurada." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { action, ...params } = body;

    const hoyaEnv = detectHoyaEnvironment();
    console.log("[hoya-proxy] Action:", action, "| Env:", hoyaEnv, "| User:", user?.id);

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
      // E4.1: Audit history
      case "historico-pedidos": {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const sb = createClient(supabaseUrl, supabaseKey);
        
        let query = sb.from("pedidos_fornecedor")
          .select("*")
          .eq("fornecedor", "HOYA")
          .order("created_at", { ascending: false })
          .limit(params.limit || 50);
        
        if (params.codEmpresa && params.codEmpresa !== "ALL") {
          query = query.eq("cod_empresa", Number(params.codEmpresa));
        }
        
        const { data: pedidos, error: dbErr } = await query;
        if (dbErr) throw new Error(dbErr.message);
        
        return new Response(JSON.stringify(pedidos || []), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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

    // E4.1: Enhanced audit for order creation
    if (action === "criar-pedido") {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        const respObj = respData as Record<string, unknown>;
        const numeroPedido = hoyaResp.ok && respObj?.numeroPedido ? String(respObj.numeroPedido) : null;
        
        await supabase.from("pedidos_fornecedor").insert({
          cod_os: params.codOs || 0,
          cod_empresa: params.codEmpresa || 0,
          fornecedor: "HOYA",
          numero_pedido: numeroPedido,
          status: hoyaResp.ok 
            ? ((respObj?.status as string) || "Enviado") 
            : "ERRO",
          payload: params.pedido,
          response: respData,
          requested_by: user?.id || null,
          requested_at: new Date().toISOString(),
          hoya_environment: hoyaEnv,
        });
        console.log("[hoya-proxy] Order audit saved. User:", user?.id, "Env:", hoyaEnv, "Success:", hoyaResp.ok);
      } catch (dbErr) {
        console.error("[hoya-proxy] Failed to save order audit to DB:", dbErr);
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
