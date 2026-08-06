// Proxy para a API de Extrato Eletronico da Cielo (EXTC).
//
// Fluxo em tres passos, conforme "Consuma as APIs do Extrato Eletronico":
//   1. token OAuth2 (client_credentials) com client_id / client_secret
//   2. POST /link/generate assinado com HMAC no header X-Signature
//   3. download dos arquivos EDI nos links temporarios devolvidos
//
// A assinatura HMAC e o ponto delicado: a Cielo responde 401 "Invalid HMAC" se
// o corpo enviado diferir em UM byte do corpo assinado. Por isso o JSON e
// serializado UMA vez e a mesma string e usada para assinar e para enviar —
// nunca dois JSON.stringify do mesmo objeto, que podem divergir na ordem das
// chaves.
//
// Secrets:
//   CIELO_CLIENT_ID          client_id do portal Cielo Desenvolvedores
//   CIELO_CLIENT_SECRET      client_secret
//   CIELO_HMAC_KEY           chave HMAC ("Acessar chave da API" no portal)
//   CIELO_HMAC_ALGO          (opcional) SHA-256 (padrao), SHA-1 ou SHA-512
//   CIELO_HMAC_ENCODING      (opcional) hex (padrao) ou base64
//   CIELO_EXTC_LINK_PATH     (opcional) sobrescreve o caminho de /link/generate
//   CIELO_MTLS_CERT/KEY      (opcional) so se a Cielo exigir TLS mutuo tambem

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

const LINK_PATH_PADRAO =
  "/cielo-extc-serv-edi-linkexp-external/extc-serv-edi-link-external/v1/link/generate";

/**
 * Tipos de arquivo do layout v15 -> fileType da API.
 * A documentacao cita "3 = Vendas, 4 = Pagamentos, 9 = Saldo etc.", ou seja o
 * codigo sem o zero a esquerda usado no header do arquivo.
 */
const FILE_TYPE: Record<string, number> = { "03": 3, "04": 4, "09": 9, "15": 15, "16": 16 };

/** processType: D diario, R reprocessamento, M mensal. */
type ProcessType = "D" | "R" | "M";

// ---------------------------------------------------------------------------
// mTLS — opcional
// ---------------------------------------------------------------------------

let clienteMtls: { client?: unknown; motivo?: string } | null = null;

/**
 * A API de links autentica por token + HMAC. O certificado so entra se a Cielo
 * exigir TLS mutuo na conta — quando os secrets nao existem, a chamada segue
 * normal, sem cliente customizado.
 */
function obterClienteMtls(): { client?: unknown; motivo?: string } {
  if (clienteMtls) return clienteMtls;

  const cert = Deno.env.get("CIELO_MTLS_CERT");
  const key = Deno.env.get("CIELO_MTLS_KEY");
  if (!cert || !key) {
    clienteMtls = { motivo: "nao configurado (opcional)" };
    return clienteMtls;
  }

  const criar = (Deno as unknown as { createHttpClient?: (o: unknown) => unknown })
    .createHttpClient;
  if (typeof criar !== "function") {
    clienteMtls = { motivo: "Deno.createHttpClient indisponivel neste runtime" };
    return clienteMtls;
  }

  try {
    const pem = (v: string) => v.replace(/\\n/g, "\n").trim() + "\n";
    clienteMtls = { client: criar({ cert: pem(cert), key: pem(key) }) };
  } catch (e) {
    clienteMtls = { motivo: `falha ao montar cliente mTLS: ${(e as Error).message}` };
  }
  return clienteMtls;
}

function fetchCielo(url: string, init: RequestInit): Promise<Response> {
  const mtls = obterClienteMtls();
  return mtls.client
    ? fetch(url, { ...init, client: mtls.client } as RequestInit)
    : fetch(url, init);
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

  const res = await fetchCielo(AMBIENTES[ambiente].tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }).toString(),
  });

  const texto = await res.text();
  if (!res.ok) {
    console.error(`[cielo-extc] token ${res.status}:`, texto.slice(0, 300));
    const err = new Error(`Falha ao obter token: ${res.status} ${texto.slice(0, 200)}`) as Error & {
      code?: string; status?: number;
    };
    err.status = res.status;
    err.code = res.status === 401 && texto.includes("missing") ? "MTLS_NAO_APRESENTADO" : "TOKEN_ERRO";
    throw err;
  }

  const dados = JSON.parse(texto);
  tokenCache.set(ambiente, {
    token: dados.access_token,
    expiraEm: Date.now() + (Number(dados.expires_in) || 3600) * 1000,
  });
  return dados.access_token;
}

// ---------------------------------------------------------------------------
// HMAC
// ---------------------------------------------------------------------------

function paraHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function paraBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Assina exatamente a string recebida — nunca um objeto reserializado. */
async function assinarHmac(corpo: string): Promise<string> {
  const chave = Deno.env.get("CIELO_HMAC_KEY");
  if (!chave) {
    const err = new Error(
      "CIELO_HMAC_KEY nao configurada. A API do Extrato Eletronico exige o header X-Signature.",
    ) as Error & { code?: string };
    err.code = "HMAC_AUSENTE";
    throw err;
  }

  const algo = (Deno.env.get("CIELO_HMAC_ALGO") || "SHA-256").toUpperCase();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(chave),
    { name: "HMAC", hash: { name: algo } },
    false,
    ["sign"],
  );
  const assinatura = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(corpo));

  return (Deno.env.get("CIELO_HMAC_ENCODING") || "hex").toLowerCase() === "base64"
    ? paraBase64(assinatura)
    : paraHex(assinatura);
}

// ---------------------------------------------------------------------------
// Geracao dos links
// ---------------------------------------------------------------------------

interface ParamsLink {
  ambiente: Ambiente;
  merchantCode: string;
  tipoArquivo: string;
  processType: ProcessType;
  startDate: string;
  endDate: string;
}

async function gerarLinks(p: ParamsLink): Promise<unknown> {
  const fileType = FILE_TYPE[p.tipoArquivo];
  if (!fileType) {
    throw new Error(`tipo_arquivo "${p.tipoArquivo}" invalido (use 03, 04, 09, 15 ou 16).`);
  }

  const token = await obterToken(p.ambiente);

  // Serializa UMA vez: o mesmo texto vai para a assinatura e para o corpo.
  // Reserializar o objeto para enviar arriscaria uma string diferente da que
  // foi assinada, e a Cielo devolve 401 Invalid HMAC.
  const corpo = JSON.stringify({
    merchantCode: p.merchantCode,
    fileType,
    processType: p.processType,
    startDate: p.startDate,
    endDate: p.endDate,
  });

  const assinatura = await assinarHmac(corpo);
  const url = `${AMBIENTES[p.ambiente].host}${Deno.env.get("CIELO_EXTC_LINK_PATH") || LINK_PATH_PADRAO}`;

  console.log(`[cielo-extc] POST ${url} merchant=${p.merchantCode} fileType=${fileType}`);

  const res = await fetchCielo(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Signature": assinatura,
    },
    body: corpo,
  });

  const texto = await res.text();
  let payload: unknown;
  try { payload = JSON.parse(texto); } catch { payload = { raw: texto }; }

  if (!res.ok) {
    console.error(`[cielo-extc] link/generate ${res.status}:`, texto.slice(0, 400));
    const err = new Error(`Geracao de link falhou: ${res.status} ${texto.slice(0, 250)}`) as Error & {
      code?: string; status?: number;
    };
    err.status = res.status;
    // Codigos que a propria documentacao enumera, para nao devolver "erro 4xx".
    err.code = res.status === 401 ? "TOKEN_OU_HMAC_INVALIDO"
      : res.status === 400 ? "BODY_INVALIDO"
      : res.status === 422 ? "PARAMETROS_FORA_DAS_REGRAS"
      : "LINK_ERRO";
    throw err;
  }

  return payload;
}

/**
 * Varre a resposta atras das URLs de download.
 * O formato exato do retorno nao esta documentado, entao em vez de fixar um
 * caminho a busca e recursiva por qualquer string http(s) — assim uma mudanca
 * de nome de campo nao quebra a integracao.
 */
function extrairLinks(payload: unknown): Array<{ url: string; nome?: string }> {
  const achados: Array<{ url: string; nome?: string }> = [];

  const visitar = (no: unknown, contexto?: Record<string, unknown>) => {
    if (typeof no === "string") {
      if (/^https?:\/\//i.test(no)) {
        const nome = contexto
          ? String(contexto.fileName ?? contexto.name ?? contexto.arquivo ?? "") || undefined
          : undefined;
        achados.push({ url: no, nome });
      }
      return;
    }
    if (Array.isArray(no)) { for (const item of no) visitar(item, contexto); return; }
    if (no && typeof no === "object") {
      const obj = no as Record<string, unknown>;
      for (const v of Object.values(obj)) visitar(v, obj);
    }
  };

  visitar(payload);
  // Mesma URL pode aparecer em mais de um campo do payload.
  return [...new Map(achados.map((a) => [a.url, a])).values()];
}

async function baixarArquivo(url: string): Promise<Uint8Array> {
  const res = await fetchCielo(url, { method: "GET", headers: { Accept: "*/*" } });
  if (!res.ok) {
    const err = new Error(`Download falhou: ${res.status}`) as Error & { code?: string; status?: number };
    err.status = res.status;
    // Os links sao temporarios; 403/404 aqui costuma ser link expirado.
    err.code = res.status === 403 || res.status === 404 ? "LINK_EXPIRADO" : "DOWNLOAD_ERRO";
    throw err;
  }
  return new Uint8Array(await res.arrayBuffer());
}

function paraBase64Bytes(bytes: Uint8Array): string {
  let bin = "";
  // Fatiado para nao estourar o limite de argumentos do spread.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
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
        try {
          await obterToken(ambiente);
          const temHmac = Boolean(Deno.env.get("CIELO_HMAC_KEY"));
          resultado = temHmac
            ? { ok: true, status: "ATIVA", ambiente }
            : {
                ok: false, status: "SEM_HMAC", ambiente,
                error: "Token OK, mas CIELO_HMAC_KEY nao esta configurada — a geracao de links exige X-Signature.",
                error_code: "HMAC_AUSENTE",
              };
        } catch (e) {
          const err = e as Error & { code?: string; status?: number };
          resultado = {
            ok: false,
            status: err.code === "CREDENCIAIS_AUSENTES" ? "SEM_CREDENCIAIS" : "ERRO_TOKEN",
            ambiente, error: err.message, error_code: err.code || "TOKEN_ERRO", http_status: err.status,
          };
        }
        break;
      }

      case "gerar_links": {
        if (!body.merchant_code) throw new Error("merchant_code e obrigatorio");
        if (!body.tipo_arquivo) throw new Error("tipo_arquivo e obrigatorio (03, 04, 09, 15 ou 16)");
        const hoje = new Date().toISOString().slice(0, 10);
        resultado = await gerarLinks({
          ambiente,
          merchantCode: String(body.merchant_code),
          tipoArquivo: String(body.tipo_arquivo),
          processType: (body.process_type as ProcessType) || "D",
          startDate: String(body.start_date || body.data || hoje),
          endDate: String(body.end_date || body.data || hoje),
        });
        break;
      }

      case "baixar_extrato": {
        if (!body.estabelecimento_matriz && !body.merchant_code) {
          throw new Error("estabelecimento_matriz (ou merchant_code) e obrigatorio");
        }
        if (!body.tipo_arquivo) throw new Error("tipo_arquivo e obrigatorio (03, 04 ou 16)");

        const hoje = new Date().toISOString().slice(0, 10);
        const dataRef = String(body.data || hoje);
        const merchant = String(body.merchant_code || body.estabelecimento_matriz);
        const tipo = String(body.tipo_arquivo);

        const payload = await gerarLinks({
          ambiente,
          merchantCode: merchant,
          tipoArquivo: tipo,
          processType: (body.process_type as ProcessType) || "D",
          startDate: String(body.start_date || dataRef),
          endDate: String(body.end_date || dataRef),
        });

        const links = extrairLinks(payload);
        if (links.length === 0) {
          resultado = {
            arquivos: [],
            aviso: "A API respondeu, mas nenhum link de download foi encontrado no retorno.",
            resposta_bruta: payload,
          };
          break;
        }

        // Os links sao temporarios — baixa tudo agora, na mesma execucao.
        const arquivos: Array<{ nomeArquivo: string; conteudoBase64: string; bytes: number }> = [];
        const falhas: Array<{ url: string; error: string; error_code?: string }> = [];

        for (const [i, link] of links.entries()) {
          try {
            const bytes = await baixarArquivo(link.url);
            arquivos.push({
              nomeArquivo: link.nome
                || `CIELO${tipo}_${merchant}_${dataRef.replace(/-/g, "")}${links.length > 1 ? `_${i + 1}` : ""}.txt`,
              conteudoBase64: paraBase64Bytes(bytes),
              bytes: bytes.length,
            });
          } catch (e) {
            const err = e as Error & { code?: string };
            falhas.push({ url: link.url, error: err.message, error_code: err.code });
          }
        }

        resultado = { arquivos, falhas, total_links: links.length };
        break;
      }

      case "diagnostico": {
        const mtls = obterClienteMtls();
        resultado = {
          ambiente,
          host: AMBIENTES[ambiente].host,
          token_url: AMBIENTES[ambiente].tokenUrl,
          link_path: Deno.env.get("CIELO_EXTC_LINK_PATH") || LINK_PATH_PADRAO,
          tem_client_id: Boolean(Deno.env.get("CIELO_CLIENT_ID")),
          tem_client_secret: Boolean(Deno.env.get("CIELO_CLIENT_SECRET")),
          tem_hmac_key: Boolean(Deno.env.get("CIELO_HMAC_KEY")),
          hmac_algo: Deno.env.get("CIELO_HMAC_ALGO") || "SHA-256 (padrao)",
          hmac_encoding: Deno.env.get("CIELO_HMAC_ENCODING") || "hex (padrao)",
          mtls_em_uso: Boolean(mtls.client),
          mtls_motivo: mtls.motivo ?? null,
        };
        break;
      }

      default:
        throw new Error(
          `Action '${action}' nao suportada. Use: health, gerar_links, baixar_extrato, diagnostico`,
        );
    }

    return new Response(JSON.stringify(resultado), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const e = err as Error & { code?: string; status?: number };
    console.error("[cielo-extc] Error:", e);
    return new Response(
      JSON.stringify({ error: e.message, error_code: e.code || "CIELO_INTERNO", http_status: e.status }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
