/**
 * Helper para autenticação e requisições à API Firebird
 */

const FIREBIRD_API_BASE_URL = Deno.env.get('FIREBIRD_API_BASE_URL')!;
const FIREBIRD_API_EMAIL = Deno.env.get('FIREBIRD_API_EMAIL')!;
const FIREBIRD_API_PASSWORD = Deno.env.get('FIREBIRD_API_PASSWORD')!;

/**
 * Autentica na API Firebird e retorna o token JWT
 * Usa o endpoint /api/auth/signin conforme documentação
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
  console.log('Content-Type:', res.headers.get('content-type'));
  
  const text = await res.text();
  console.log('Response Body (primeiros 500 chars):', text.slice(0, 500));
  
  if (!res.ok) {
    console.error("Erro no login:", res.status, text);
    throw new Error(`Erro ao autenticar na API Firebird: ${res.status}`);
  }

  let data;
  try {
    data = JSON.parse(text);
    console.log('Response JSON:', data);
  } catch (e) {
    console.error("Resposta não é JSON válido:", text.slice(0, 1000));
    throw new Error("API retornou resposta inválida (não JSON)");
  }
  
  if (!data.success || !data.token) {
    console.error("Login falhou ou token não retornado:", data);
    throw new Error("Falha na autenticação: " + (data.message || "Token não retornado"));
  }

  console.log('✅ Token obtido com sucesso!');
  return data.token;
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
