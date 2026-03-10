// supabase/functions/btg-auth/index.ts
// BTG Pactual Banking — OAuth2 Authorization Code flow
// Actions: authorize, callback, refresh, status
// Credentials read from fornecedor_configuracao table (same pattern as Hoya/Zeiss)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// ─── Credentials from DB ─────────────────────────────────────
// api_key          → Client ID (same for both envs)
// api_key_staging  → Client Secret (sandbox)
// api_key_production → Client Secret (production)
// base_url_staging → Auth base URL sandbox
// base_url_production → Auth base URL production
interface BtgCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authBase: string;
  apiBase: string;
  isSandbox: boolean;
  env: string;
}

async function getBtgCredentials(): Promise<BtgCredentials> {
  const db = getServiceClient();
  const { data } = await db
    .from("fornecedor_configuracao")
    .select("ambiente, api_key, api_key_staging, api_key_production, base_url_staging, base_url_production, redirect_uri_staging, redirect_uri_production")
    .eq("fornecedor", "btg")
    .eq("ativo", true)
    .single();

  const env = data?.ambiente === "production" ? "production" : "sandbox";
  const isSandbox = env === "sandbox";

  // Client ID from DB, fallback to env secret
  const clientId = data?.api_key || Deno.env.get("BTG_CLIENT_ID")!;

  // Client Secret per environment from DB, fallback to env secret
  const clientSecret = isSandbox
    ? (data?.api_key_staging || Deno.env.get("BTG_CLIENT_SECRET")!)
    : (data?.api_key_production || Deno.env.get("BTG_CLIENT_SECRET")!);

  const authBase = isSandbox
    ? (data?.base_url_staging || "https://id.sandbox.btgpactual.com")
    : (data?.base_url_production || "https://id.btgpactual.com");

  const apiBase = isSandbox
    ? "https://api.sandbox.empresas.btgpactual.com"
    : "https://api.empresas.btgpactual.com";

  // Redirect URI per environment from DB, fallback to env secret
  const redirectUri = isSandbox
    ? (data?.redirect_uri_staging || Deno.env.get("BTG_REDIRECT_URI")!)
    : (data?.redirect_uri_production || Deno.env.get("BTG_REDIRECT_URI")!);

  return { clientId, clientSecret, redirectUri, authBase, apiBase, isSandbox, env };
}

// Decode JWT for auth validation
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

function requireAdmin(req: Request): string {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw json({ error: "Unauthorized" }, 401);
  }
  const claims = decodeJwtPayload(authHeader.replace("Bearer ", ""));
  if (!claims?.sub || claims.aud !== "authenticated") {
    throw json({ error: "Unauthorized" }, 401);
  }
  const exp = claims.exp as number | undefined;
  if (exp && exp < Math.floor(Date.now() / 1000)) {
    throw json({ error: "Token expirado" }, 401);
  }
  return claims.sub as string;
}

async function checkAdmin(userId: string) {
  const db = getServiceClient();
  const { data } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin");
  if (!data || data.length === 0) {
    throw json({ error: "Forbidden — apenas admin" }, 403);
  }
}

// ─── ACTION: authorize ───────────────────────────────────────
async function handleAuthorize(req: Request) {
  const userId = requireAdmin(req);
  await checkAdmin(userId);

  const { cod_empresa } = await req.json();
  if (!cod_empresa) return json({ error: "cod_empresa obrigatório" }, 400);

  const creds = await getBtgCredentials();

  console.log("[btg-auth][authorize] ── DIAGNÓSTICO ──");
  console.log("[btg-auth][authorize] BTG_ENVIRONMENT:", creds.env);
  console.log("[btg-auth][authorize] authBase:", creds.authBase);
  console.log("[btg-auth][authorize] isSandbox:", creds.isSandbox);
  console.log("[btg-auth][authorize] Client ID (prefixo):", creds.clientId ? `${creds.clientId.substring(0, 8)}...` : "NÃO CONFIGURADO");
  console.log("[btg-auth][authorize] Client Secret:", creds.clientSecret ? "✓ configurado" : "NÃO CONFIGURADO");
  console.log("[btg-auth][authorize] Redirect URI:", creds.redirectUri || "NÃO CONFIGURADO");
  console.log("[btg-auth][authorize] Credenciais origem:", creds.clientId === Deno.env.get("BTG_CLIENT_ID") ? "env secrets" : "banco de dados");

  const scopes = [
    "openid",
    "brn:btg:empresas:banking:payments.readonly",
    "brn:btg:empresas:banking:collections.readonly",
    "empresas.btgpactual.com/accounts.readonly",
    "empresas.btgpactual.com/authorized-direct-debits.readonly",
  ].join(" ");

  const state = JSON.stringify({ cod_empresa, user_id: userId });
  const stateB64 = btoa(state);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: creds.clientId,
    redirect_uri: creds.redirectUri,
    scope: scopes,
    state: stateB64,
    prompt: "login",
  });

  const authorizeUrl = `${creds.authBase}/oauth2/authorize?${params.toString()}`;

  return json({
    authorize_url: authorizeUrl,
    _diagnostico: {
      environment: creds.env,
      auth_base: creds.authBase,
      api_base: creds.apiBase,
      is_sandbox: creds.isSandbox,
      redirect_uri: creds.redirectUri,
      client_id_prefix: creds.clientId ? creds.clientId.substring(0, 8) : null,
      credentials_source: creds.clientId === Deno.env.get("BTG_CLIENT_ID") ? "env_secrets" : "database",
      scopes: scopes.split(" "),
    },
  });
}

// ─── ACTION: callback ────────────────────────────────────────
async function handleCallback(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateB64 = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return new Response(
      `<html><body><h2>Erro na autorização BTG</h2><p>${error}</p></body></html>`,
      { status: 400, headers: { "Content-Type": "text/html" } }
    );
  }

  if (!code || !stateB64) {
    return new Response(
      `<html><body><h2>Parâmetros inválidos</h2></body></html>`,
      { status: 400, headers: { "Content-Type": "text/html" } }
    );
  }

  let stateData: { cod_empresa: number; user_id: string };
  try {
    stateData = JSON.parse(atob(stateB64));
  } catch {
    return new Response(
      `<html><body><h2>State inválido</h2></body></html>`,
      { status: 400, headers: { "Content-Type": "text/html" } }
    );
  }

  const creds = await getBtgCredentials();

  // Exchange code for tokens
  const tokenRes = await fetch(`${creds.authBase}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${creds.clientId}:${creds.clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: creds.redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text();
    console.error("[btg-auth] Token exchange failed:", errBody);
    return new Response(
      `<html><body><h2>Erro ao trocar código</h2><pre>${errBody}</pre></body></html>`,
      { status: 500, headers: { "Content-Type": "text/html" } }
    );
  }

  const tokenData = await tokenRes.json();
  const expiresAt = new Date(
    Date.now() + (tokenData.expires_in || 86400) * 1000
  ).toISOString();

  const db = getServiceClient();
  const { error: dbError } = await db.from("btg_tokens").upsert(
    {
      cod_empresa: stateData.cod_empresa,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      expires_at: expiresAt,
      scopes: tokenData.scope ? tokenData.scope.split(" ") : [],
      updated_at: new Date().toISOString(),
    },
    { onConflict: "cod_empresa" }
  );

  if (dbError) {
    console.error("[btg-auth] DB upsert error:", dbError);
    return new Response(
      `<html><body><h2>Erro ao salvar token</h2><pre>${dbError.message}</pre></body></html>`,
      { status: 500, headers: { "Content-Type": "text/html" } }
    );
  }

  const redirectTarget = `${req.headers.get("origin") || "https://lens-data-vision.lovable.app"}/admin/btg-validacao?btg_callback=success&cod_empresa=${stateData.cod_empresa}`;

  return new Response(
    `<html><head><meta charset="utf-8"><meta http-equiv="refresh" content="2;url=${redirectTarget}"></head><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc"><div style="text-align:center"><h2 style="color:#16a34a">✅ Autorização BTG concluída!</h2><p>Empresa ${stateData.cod_empresa} conectada com sucesso.</p><p style="color:#64748b;font-size:14px">Redirecionando de volta ao sistema...</p><a href="${redirectTarget}" style="color:#2563eb">Clique aqui se não for redirecionado</a></div></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

// ─── ACTION: refresh ─────────────────────────────────────────
async function handleRefresh(req: Request) {
  const userId = requireAdmin(req);
  await checkAdmin(userId);

  const { cod_empresa } = await req.json();
  if (!cod_empresa) return json({ error: "cod_empresa obrigatório" }, 400);

  const db = getServiceClient();
  const { data: tokenRow } = await db
    .from("btg_tokens")
    .select("*")
    .eq("cod_empresa", cod_empresa)
    .single();

  if (!tokenRow?.refresh_token) {
    return json({ error: "Nenhum refresh_token encontrado. Re-autorize." }, 404);
  }

  const creds = await getBtgCredentials();

  const tokenRes = await fetch(`${creds.authBase}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${creds.clientId}:${creds.clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokenRow.refresh_token,
    }),
  });

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text();
    console.error("[btg-auth] Refresh failed:", errBody);
    return json({ error: "Falha no refresh", details: errBody }, 502);
  }

  const tokenData = await tokenRes.json();
  const expiresAt = new Date(
    Date.now() + (tokenData.expires_in || 86400) * 1000
  ).toISOString();

  await db.from("btg_tokens").update({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token || tokenRow.refresh_token,
    expires_at: expiresAt,
    scopes: tokenData.scope ? tokenData.scope.split(" ") : tokenRow.scopes,
    updated_at: new Date().toISOString(),
  }).eq("cod_empresa", cod_empresa);

  return json({ success: true, expires_at: expiresAt });
}

// ─── ACTION: status ──────────────────────────────────────────
async function handleStatus(req: Request) {
  const userId = requireAdmin(req);
  await checkAdmin(userId);

  const url = new URL(req.url);
  const codEmpresa = url.searchParams.get("cod_empresa");

  const db = getServiceClient();

  let query = db.from("btg_contas_bancarias").select("*");
  if (codEmpresa) query = query.eq("cod_empresa", Number(codEmpresa));
  const { data: contas } = await query;

  let tokenQuery = db.from("btg_tokens").select("cod_empresa, expires_at, scopes, updated_at");
  if (codEmpresa) tokenQuery = tokenQuery.eq("cod_empresa", Number(codEmpresa));
  const { data: tokens } = await tokenQuery;

  const tokenMap = new Map(
    (tokens || []).map((t: Record<string, unknown>) => [t.cod_empresa, t])
  );

  const result = (contas || []).map((c: Record<string, unknown>) => {
    const token = tokenMap.get(c.cod_empresa) as Record<string, unknown> | undefined;
    const expiresAt = token?.expires_at ? new Date(token.expires_at as string) : null;
    const isExpired = expiresAt ? expiresAt < new Date() : true;

    return {
      cod_empresa: c.cod_empresa,
      cnpj: c.cnpj,
      company_id: c.company_id,
      ativa: c.ativa,
      autenticado: !!token,
      token_expira_em: token?.expires_at || null,
      token_expirado: isExpired,
      scopes: token?.scopes || [],
    };
  });

  return json(result);
}

// ─── MAIN ────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.split("/").pop() || "";

    if (path === "callback" || url.searchParams.has("code")) {
      return await handleCallback(req);
    }

    let action = url.searchParams.get("action") || "";
    if (!action && req.method === "POST") {
      const cloned = req.clone();
      try {
        const body = await cloned.json();
        action = body.action || "";
      } catch {
        // no-op
      }
    }

    switch (action) {
      case "authorize":
        return await handleAuthorize(req);
      case "callback":
        return await handleCallback(req);
      case "refresh":
        return await handleRefresh(req);
      case "status":
        return await handleStatus(req);
      default:
        return json({ error: `Ação desconhecida: '${action}'. Use: authorize, callback, refresh, status` }, 400);
    }
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[btg-auth] Unhandled error:", e);
    return json({ error: "Erro interno", details: String(e) }, 500);
  }
});
