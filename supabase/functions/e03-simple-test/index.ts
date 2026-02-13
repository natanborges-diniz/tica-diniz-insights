// E0.3 validation — simplified tests without timeout issues
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const results: Record<string, unknown> = {};

  try {
    // Test 1: 401 without token
    const noTokenResp = await fetch(`${supabaseUrl}/functions/v1/ai-central`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonKey },
      body: JSON.stringify({ pergunta: "test" }),
    });
    results["C_no_token_ai_central"] = {
      status: noTokenResp.status,
      body: await noTokenResp.text(),
    };

    // Test 2: Vendedor calling sync-vendas (should be 403)
    const vendedorToken = await (async () => {
      const client = createClient(supabaseUrl, anonKey);
      const { data, error } = await client.auth.signInWithPassword({
        email: "vendedor@teste.com",
        password: "Teste123!",
      });
      if (error) throw new Error(`Login failed: ${error.message}`);
      return data.session.access_token;
    })();

    const vendedorSyncResp = await fetch(
      `${supabaseUrl}/functions/v1/sync-vendas`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${vendedorToken}`,
        },
        body: JSON.stringify({}),
      }
    );
    results["A_vendedor_sync_vendas_403"] = {
      status: vendedorSyncResp.status,
      body: await vendedorSyncResp.text(),
    };

    // Test 3: Gestor calling sync-vendas (should be 403 — not admin)
    const gestorToken = await (async () => {
      const client = createClient(supabaseUrl, anonKey);
      const { data, error } = await client.auth.signInWithPassword({
        email: "gestor@teste.com",
        password: "Teste123!",
      });
      if (error) throw new Error(`Login failed: ${error.message}`);
      return data.session.access_token;
    })();

    const gestorSyncResp = await fetch(
      `${supabaseUrl}/functions/v1/sync-vendas`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${gestorToken}`,
        },
        body: JSON.stringify({}),
      }
    );
    results["A_gestor_sync_vendas_403"] = {
      status: gestorSyncResp.status,
      body: await gestorSyncResp.text(),
    };

    // Test 4: Gestor calling hoya-proxy (should pass authGuard, but fail downstream)
    const gestorHoyaResp = await fetch(
      `${supabaseUrl}/functions/v1/hoya-proxy`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${gestorToken}`,
        },
        body: JSON.stringify({ action: "listar-produtos" }),
      }
    );
    const gestorHoyaText = await gestorHoyaResp.text();
    results["A_gestor_hoya_proxy"] = {
      status: gestorHoyaResp.status,
      body: gestorHoyaText,
      passed_authguard:
        !gestorHoyaText.includes("Forbidden") &&
        !gestorHoyaText.includes("Unauthorized"),
    };

    // Test 5: Vendedor calling hoya-proxy (should be 403)
    const vendedorHoyaResp = await fetch(
      `${supabaseUrl}/functions/v1/hoya-proxy`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${vendedorToken}`,
        },
        body: JSON.stringify({ action: "listar-produtos" }),
      }
    );
    results["A_vendedor_hoya_proxy_403"] = {
      status: vendedorHoyaResp.status,
      body: await vendedorHoyaResp.text(),
    };

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
