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
  const res = await fetch(`${FIREBIRD_API_BASE_URL}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: FIREBIRD_API_EMAIL,
      password: FIREBIRD_API_PASSWORD,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("Erro auth Firebird API:", res.status, body);
    throw new Error(`Erro ao autenticar na API Firebird: ${res.status}`);
  }

  const json = await res.json();
  // Ajuste conforme a propriedade retornada (token, accessToken, jwt, etc.)
  const token = json.token ?? json.accessToken ?? json.jwt;
  if (!token) {
    throw new Error("Resposta da API Firebird não contém token");
  }
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
