/**
 * Helper para autenticação e requisições à API Firebird
 * Implementa autenticação JWT padrão (API v1)
 */

const FIREBIRD_API_BASE_URL = Deno.env.get('FIREBIRD_API_BASE_URL')!;
const FIREBIRD_API_EMAIL = Deno.env.get('FIREBIRD_API_EMAIL')!;
const FIREBIRD_API_PASSWORD = Deno.env.get('FIREBIRD_API_PASSWORD')!;

// Cache para token JWT
let cachedToken: string | null = null;
let tokenExpiry: number = 0;

/**
 * Autentica na API e obtém token JWT
 */
async function authenticate(): Promise<string> {
  console.log('=== Autenticando na API Firebird ===');
  console.log('URL Base:', FIREBIRD_API_BASE_URL);
  console.log('Email:', FIREBIRD_API_EMAIL);

  const authUrl = `${FIREBIRD_API_BASE_URL}/api/auth/token`;
  
  const res = await fetch(authUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      email: FIREBIRD_API_EMAIL,
      password: FIREBIRD_API_PASSWORD,
    }),
  });

  console.log('Auth Response Status:', res.status);

  if (!res.ok) {
    const body = await res.text();
    console.error('Erro na autenticação:', body.slice(0, 500));
    throw new Error(`Erro na autenticação: ${res.status} - ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  
  if (!data.token) {
    console.error('Resposta sem token:', JSON.stringify(data).slice(0, 500));
    throw new Error('Resposta de autenticação não contém token');
  }

  console.log('✅ Token JWT obtido com sucesso!');
  console.log('Expira em:', data.expiresIn || '24h');
  
  return data.token;
}

/**
 * Obtém token JWT (com cache)
 */
export async function getAuthToken(): Promise<string> {
  // Verifica cache (margem de 5 minutos antes de expirar)
  if (cachedToken && Date.now() < tokenExpiry - 5 * 60 * 1000) {
    console.log('Usando token em cache');
    return cachedToken;
  }

  const token = await authenticate();
  
  // Cache por 23 horas (token expira em 24h)
  cachedToken = token;
  tokenExpiry = Date.now() + 23 * 60 * 60 * 1000;

  return token;
}

/**
 * Limpa o cache do token (forçar re-autenticação)
 */
export function clearTokenCache(): void {
  cachedToken = null;
  tokenExpiry = 0;
}

/**
 * Faz uma requisição GET autenticada na API Firebird
 */
export async function firebirdGet(path: string, params: Record<string, any> = {}) {
  const token = await getAuthToken();

  const url = new URL(path, FIREBIRD_API_BASE_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });

  console.log('Firebird GET:', url.toString());

  const res = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
  });

  console.log('Response Status:', res.status);

  if (!res.ok) {
    const body = await res.text();
    console.error('Erro Firebird GET:', url.toString(), res.status, body.slice(0, 500));

    // Se receber 401/403, limpa cache e tenta novamente
    if (res.status === 401 || res.status === 403) {
      console.log('Token expirado, re-autenticando...');
      clearTokenCache();

      const newToken = await getAuthToken();
      const retryRes = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${newToken}`,
          'Accept': 'application/json',
        },
      });

      if (!retryRes.ok) {
        const retryBody = await retryRes.text();
        throw new Error(`Erro Firebird GET ${path}: ${retryRes.status} - ${retryBody.slice(0, 200)}`);
      }

      return retryRes.json();
    }

    throw new Error(`Erro Firebird GET ${path}: ${res.status} - ${body.slice(0, 200)}`);
  }

  return res.json();
}

/**
 * Faz uma requisição POST autenticada na API Firebird
 */
export async function firebirdPost(path: string, body: any) {
  const token = await getAuthToken();

  const url = `${FIREBIRD_API_BASE_URL}${path}`;
  console.log('Firebird POST:', url);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });

  console.log('Response Status:', res.status);

  if (!res.ok) {
    const responseBody = await res.text();
    console.error('Erro Firebird POST:', url, res.status, responseBody.slice(0, 500));
    throw new Error(`Erro Firebird POST ${path}: ${res.status} - ${responseBody.slice(0, 200)}`);
  }

  return res.json();
}

// Mantém compatibilidade com código antigo
export async function getFirebirdApiToken(): Promise<string> {
  return getAuthToken();
}

// Alias para manter compatibilidade
export async function getAuthenticatedSession(): Promise<string> {
  return getAuthToken();
}
