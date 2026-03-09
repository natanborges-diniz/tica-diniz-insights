// supabase/functions/btg-auth/index.ts
// BTG Pactual Banking — OAuth2 Authorization Code flow
// Actions: authorize, callback, refresh, status

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

function getBtgUrlsFromEnv(env: string) {
  const isSandbox = env === "sandbox";
  return {
    authBase: isSandbox
      ? "https://id.sandbox.btgpactual.com"
      : "https://id.btgpactual.com",
    apiBase: isSandbox
      ? "https://api.sandbox.empresas.btgpactual.com"
      : "https://api.empresas.btgpactual.com",
    isSandbox,
    env,
  };
}

async function getBtgUrls() {
  const db = getServiceClient();
  const { data } = await db
    .from("fornecedor_configuracao")
    .select("ambiente")
    .eq("fornecedor", "btg")
    .eq("ativo", true)
    .single();
  const env = data?.ambiente === "production" ? "production" : "sandbox";
  return getBtgUrlsFromEnv(env);
}

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// Decode JWT for auth validation (reused from authGuard pattern)
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
// Returns the BTG Id authorization URL for the admin to open in browser
async function handleAuthorize(req: Request) {
  const userId = requireAdmin(req);
  await checkAdmin(userId);

  const { cod_empresa } = await req.json();
  if (!cod_empresa) return json({ error: "cod_empresa obrigatório" }, 400);

  const btgUrls = await getBtgUrls();
  const clientId = Deno.env.get("BTG_CLIENT_ID")!;
  const redirectUri = Deno.env.get("BTG_REDIRECT_URI")!;
  const env = btgUrls.env;

  console.log("[btg-auth][authorize] ── DIAGNÓSTICO ──");
  console.log("[btg-auth][authorize] BTG_ENVIRONMENT:", env);
  console.log("[btg-auth][authorize] authBase:", btgUrls.authBase);
  console.log("[btg-auth][authorize] apiBase:", btgUrls.apiBase);
  console.log("[btg-auth][authorize] isSandbox:", btgUrls.isSandbox);
  console.log("[btg-auth][authorize] BTG_CLIENT_ID:", clientId ? `${clientId.substring(0, 8)}...` : "NÃO CONFIGURADO");
  console.log("[btg-auth][authorize] BTG_REDIRECT_URI:", redirectUri || "NÃO CONFIGURADO");
  console.log("[btg-auth][authorize] cod_empresa:", cod_empresa);

  const scopes = [
    "brn:btg:empresas:payments",
    "brn:btg:empresas:receivables",
    "brn:btg:empresas:cash-management.readonly",
    "brn:btg:empresas:dda.readonly",
  ].join(" ");

  // state carries cod_empresa so callback can associate the token
  const state = JSON.stringify({ cod_empresa, user_id: userId });
  const stateB64 = btoa(state);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes,
    state: stateB64,
  });

  const authorizeUrl = `${btgUrls.authBase}/oauth2/authorize?${params.toString()}`;

  console.log("[btg-auth][authorize] URL gerada:", authorizeUrl);

  return json({
    authorize_url: authorizeUrl,
    _diagnostico: {
      environment: env,
      auth_base: btgUrls.authBase,
      api_base: btgUrls.apiBase,
      is_sandbox: btgUrls.isSandbox,
      redirect_uri: redirectUri,
      client_id_prefix: clientId ? clientId.substring(0, 8) : null,
      scopes: scopes.split(" "),
    },
  });
}

// ─── ACTION: callback ────────────────────────────────────────
// Called by BTG after user authorizes — exchanges code for tokens
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

  const { authBase } = getBtgUrls();
  const clientId = Deno.env.get("BTG_CLIENT_ID")!;
  const clientSecret = Deno.env.get("BTG_CLIENT_SECRET")!;
  const redirectUri = Deno.env.get("BTG_REDIRECT_URI")!;

  // Exchange code for tokens
  const tokenRes = await fetch(`${authBase}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
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

  // Upsert token in btg_tokens
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

  return new Response(
    `<html><body><h2>✅ Autorização BTG concluída!</h2><p>Empresa ${stateData.cod_empresa} conectada com sucesso. Você pode fechar esta janela.</p></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
}

// ─── ACTION: refresh ─────────────────────────────────────────
// Refresh an expired token for a given cod_empresa
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

  const { authBase } = getBtgUrls();
  const clientId = Deno.env.get("BTG_CLIENT_ID")!;
  const clientSecret = Deno.env.get("BTG_CLIENT_SECRET")!;

  const tokenRes = await fetch(`${authBase}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
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
// Check token status for all or specific empresa
async function handleStatus(req: Request) {
  const userId = requireAdmin(req);
  await checkAdmin(userId);

  const url = new URL(req.url);
  const codEmpresa = url.searchParams.get("cod_empresa");

  const db = getServiceClient();

  // Get all btg accounts
  let query = db.from("btg_contas_bancarias").select("*");
  if (codEmpresa) query = query.eq("cod_empresa", Number(codEmpresa));
  const { data: contas } = await query;

  // Get all tokens
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

    // callback is a GET from BTG redirect — no auth needed
    if (path === "callback" || url.searchParams.has("code")) {
      return await handleCallback(req);
    }

    // Parse action from body or query
    let action = url.searchParams.get("action") || "";
    if (!action && req.method === "POST") {
      // Try to peek at body for action field
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
