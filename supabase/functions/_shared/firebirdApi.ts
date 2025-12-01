/**
 * Helper para autenticação e requisições à API Firebird
 */

const FIREBIRD_API_BASE_URL = Deno.env.get('FIREBIRD_API_BASE_URL')!;
const FIREBIRD_API_EMAIL = Deno.env.get('FIREBIRD_API_EMAIL')!;
const FIREBIRD_API_PASSWORD = Deno.env.get('FIREBIRD_API_PASSWORD')!;

/**
 * Autentica na API Firebird e retorna o token JWT
 */
export async function getFirebirdApiToken(): Promise<string> {
  console.log('=== AUTH FIREBIRD API ===');
  console.log('URL:', FIREBIRD_API_BASE_URL);
  console.log('Email:', FIREBIRD_API_EMAIL);
  
  const loginUrl = `${FIREBIRD_API_BASE_URL}/api/auth/signin`;
  console.log('Fazendo login em:', loginUrl);
  
  const res = await fetch(loginUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      email: FIREBIRD_API_EMAIL,
      password: FIREBIRD_API_PASSWORD,
    }),
  });

  console.log('Status:', res.status);
  const contentType = res.headers.get('content-type') ?? '';
  console.log('Content-Type:', contentType);
  
  const text = await res.text();
  console.log('Response Body (primeiros 500 chars):', text.slice(0, 500));
  
  // Verifica se a resposta é JSON
  if (!res.ok || !contentType.includes('application/json')) {
    console.error("Erro autenticando API Firebird:", res.status, text.slice(0, 300));
    throw new Error(`Falha ao autenticar API Firebird: ${res.status} - resposta não é JSON`);
  }

  let data;
  try {
    data = JSON.parse(text);
    console.log('Response JSON:', JSON.stringify(data).slice(0, 500));
  } catch (e) {
    console.error("Resposta não é JSON válido:", text.slice(0, 1000));
    throw new Error("API retornou resposta inválida (não JSON)");
  }
  
  // Tenta extrair o token de diferentes formatos possíveis
  const token = 
    data.token || 
    data.accessToken || 
    data.jwt || 
    data.data?.token ||
    data.data?.accessToken;

  if (!token) {
    console.error("Resposta JSON não contém token:", data);
    throw new Error("API Firebird retornou JSON sem token");
  }

  console.log('✅ Token obtido com sucesso!');
  return token;
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

  console.log('Firebird GET:', url.toString());

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("Erro Firebird GET:", url.toString(), res.status, body.slice(0, 500));
    throw new Error(`Erro Firebird GET ${path}: ${res.status}`);
  }

  return res.json();
}
