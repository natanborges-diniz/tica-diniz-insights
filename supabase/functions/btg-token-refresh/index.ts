// supabase/functions/btg-token-refresh/index.ts
// Scheduled function: auto-refreshes BTG tokens expiring within 2 hours
// Called by pg_cron every 30 minutes — no auth required (service-level)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

interface BtgCredentials {
  clientId: string;
  clientSecret: string;
  authBase: string;
}

async function getBtgCredentials(): Promise<BtgCredentials> {
  const db = getServiceClient();
  const { data } = await db
    .from("fornecedor_configuracao")
    .select("ambiente, api_key, api_key_staging, api_key_production, base_url_staging, base_url_production")
    .eq("fornecedor", "btg")
    .eq("ativo", true)
    .single();

  const env = data?.ambiente === "production" ? "production" : "sandbox";
  const isSandbox = env === "sandbox";

  const clientId = data?.api_key || Deno.env.get("BTG_CLIENT_ID")!;
  const clientSecret = isSandbox
    ? (data?.api_key_staging || Deno.env.get("BTG_CLIENT_SECRET")!)
    : (data?.api_key_production || Deno.env.get("BTG_CLIENT_SECRET")!);
  const authBase = isSandbox
    ? (data?.base_url_staging || "https://id.sandbox.btgpactual.com")
    : (data?.base_url_production || "https://id.btgpactual.com");

  return { clientId, clientSecret, authBase };
}

async function refreshToken(
  creds: BtgCredentials,
  refreshTokenStr: string
): Promise<{ access_token: string; refresh_token?: string; expires_in?: number; scope?: string } | null> {
  const tokenRes = await fetch(`${creds.authBase}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${creds.clientId}:${creds.clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshTokenStr,
    }),
  });

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text();
    console.error("[btg-token-refresh] Refresh failed:", errBody);
    return null;
  }

  return tokenRes.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const db = getServiceClient();

    // Find tokens expiring within the next 2 hours
    const threshold = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    const { data: expiringTokens, error } = await db
      .from("btg_tokens")
      .select("cod_empresa, refresh_token, expires_at, scopes")
      .not("refresh_token", "is", null)
      .lt("expires_at", threshold);

    if (error) {
      console.error("[btg-token-refresh] Query error:", error);
      return new Response(JSON.stringify({ error: "Erro ao buscar tokens" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!expiringTokens || expiringTokens.length === 0) {
      console.log("[btg-token-refresh] Nenhum token a renovar.");
      return new Response(
        JSON.stringify({ message: "Nenhum token a renovar", refreshed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[btg-token-refresh] ${expiringTokens.length} token(s) a renovar.`);

    const creds = await getBtgCredentials();
    const results: { cod_empresa: number; success: boolean; error?: string; expires_at?: string }[] = [];

    for (const token of expiringTokens) {
      try {
        const tokenData = await refreshToken(creds, token.refresh_token!);

        if (!tokenData) {
          results.push({ cod_empresa: token.cod_empresa, success: false, error: "Refresh falhou" });
          continue;
        }

        const expiresAt = new Date(
          Date.now() + (tokenData.expires_in || 86400) * 1000
        ).toISOString();

        await db.from("btg_tokens").update({
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token || token.refresh_token,
          expires_at: expiresAt,
          scopes: tokenData.scope ? tokenData.scope.split(" ") : token.scopes,
          updated_at: new Date().toISOString(),
        }).eq("cod_empresa", token.cod_empresa);

        results.push({ cod_empresa: token.cod_empresa, success: true, expires_at: expiresAt });
        console.log(`[btg-token-refresh] ✅ Empresa ${token.cod_empresa} renovada até ${expiresAt}`);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error(`[btg-token-refresh] ❌ Empresa ${token.cod_empresa}:`, errMsg);
        results.push({ cod_empresa: token.cod_empresa, success: false, error: errMsg });
      }
    }

    const refreshed = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    console.log(`[btg-token-refresh] Resultado: ${refreshed} renovado(s), ${failed} falha(s).`);

    return new Response(
      JSON.stringify({ refreshed, failed, details: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[btg-token-refresh] Unhandled error:", e);
    return new Response(
      JSON.stringify({ error: "Erro interno", details: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
