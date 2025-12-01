/**
 * Helper para autenticação e requisições à API Firebird
 * Implementa fluxo completo NextAuth.js com CSRF + callback/credentials
 */

const FIREBIRD_API_BASE_URL = Deno.env.get('FIREBIRD_API_BASE_URL')!;
const FIREBIRD_API_EMAIL = Deno.env.get('FIREBIRD_API_EMAIL')!;
const FIREBIRD_API_PASSWORD = Deno.env.get('FIREBIRD_API_PASSWORD')!;

// Cache para cookies de sessão (evita re-autenticação a cada request)
let cachedSessionCookies: string | null = null;
let cacheExpiry: number = 0;

/**
 * Extrai cookies da resposta HTTP
 */
function extractCookies(response: Response): string[] {
  const cookies: string[] = [];
  const setCookieHeaders = response.headers.getSetCookie?.() || [];
  
  // Fallback para headers.get se getSetCookie não estiver disponível
  if (setCookieHeaders.length === 0) {
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      // Split múltiplos cookies (separados por vírgula, mas cuidado com datas)
      const parts = setCookie.split(/,(?=\s*[^;]+=[^;]+)/);
      parts.forEach(part => {
        const cookiePart = part.trim().split(';')[0];
        if (cookiePart) cookies.push(cookiePart);
      });
    }
  } else {
    setCookieHeaders.forEach(cookie => {
      const cookiePart = cookie.split(';')[0];
      if (cookiePart) cookies.push(cookiePart);
    });
  }
  
  return cookies;
}

/**
 * Combina cookies em uma string para o header Cookie
 */
function combineCookies(cookies: string[]): string {
  return cookies.join('; ');
}

/**
 * Passo 1: Obter CSRF token da página de signin
 */
async function getCSRFToken(): Promise<{ csrfToken: string; cookies: string[] }> {
  console.log('=== PASSO 1: Obtendo CSRF Token ===');
  
  // Primeiro, tenta o endpoint /api/auth/csrf
  const csrfUrl = `${FIREBIRD_API_BASE_URL}/api/auth/csrf`;
  console.log('Tentando:', csrfUrl);
  
  const csrfRes = await fetch(csrfUrl, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  });
  
  console.log('CSRF Response Status:', csrfRes.status);
  const cookies = extractCookies(csrfRes);
  console.log('Cookies recebidos:', cookies.length);
  
  const contentType = csrfRes.headers.get('content-type') || '';
  
  if (contentType.includes('application/json')) {
    const data = await csrfRes.json();
    console.log('CSRF JSON response:', JSON.stringify(data).slice(0, 200));
    if (data.csrfToken) {
      return { csrfToken: data.csrfToken, cookies };
    }
  }
  
  // Se não retornou JSON, tenta extrair do HTML
  const html = await csrfRes.text();
  console.log('CSRF HTML (primeiros 500 chars):', html.slice(0, 500));
  
  // Tenta extrair csrfToken de input hidden ou de script
  const csrfMatch = html.match(/name="csrfToken"\s+value="([^"]+)"/) ||
                    html.match(/csrfToken['":\s]+['"]([^'"]+)['"]/) ||
                    html.match(/"csrfToken":"([^"]+)"/);
  
  if (csrfMatch) {
    console.log('CSRF Token extraído do HTML:', csrfMatch[1].slice(0, 20) + '...');
    return { csrfToken: csrfMatch[1], cookies };
  }
  
  // Tenta extrair do cookie csrf-token
  const csrfCookie = cookies.find(c => c.includes('csrf-token'));
  if (csrfCookie) {
    const tokenMatch = csrfCookie.match(/=([^;|%]+)/);
    if (tokenMatch) {
      console.log('CSRF Token do cookie:', tokenMatch[1].slice(0, 20) + '...');
      return { csrfToken: tokenMatch[1], cookies };
    }
  }
  
  throw new Error('Não foi possível obter CSRF token');
}

/**
 * Passo 2: Autenticar via callback/credentials
 */
async function authenticateWithCredentials(csrfToken: string, initialCookies: string[]): Promise<string[]> {
  console.log('=== PASSO 2: Autenticando com Credentials ===');
  
  const callbackUrl = `${FIREBIRD_API_BASE_URL}/api/auth/callback/credentials`;
  console.log('URL:', callbackUrl);
  
  // NextAuth espera form-urlencoded ou JSON dependendo da config
  const formData = new URLSearchParams();
  formData.append('email', FIREBIRD_API_EMAIL);
  formData.append('password', FIREBIRD_API_PASSWORD);
  formData.append('csrfToken', csrfToken);
  formData.append('callbackUrl', FIREBIRD_API_BASE_URL);
  formData.append('json', 'true');
  
  const cookieHeader = combineCookies(initialCookies);
  console.log('Enviando cookies:', cookieHeader.slice(0, 100) + '...');
  
  const res = await fetch(callbackUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json, text/html',
      'Cookie': cookieHeader,
    },
    body: formData.toString(),
    redirect: 'manual', // Importante: não seguir redirects automaticamente
  });
  
  console.log('Callback Response Status:', res.status);
  console.log('Location header:', res.headers.get('location'));
  
  const newCookies = extractCookies(res);
  console.log('Novos cookies recebidos:', newCookies.length);
  
  // Combina cookies iniciais com novos
  const allCookies = [...initialCookies];
  newCookies.forEach(newCookie => {
    const cookieName = newCookie.split('=')[0];
    const existingIndex = allCookies.findIndex(c => c.startsWith(cookieName + '='));
    if (existingIndex >= 0) {
      allCookies[existingIndex] = newCookie;
    } else {
      allCookies.push(newCookie);
    }
  });
  
  // Verifica se recebeu session token
  const hasSessionToken = allCookies.some(c => 
    c.includes('session-token') || 
    c.includes('next-auth.session')
  );
  
  if (!hasSessionToken) {
    // Tenta também com JSON body
    console.log('Tentando com JSON body...');
    const jsonRes = await fetch(callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Cookie': cookieHeader,
      },
      body: JSON.stringify({
        email: FIREBIRD_API_EMAIL,
        password: FIREBIRD_API_PASSWORD,
        csrfToken: csrfToken,
        callbackUrl: FIREBIRD_API_BASE_URL,
        json: true,
      }),
      redirect: 'manual',
    });
    
    console.log('JSON Callback Status:', jsonRes.status);
    const jsonCookies = extractCookies(jsonRes);
    console.log('JSON Cookies:', jsonCookies.length);
    
    jsonCookies.forEach(newCookie => {
      const cookieName = newCookie.split('=')[0];
      const existingIndex = allCookies.findIndex(c => c.startsWith(cookieName + '='));
      if (existingIndex >= 0) {
        allCookies[existingIndex] = newCookie;
      } else {
        allCookies.push(newCookie);
      }
    });
    
    // Log da resposta JSON se houver
    const contentType = jsonRes.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const jsonData = await jsonRes.json();
      console.log('JSON Response:', JSON.stringify(jsonData).slice(0, 500));
    }
  }
  
  console.log('Total de cookies após auth:', allCookies.length);
  return allCookies;
}

/**
 * Obtém cookies de sessão autenticados (com cache)
 */
export async function getAuthenticatedSession(): Promise<string> {
  // Verifica cache
  if (cachedSessionCookies && Date.now() < cacheExpiry) {
    console.log('Usando sessão em cache');
    return cachedSessionCookies;
  }
  
  console.log('=== INICIANDO AUTENTICAÇÃO NEXTAUTH ===');
  console.log('URL Base:', FIREBIRD_API_BASE_URL);
  console.log('Email:', FIREBIRD_API_EMAIL);
  
  try {
    // Passo 1: Obter CSRF token
    const { csrfToken, cookies: csrfCookies } = await getCSRFToken();
    
    // Passo 2: Autenticar
    const sessionCookies = await authenticateWithCredentials(csrfToken, csrfCookies);
    
    // Cache por 30 minutos
    cachedSessionCookies = combineCookies(sessionCookies);
    cacheExpiry = Date.now() + (30 * 60 * 1000);
    
    console.log('✅ Sessão autenticada com sucesso!');
    return cachedSessionCookies;
    
  } catch (error) {
    console.error('❌ Erro na autenticação NextAuth:', error);
    throw error;
  }
}

/**
 * Faz uma requisição GET autenticada na API Firebird
 */
export async function firebirdGet(path: string, params: Record<string, any> = {}) {
  const sessionCookies = await getAuthenticatedSession();

  const url = new URL(path, FIREBIRD_API_BASE_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });

  console.log('Firebird GET:', url.toString());

  const res = await fetch(url.toString(), {
    headers: {
      'Cookie': sessionCookies,
      'Accept': 'application/json',
    },
  });

  console.log('Response Status:', res.status);
  
  if (!res.ok) {
    const body = await res.text();
    console.error('Erro Firebird GET:', url.toString(), res.status, body.slice(0, 500));
    
    // Se receber 401/403, limpa cache e tenta novamente
    if (res.status === 401 || res.status === 403) {
      console.log('Sessão expirada, re-autenticando...');
      cachedSessionCookies = null;
      cacheExpiry = 0;
      
      const newSession = await getAuthenticatedSession();
      const retryRes = await fetch(url.toString(), {
        headers: {
          'Cookie': newSession,
          'Accept': 'application/json',
        },
      });
      
      if (!retryRes.ok) {
        const retryBody = await retryRes.text();
        throw new Error(`Erro Firebird GET ${path}: ${retryRes.status} - ${retryBody.slice(0, 200)}`);
      }
      
      return retryRes.json();
    }
    
    throw new Error(`Erro Firebird GET ${path}: ${res.status}`);
  }

  return res.json();
}

// Mantém compatibilidade com código antigo
export async function getFirebirdApiToken(): Promise<string> {
  // Retorna a sessão de cookies (não é um token JWT, mas serve para autenticar)
  return getAuthenticatedSession();
}
