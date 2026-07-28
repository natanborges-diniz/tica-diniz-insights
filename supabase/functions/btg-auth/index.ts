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

// ─── Identidade da empresa (anti-cross-authorization) ────────
// Garante que o CNPJ que fez login no BTG é o mesmo da empresa
// carregada no `state`. Sem isso, autorizar a loja errada grava
// token cruzado silenciosamente.

function onlyDigits(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).replace(/\D/g, "")
    : "";
}

/** Validação dos dígitos verificadores do CNPJ (mod 11). */
function isValidCnpj(digits: string): boolean {
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;
  const calc = (len: number) => {
    let soma = 0;
    let peso = len - 7;
    for (let i = 0; i < len; i++) {
      soma += Number(digits[i]) * peso;
      peso = peso - 1 < 2 ? 9 : peso - 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return calc(12) === Number(digits[12]) && calc(13) === Number(digits[13]);
}

/** Chaves cujo valor plausivelmente carrega o documento da empresa. */
const CNPJ_KEY_PATTERN = /cnpj|document|taxid|tax_id|federal|registration|identifier/i;

/**
 * Coleta candidatos a CNPJ. Um valor de 14 dígitos só entra se:
 *  - a chave sugere documento (ex.: `cnpj`, `documentNumber`, `taxId`), ou
 *  - os dígitos verificadores são válidos.
 * Isso evita que IDs numéricos aleatórios de 14 dígitos gerem falso mismatch.
 */
function collectCnpjCandidates(
  node: unknown,
  acc = new Set<string>(),
  depth = 0,
  key = "",
): Set<string> {
  if (depth > 6 || node == null) return acc;
  if (typeof node === "string" || typeof node === "number") {
    const digits = onlyDigits(node);
    if (digits.length === 14 && (CNPJ_KEY_PATTERN.test(key) || isValidCnpj(digits))) {
      acc.add(digits);
    }
    return acc;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectCnpjCandidates(item, acc, depth + 1, key);
    return acc;
  }
  if (typeof node === "object") {
    for (const [childKey, value] of Object.entries(node as Record<string, unknown>)) {
      collectCnpjCandidates(value, acc, depth + 1, childKey);
    }
  }
  return acc;
}

const COMPANY_ID_KEYS = [
  "companyId", "company_id", "companyID",
  "tenantId", "tenant_id",
  "organizationId", "organization_id",
];

/** Procura recursivamente uma chave de company_id conhecida. */
function findCompanyId(node: unknown, depth = 0): string | null {
  if (depth > 6 || node == null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findCompanyId(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  for (const key of COMPANY_ID_KEYS) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  for (const value of Object.values(obj)) {
    const found = findCompanyId(value, depth + 1);
    if (found) return found;
  }
  return null;
}

type VerificationStatus = "match" | "mismatch" | "inconclusive";

interface VerificationResult {
  status: VerificationStatus;
  companyId: string | null;
  motivo: string;
  cnpjEncontrados: string[];
}

/** CNPJ da empresa: btg_contas_bancarias tem precedência, empresa é fallback. */
async function getCnpjEsperado(codEmpresa: number): Promise<string | null> {
  const db = getServiceClient();
  const { data: conta } = await db
    .from("btg_contas_bancarias")
    .select("cnpj")
    .eq("cod_empresa", codEmpresa)
    .maybeSingle();
  if (conta?.cnpj) return onlyDigits(conta.cnpj);

  const { data: emp } = await db
    .from("empresa")
    .select("cnpj")
    .eq("cod_empresa", codEmpresa)
    .maybeSingle();
  return emp?.cnpj ? onlyDigits(emp.cnpj) : null;
}

/**
 * Verifica se o token recém-emitido pertence de fato ao CNPJ esperado.
 *
 * Estratégia em camadas:
 *  1. Decodifica access_token / id_token e procura o CNPJ nas claims.
 *  2. Se as claims não forem conclusivas, chama /accounts do BTG usando o
 *     CNPJ esperado no path — 401/403 significa que o login não tem acesso.
 *
 * Fail-closed em divergência explícita; fail-open (com aviso) quando
 * nenhuma das camadas consegue decidir.
 */
async function verificarIdentidadeEmpresa(
  tokenData: Record<string, unknown>,
  cnpjEsperado: string | null,
  creds: BtgCredentials,
): Promise<VerificationResult> {
  if (!cnpjEsperado) {
    return {
      status: "inconclusive",
      companyId: null,
      motivo: "Empresa sem CNPJ cadastrado — impossível validar identidade.",
      cnpjEncontrados: [],
    };
  }

  // ── Camada 1: claims do JWT ────────────────────────────────
  const claimSources = [tokenData.access_token, tokenData.id_token]
    .filter((t): t is string => typeof t === "string")
    .map((t) => decodeJwtPayload(t))
    .filter((p): p is Record<string, unknown> => !!p);

  const candidatos = new Set<string>();
  let companyId: string | null = null;

  for (const payload of claimSources) {
    collectCnpjCandidates(payload, candidatos);
    companyId = companyId || findCompanyId(payload);
    console.log("[btg-auth][verify] claims disponíveis:", Object.keys(payload).join(", "));
  }

  if (candidatos.size > 0 && candidatos.has(cnpjEsperado)) {
    return {
      status: "match",
      companyId,
      motivo: "CNPJ confirmado nas claims do token BTG.",
      cnpjEncontrados: [...candidatos],
    };
  }
  // Se o token traz CNPJ diferente (ou nenhum), ainda pode ser um usuário
  // multi-empresa. Não rejeita aqui — segue para a camada 2 (chamada real
  // à API), que é a autoridade final: se o login BTG tem acesso ao CNPJ
  // esperado, aprova.

  // ── Camada 2: chamada real à API por CNPJ ──────────────────
  if (creds.isSandbox) {
    return {
      status: "inconclusive",
      companyId,
      motivo: "Ambiente sandbox — validação por API ignorada.",
      cnpjEncontrados: [],
    };
  }

  const accessToken = tokenData.access_token;
  if (typeof accessToken !== "string") {
    return {
      status: "inconclusive",
      companyId,
      motivo: "Resposta do BTG sem access_token utilizável para validação.",
      cnpjEncontrados: [],
    };
  }

  try {
    const res = await fetch(`${creds.apiBase}/${cnpjEsperado}/banking/accounts`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });

    if (res.status === 401 || res.status === 403) {
      return {
        status: "mismatch",
        companyId,
        motivo: `O BTG retornou ${res.status} ao acessar as contas do CNPJ ${cnpjEsperado} — o login autorizado não tem acesso a esta empresa.`,
        cnpjEncontrados: [],
      };
    }

    if (!res.ok) {
      return {
        status: "inconclusive",
        companyId,
        motivo: `Consulta de contas retornou HTTP ${res.status} — validação não conclusiva.`,
        cnpjEncontrados: [],
      };
    }

    const accounts = await res.json();
    console.log("[btg-auth][verify] /accounts keys:", JSON.stringify(Object.keys(accounts || {})));
    companyId = companyId || findCompanyId(accounts);

    return {
      status: "match",
      companyId,
      motivo: "Acesso às contas do CNPJ confirmado via API do BTG.",
      cnpjEncontrados: [cnpjEsperado],
    };
  } catch (e) {
    return {
      status: "inconclusive",
      companyId,
      motivo: `Falha de rede ao validar identidade: ${String(e)}`,
      cnpjEncontrados: [],
    };
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

  // Sem linha em btg_contas_bancarias o token ficaria órfão (a tela de status
  // lista a partir dessa tabela) e não haveria CNPJ para validar a identidade.
  const dbCheck = getServiceClient();
  const { data: contaExistente } = await dbCheck
    .from("btg_contas_bancarias")
    .select("cod_empresa")
    .eq("cod_empresa", cod_empresa)
    .maybeSingle();

  if (!contaExistente) {
    return json(
      { error: `Empresa ${cod_empresa} não possui conta BTG cadastrada. Use "Adicionar conta" antes de autorizar.` },
      400
    );
  }

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
    "brn:btg:empresas:receivables:credit-card.readonly",
    "brn:btg:empresas:receivables:credit-card",
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

  // ── Validação de identidade antes de persistir o token ─────
  const cnpjEsperado = await getCnpjEsperado(stateData.cod_empresa);
  const verificacao = await verificarIdentidadeEmpresa(tokenData, cnpjEsperado, creds);

  console.log(
    `[btg-auth][callback] empresa=${stateData.cod_empresa} cnpj=${cnpjEsperado} ` +
    `verificacao=${verificacao.status} motivo="${verificacao.motivo}" company_id=${verificacao.companyId}`
  );

  if (verificacao.status === "mismatch") {
    console.error("[btg-auth][callback] Autorização rejeitada:", verificacao.motivo);
    return new Response(
      `<html><head><meta charset="utf-8"></head><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#fef2f2"><div style="text-align:center;max-width:560px"><h2 style="color:#dc2626">❌ Autorização rejeitada</h2><p>O login BTG utilizado não corresponde à empresa selecionada. <strong>Nenhum token foi salvo.</strong></p><p style="color:#7f1d1d;font-size:14px">${verificacao.motivo}</p><p style="color:#64748b;font-size:13px">Volte ao sistema, confirme a empresa e refaça a autorização com as credenciais do CNPJ correto.</p></div></body></html>`,
      { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

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

  // ── Persistir company_id descoberto (usado nas chamadas multi-empresa) ──
  // Nas rotas Banking do BTG o identificador da empresa no path é o CNPJ sem
  // pontuação (ver btg-extrato: `${apiBase}/${cnpj}/banking/...`). Usamos um
  // companyId explícito quando o token/API expõe um; senão, o CNPJ.
  const companyIdFinal = verificacao.companyId || cnpjEsperado;

  const contaUpdate: Record<string, unknown> = {};
  if (companyIdFinal) contaUpdate.company_id = companyIdFinal;
  if (cnpjEsperado) contaUpdate.cnpj = cnpjEsperado;

  if (Object.keys(contaUpdate).length > 0) {
    const { error: contaError } = await db
      .from("btg_contas_bancarias")
      .update(contaUpdate)
      .eq("cod_empresa", stateData.cod_empresa);
    if (contaError) {
      console.error("[btg-auth][callback] Falha ao gravar company_id:", contaError.message);
    }
  }

  const avisoVerificacao = verificacao.status === "inconclusive"
    ? `<p style="color:#b45309;font-size:13px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:8px 12px">⚠️ Identidade não verificada: ${verificacao.motivo}</p>`
    : "";

  const redirectTarget = `${req.headers.get("origin") || "https://lens-data-vision.lovable.app"}/admin/btg-validacao?btg_callback=success&cod_empresa=${stateData.cod_empresa}&verificacao=${verificacao.status}`;

  return new Response(
    `<html><head><meta charset="utf-8"><meta http-equiv="refresh" content="3;url=${redirectTarget}"></head><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc"><div style="text-align:center;max-width:560px"><h2 style="color:#16a34a">✅ Autorização BTG concluída!</h2><p>Empresa ${stateData.cod_empresa} conectada com sucesso.</p>${avisoVerificacao}<p style="color:#64748b;font-size:14px">Redirecionando de volta ao sistema...</p><a href="${redirectTarget}" style="color:#2563eb">Clique aqui se não for redirecionado</a></div></body></html>`,
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
