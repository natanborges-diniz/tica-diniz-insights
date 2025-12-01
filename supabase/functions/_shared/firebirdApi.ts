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
  console.log('=== DIAGNÓSTICO AUTH FIREBIRD ===');
  console.log('Base URL:', FIREBIRD_API_BASE_URL);
  console.log('Email:', FIREBIRD_API_EMAIL ? `${FIREBIRD_API_EMAIL.substring(0, 5)}...` : 'NÃO DEFINIDO');
  console.log('Password:', FIREBIRD_API_PASSWORD ? '***DEFINIDO***' : 'NÃO DEFINIDO');
  
  const authUrl = `${FIREBIRD_API_BASE_URL}/api/auth/signin`;
  console.log('URL completa:', authUrl);

  const res = await fetch(authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: FIREBIRD_API_EMAIL,
      password: FIREBIRD_API_PASSWORD,
    }),
  });

  const text = await res.text();
  const contentType = res.headers.get("content-type") || "";

  console.log('Status HTTP:', res.status);
  console.log('Content-Type:', contentType);
  console.log('Resposta (início):', text.slice(0, 500));

  if (!res.ok) {
    console.error("Erro auth Firebird API:", res.status, text.slice(0, 500));
    throw new Error(`Erro ao autenticar na API Firebird: ${res.status}`);
  }

  if (!contentType.includes("application/json")) {
    console.error("Resposta NÃO JSON na auth Firebird:", {
      status: res.status,
      contentType,
      bodyInicio: text.slice(0, 500),
    });
    throw new Error("Firebird API retornou HTML/erro em vez de JSON na autenticação");
  }

  const json = JSON.parse(text);

  // Flexível com o nome do campo de token
  const token = json.token ?? json.accessToken ?? json.jwt ?? json.data?.token;
  
  if (!token) {
    console.error("Resposta JSON sem token:", json);
    throw new Error("Resposta da API Firebird não contém token");
  }

  console.log('Token obtido com sucesso!');
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
