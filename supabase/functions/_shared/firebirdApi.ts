/**
 * Helper para autenticação e requisições à API Firebird
 */

const FIREBIRD_API_BASE_URL = Deno.env.get('FIREBIRD_API_BASE_URL')!;
const FIREBIRD_API_EMAIL = Deno.env.get('FIREBIRD_API_EMAIL')!;
const FIREBIRD_API_PASSWORD = Deno.env.get('FIREBIRD_API_PASSWORD')!;

/**
 * Autentica na API Firebird e retorna o token JWT
 * Em produção, considere cachear o token em memória/KV
 */
export async function getFirebirdApiToken(): Promise<string> {
  console.log('=== DIAGNÓSTICO AUTH FIREBIRD (NextAuth) ===');
  console.log('Base URL:', FIREBIRD_API_BASE_URL);
  console.log('Email:', FIREBIRD_API_EMAIL ? `${FIREBIRD_API_EMAIL.substring(0, 5)}...` : 'NÃO DEFINIDO');
  
  // PASSO 1: Obter CSRF Token
  const csrfUrl = `${FIREBIRD_API_BASE_URL}/api/auth/csrf`;
  console.log('1️⃣ Buscando CSRF token em:', csrfUrl);
  
  const csrfRes = await fetch(csrfUrl, {
    method: "GET",
    headers: { "Accept": "application/json" },
  });
  
  if (!csrfRes.ok) {
    const text = await csrfRes.text();
    console.error("Erro ao obter CSRF:", csrfRes.status, text.slice(0, 300));
    throw new Error(`Erro ao obter CSRF token: ${csrfRes.status}`);
  }
  
  const csrfData = await csrfRes.json();
  const csrfToken = csrfData.csrfToken;
  console.log('✅ CSRF Token obtido:', csrfToken ? csrfToken.substring(0, 10) + '...' : 'NÃO ENCONTRADO');
  
  if (!csrfToken) {
    throw new Error("CSRF token não retornado pela API");
  }
  
  // Capturar cookies da resposta CSRF
  const csrfCookies = csrfRes.headers.get('set-cookie') || '';
  console.log('🍪 Cookies CSRF recebidos:', csrfCookies ? 'SIM' : 'NÃO');
  
  // PASSO 2: Fazer login com credentials
  const callbackUrl = `${FIREBIRD_API_BASE_URL}/api/auth/callback/credentials`;
  console.log('2️⃣ Fazendo login em:', callbackUrl);
  
  const loginRes = await fetch(callbackUrl, {
    method: "POST",
    headers: { 
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": csrfCookies,
    },
    body: new URLSearchParams({
      csrfToken: csrfToken,
      email: FIREBIRD_API_EMAIL,
      password: FIREBIRD_API_PASSWORD,
      json: "true",
    }).toString(),
    redirect: 'manual',
  });
  
  console.log('📊 Login Status:', loginRes.status);
  
  const loginText = await loginRes.text();
  const loginContentType = loginRes.headers.get("content-type") || "";
  console.log('📄 Login Content-Type:', loginContentType);
  console.log('📝 Login Response (início):', loginText.slice(0, 500));
  
  // Capturar session cookies
  const sessionCookies = loginRes.headers.get('set-cookie') || '';
  console.log('🍪 Session Cookies:', sessionCookies ? sessionCookies.slice(0, 200) + '...' : 'NENHUM');
  
  // NextAuth pode retornar JSON com o token ou usar session cookies
  if (loginContentType.includes("application/json")) {
    try {
      const loginJson = JSON.parse(loginText);
      console.log('📦 JSON de resposta:', loginJson);
      
      const token = loginJson.token ?? loginJson.accessToken ?? loginJson.jwt ?? loginJson.data?.token;
      if (token) {
        console.log('✅ Token obtido do JSON!');
        return token;
      }
    } catch (e) {
      console.error("Erro ao parsear JSON de login:", e);
    }
  }
  
  // Tentar extrair session token dos cookies
  const sessionMatch = sessionCookies.match(/next-auth\.session-token=([^;]+)/);
  if (sessionMatch) {
    console.log('✅ Session token extraído dos cookies!');
    return sessionMatch[1];
  }
  
  // Também tentar __Secure-next-auth.session-token
  const secureSessionMatch = sessionCookies.match(/__Secure-next-auth\.session-token=([^;]+)/);
  if (secureSessionMatch) {
    console.log('✅ Secure session token extraído dos cookies!');
    return secureSessionMatch[1];
  }
  
  console.error('❌ Não foi possível obter token. Resposta completa:', {
    status: loginRes.status,
    headers: Object.fromEntries(loginRes.headers.entries()),
    body: loginText,
  });
  
  throw new Error("Não foi possível obter token de sessão do NextAuth");
}

/**
 * Faz uma requisição GET autenticada na API Firebird
 */
export async function firebirdGet(path: string, params: Record<string, any> = {}) {
  const token = await getFirebirdApiToken();

  const url = new URL(path, FIREBIRD_API_BASE_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("Erro Firebird GET:", url.toString(), res.status, body);
    throw new Error(`Erro Firebird GET ${path}: ${res.status}`);
  }

  return res.json();
}
