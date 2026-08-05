// Proxy para as APIs EXTC da Cielo (Extrato Eletronico).
//
// Autenticacao em duas camadas, conforme "Integracao com as APIs do EXTC":
//   1. TLS mutuo — certificado .cer assinado pela Cielo + chave privada .key
//   2. OAuth2 client_credentials — client_id / client_secret do portal
//
// AVISO IMPORTANTE SOBRE mTLS
// ---------------------------
// O runtime de Edge Functions do Supabase nao expoe `Deno.createHttpClient` de
// forma estavel. Quando ele nao esta disponivel, nao existe forma de apresentar
// o certificado do cliente no handshake e a Cielo responde 401 {"error":"missing"}.
// Esta funcao detecta a situacao e devolve um diagnostico explicito
// (MTLS_NAO_SUPORTADO) em vez de falhar com um erro generico de rede — assim a
// tela de Adquirentes consegue orientar a alternativa (importacao do arquivo).
//
// Secrets esperados:
//   CIELO_CLIENT_ID          client_id do portal Cielo Desenvolvedores
//   CIELO_CLIENT_SECRET      client_secret
//   CIELO_MTLS_CERT          conteudo PEM do .cer assinado pela Cielo
//   CIELO_MTLS_KEY           conteudo PEM da chave privada .key
//   CIELO_EXTC_DOWNLOAD_PATH (opcional) caminho do recurso de download; o manual
//                            publico do EXTC cobre apenas a autenticacao, entao
//                            o caminho fica configuravel para nao travar o
//                            deploy enquanto a Cielo nao confirma a rota.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AMBIENTES = {
  sandbox: {
    host: "https://apihml-internet.cielo.com.br",
    tokenUrl:
      "https://apihml-internet.cielo.com.br/cielo-security-sys-web-hml/oauth/v2/MulesoftHML/protocol/openid-connect/token",
  },
  production: {
    host: "https://api-internet.cielo.com.br",
    tokenUrl:
      "https://api-internet.cielo.com.br/cielo-security-sys-web/oauth/v2/MulesoftPRD/protocol/openid-connect/token",
  },
} as const;

type Ambiente = keyof typeof AMBIENTES;

const DOWNLOAD_PATH_PADRAO = "/extrato-eletronico/v1/arquivos";

/** Tipos de arquivo tratados nesta entrega (tabela I do manual v15). */
const TIPOS_SUPORTADOS = new Set(["03", "04", "16"]);

// ---------------------------------------------------------------------------
// mTLS
// ---------------------------------------------------------------------------

interface ClienteMtls {
  disponivel: boolean;
  motivo?: string;
  // Deno.HttpClient quando disponivel; repassado ao fetch via `client`.
  client?: unknown;
}

let clienteMtlsCache: ClienteMtls | null = null;

function normalizaPem(valor: string): string {
  // Secrets colados na UI do Supabase frequentemente chegam com "\n" literal.
  return valor.replace(/\\n/g, "\n").trim() + "\n";
}

function obterClienteMtls(): ClienteMtls {
  if (clienteMtlsCache) return clienteMtlsCache;

  const cert = Deno.env.get("CIELO_MTLS_CERT");
  const key = Deno.env.get("CIELO_MTLS_KEY");

  if (!cert || !key) {
    clienteMtlsCache = {
      disponivel: false,
      motivo:
        "CIELO_MTLS_CERT e/ou CIELO_MTLS_KEY nao configurados. A Cielo exige TLS mutuo em todas as chamadas do EXTC.",
    };
    return clienteMtlsCache;
  }

  const criar = (Deno as unknown as { createHttpClient?: (o: unknown) => unknown })
    .createHttpClient;

  if (typeof criar !== "function") {
    clienteMtlsCache = {
      disponivel: false,
      motivo:
        "Deno.createHttpClient indisponivel neste runtime — nao e possivel apresentar o certificado do cliente. Use a importacao do arquivo de extrato ate que o runtime suporte mTLS.",
    };
    return clienteMtlsCache;
  }

  try {
    const client = criar({ cert: normalizaPem(cert), key: normalizaPem(key) });
    clienteMtlsCache = { disponivel: true, client };
  } catch (e) {
    clienteMtlsCache = {
      disponivel: false,
      motivo: `Falha ao montar o cliente mTLS: ${(e as Error).message}`,
    };
  }
  return clienteMtlsCache;
}

/** fetch com o certificado do cliente anexado, quando o runtime permitir. */
async function fetchMtls(url: string, init: RequestInit): Promise<Response> {
  const mtls = obterClienteMtls();
  if (!mtls.disponivel) {
    const err = new Error(mtls.motivo!) as Error & { code?: string };
    err.code = "MTLS_NAO_SUPORTADO";
    throw err;
  }
  return await fetch(url, { ...init, client: mtls.client } as RequestInit);
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

const tokenCache = new Map<Ambiente, { token: string; expiraEm: number }>();

async function obterToken(ambiente: Ambiente): Promise<string> {
  const cache = tokenCache.get(ambiente);
  if (cache && Date.now() < cache.expiraEm - 60_000) return cache.token;

  const clientId = Deno.env.get("CIELO_CLIENT_ID");
  const clientSecret = Deno.env.get("CIELO_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    const err = new Error("CIELO_CLIENT_ID ou CIELO_CLIENT_SECRET nao configurados.") as Error & { code?: string };
    err.code = "CREDENCIAIS_AUSENTES";
    throw err;
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
  });

  const res = await fetchMtls(AMBIENTES[ambiente].tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const texto = await res.text();

  if (!res.ok) {
    console.error(`[cielo-extc] token ${res.status}:`, texto.slice(0, 300));
    const err = new Error(`Falha ao obter token: ${res.status} ${texto.slice(0, 200)}`) as Error & {
      code?: string;
      status?: number;
    };
    err.status = res.status;
    // O manual do EXTC documenta este caso: 401 com "missing" significa que o
    // certificado mTLS nao chegou ao servidor.
    err.code = res.status === 401 && texto.includes("missing")
      ? "MTLS_NAO_APRESENTADO"
      : "TOKEN_ERRO";
    throw err;
  }

  const dados = JSON.parse(texto);
  const expiresIn = Number(dados.expires_in) || 3600;
  tokenCache.set(ambiente, {
    token: dados.access_token,
    expiraEm: Date.now() + expiresIn * 1000,
  });
  return dados.access_token;
}

// ---------------------------------------------------------------------------
// Download do extrato
// ---------------------------------------------------------------------------

interface ParamsDownload {
  ambiente: Ambiente;
  tipoArquivo: string;
  estabelecimentoMatriz: string;
  documento?: string;
  data?: string;
}

async function baixarExtrato(p: ParamsDownload): Promise<{
  conteudoBase64: string;
  nomeArquivo: string;
  bytes: number;
}> {
  if (!TIPOS_SUPORTADOS.has(p.tipoArquivo)) {
    throw new Error(
      `tipo_arquivo "${p.tipoArquivo}" fora do escopo desta integracao (suportados: 03, 04, 16).`,
    );
  }

  const token = await obterToken(p.ambiente);
  const path = Deno.env.get("CIELO_EXTC_DOWNLOAD_PATH") || DOWNLOAD_PATH_PADRAO;

  const qs = new URLSearchParams({
    tipoArquivo: p.tipoArquivo,
    estabelecimento: p.estabelecimentoMatriz,
  });
  if (p.data) qs.set("data", p.data);
  if (p.documento) qs.set("documento", p.documento);

  const url = `${AMBIENTES[p.ambiente].host}${path}?${qs.toString()}`;
  console.log(`[cielo-extc] GET ${url}`);

  const res = await fetchMtls(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "*/*" },
  });

  // Os bytes seguem crus ate o parser: o arquivo e latin-1, e decodificar aqui
  // como texto trocaria acentos por U+FFFD antes que alguem pudesse notar — e
  // mudaria o hash usado para deduplicar importacoes.
  const bytes = new Uint8Array(await res.arrayBuffer());

  if (!res.ok) {
    const amostra = new TextDecoder("iso-8859-1").decode(bytes.slice(0, 300));
    console.error(`[cielo-extc] download ${res.status}:`, amostra);
    const err = new Error(
      `Download do extrato falhou: ${res.status} ${amostra.slice(0, 200)}`,
    ) as Error & { code?: string; status?: number };
    err.status = res.status;
    err.code = res.status === 404 ? "ARQUIVO_NAO_ENCONTRADO" : "DOWNLOAD_ERRO";
    throw err;
  }

  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    // Fatiado para nao estourar o limite de argumentos do apply em arquivos grandes.
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }

  const dataRef = (p.data || new Date().toISOString().slice(0, 10)).replace(/-/g, "");
  return {
    conteudoBase64: btoa(bin),
    nomeArquivo: `CIELO${p.tipoArquivo}_${p.estabelecimentoMatriz}_${dataRef}.txt`,
    bytes: bytes.length,
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action } = body;
    const ambiente: Ambiente = body.ambiente === "production" ? "production" : "sandbox";

    if (!action) throw new Error("action e obrigatorio");

    let resultado: unknown;

    switch (action) {
      case "health": {
        const mtls = obterClienteMtls();
        if (!mtls.disponivel) {
          resultado = {
            ok: false,
            status: "MTLS_INDISPONIVEL",
            ambiente,
            error: mtls.motivo,
            error_code: "MTLS_NAO_SUPORTADO",
            fallback: "IMPORTACAO_ARQUIVO",
          };
          break;
        }
        try {
          await obterToken(ambiente);
          resultado = { ok: true, status: "ATIVA", ambiente };
        } catch (e) {
          const err = e as Error & { code?: string; status?: number };
          resultado = {
            ok: false,
            status: err.code === "MTLS_NAO_APRESENTADO" ? "MTLS_REJEITADO" : "ERRO_TOKEN",
            ambiente,
            error: err.message,
            error_code: err.code || "TOKEN_ERRO",
            http_status: err.status,
            fallback: "IMPORTACAO_ARQUIVO",
          };
        }
        break;
      }

      case "baixar_extrato": {
        if (!body.tipo_arquivo) throw new Error("tipo_arquivo e obrigatorio (03, 04 ou 16)");
        if (!body.estabelecimento_matriz) throw new Error("estabelecimento_matriz e obrigatorio");
        resultado = await baixarExtrato({
          ambiente,
          tipoArquivo: String(body.tipo_arquivo),
          estabelecimentoMatriz: String(body.estabelecimento_matriz),
          documento: body.documento ? String(body.documento) : undefined,
          data: body.data ? String(body.data) : undefined,
        });
        break;
      }

      case "diagnostico": {
        const mtls = obterClienteMtls();
        resultado = {
          ambiente,
          host: AMBIENTES[ambiente].host,
          token_url: AMBIENTES[ambiente].tokenUrl,
          download_path: Deno.env.get("CIELO_EXTC_DOWNLOAD_PATH") || DOWNLOAD_PATH_PADRAO,
          mtls_disponivel: mtls.disponivel,
          mtls_motivo: mtls.motivo ?? null,
          tem_client_id: Boolean(Deno.env.get("CIELO_CLIENT_ID")),
          tem_client_secret: Boolean(Deno.env.get("CIELO_CLIENT_SECRET")),
          tem_cert: Boolean(Deno.env.get("CIELO_MTLS_CERT")),
          tem_key: Boolean(Deno.env.get("CIELO_MTLS_KEY")),
        };
        break;
      }

      default:
        throw new Error(
          `Action '${action}' nao suportada. Use: health, baixar_extrato, diagnostico`,
        );
    }

    return new Response(JSON.stringify(resultado), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const e = err as Error & { code?: string; status?: number };
    console.error("[cielo-extc] Error:", e);
    return new Response(
      JSON.stringify({
        error: e.message,
        error_code: e.code || "CIELO_INTERNO",
        http_status: e.status,
        fallback: e.code?.startsWith("MTLS") ? "IMPORTACAO_ARQUIVO" : undefined,
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
